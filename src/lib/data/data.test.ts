import { describe, expect, it } from 'vitest';
import spells from './spells.json';
import classesJson from './classes.json';
import racesJson from './races.json';
import itemsJson from './items.json';
import { CLASSES } from './classes';
import { RACES, raceLabel } from './races';
import { RESOURCES } from '../rules/features';
import { featureGroups, inventoryItem, RARITIES, type ClassContent, type Content, type MagicItem, type RaceContent } from './content';
import { parseRegain } from '../rules/items';

const classes = classesJson as Record<string, ClassContent>;
const races = racesJson as RaceContent[];
const items = itemsJson as MagicItem[];

describe('bundled spells', () => {
	it('has every PHB/XGE/TCE spell', () => {
		expect(spells.length).toBeGreaterThanOrEqual(477);
		const sources = new Set(spells.map((s) => s.source));
		expect([...sources].sort()).toEqual(['PHB', 'TCE', 'XGE']);
	});
	it('keeps PHB ids so existing characters still resolve', () => {
		expect(spells.find((s) => s.id === "bigby's hand|phb")?.name).toBe("Bigby's Hand");
		expect(spells.some((s) => s.id === 'toll the dead|xge')).toBe(true);
	});
});

describe('class and race content', () => {
	it('has features for every class and subclass key', () => {
		for (const cls of CLASSES) {
			expect(classes[cls.key]?.features.length, cls.key).toBeGreaterThan(0);
			for (const s of cls.subclasses) expect(classes[cls.key].subclasses[s.key]?.length, `${cls.key}/${s.key}`).toBeGreaterThan(0);
		}
	});
	it('marks TCE optional class features', () => {
		expect(classes.barbarian.features.find((f) => f.name === 'Primal Knowledge')?.optional).toBe(true);
		expect(classes.barbarian.features.find((f) => f.name === 'Rage')?.optional).toBeUndefined();
	});
	it('inlines optional feature rules text', () => {
		const text = classes.fighter.subclasses['battle-master'].map((f) => f.text).join('\n');
		expect(text).toMatch(/• Riposte\. .*reaction/);
	});
	it('drops subclass placeholder rows but keeps the subclass choice', () => {
		const names = classes.barbarian.features.map((f) => f.name.toLowerCase());
		expect(names).toContain('primal path');
		expect(names).not.toContain('path feature');
	});
	it('generates ability score increase and speed traits', () => {
		const trait = (key: string, name: string, sub?: string) => {
			const race = races.find((r) => r.key === key)!;
			const list = sub ? race.subraces.find((s) => s.key === sub)!.traits : race.traits;
			return list.filter((t) => t.name === name);
		};
		expect(trait('dwarf', 'Ability Score Increase')[0].text).toContain('Constitution');
		expect(trait('dwarf', 'Speed')).toHaveLength(1);
		expect(trait('dwarf', 'Speed')[0].text).toContain('25 feet');
		expect(trait('human', 'Speed')[0].text).toContain('30 feet');
		expect(trait('human', 'Ability Score Increase', 'variant')).toHaveLength(1);
	});
	it('every race and subrace key exists in races.json', () => {
		for (const r of RACES) {
			const data = races.find((x) => x.key === r.key);
			expect(data, r.key).toBeDefined();
			for (const s of r.subraces)
				expect(
					data!.subraces.some((x) => x.key === s.key),
					`${r.key}/${s.key}`
				).toBe(true);
		}
	});
	it('labels races', () => {
		expect(raceLabel({ raceKey: 'elf', subraceKey: 'high' })).toBe('High Elf');
		expect(raceLabel({ raceKey: 'dragonborn', subraceKey: 'red' })).toBe('Red Dragonborn');
		expect(raceLabel({ raceKey: 'tiefling' })).toBe('Tiefling');
		expect(raceLabel({})).toBe('');
	});
	it('groups features up to the character level', () => {
		const g = featureGroups({ classes, races } as Content, {
			raceKey: 'dwarf',
			subraceKey: 'hill',
			classKey: 'fighter',
			subclassKey: 'champion',
			level: 3
		});
		expect(g.map((x) => x.title)).toEqual(['Dwarf', 'Hill Dwarf', 'Fighter', 'Champion']);
		expect(g.map((x) => x.kind)).toEqual(['race', 'subrace', 'class', 'subclass']);
		expect(g[2].features.some((f) => f.name === 'Action Surge')).toBe(true);
		expect(g[2].features.some((f) => f.name === 'Extra Attack')).toBe(false);
	});
});

describe('resource owners', () => {
	it('every ResourceDef.owner key exists', () => {
		for (const def of RESOURCES) {
			const { kind, key } = def.owner;
			const [a, b] = key.split('/');
			const label = `${def.key} -> ${kind}:${key}`;
			if (kind === 'class') expect(CLASSES.some((c) => c.key === key), label).toBe(true);
			else if (kind === 'subclass') expect(CLASSES.find((c) => c.key === a)?.subclasses.some((x) => x.key === b), label).toBe(true);
			else if (kind === 'race') expect(RACES.some((r) => r.key === key), label).toBe(true);
			else expect(RACES.find((r) => r.key === a)?.subraces.some((x) => x.key === b), label).toBe(true);
		}
	});
});

describe('bundled magic items', () => {
	it('has DMG, XGE and TCE magic items with unique ids', () => {
		expect(items.length).toBeGreaterThanOrEqual(500);
		expect([...new Set(items.map((i) => i.source))].sort()).toEqual(['DMG', 'TCE', 'XGE']);
		expect(new Set(items.map((i) => i.id)).size).toBe(items.length);
		for (const i of items) expect(['', ...RARITIES], i.name).toContain(i.rarity);
	});
	it('includes generic variants with their text filled in', () => {
		const weapon = items.find((i) => i.id === '+1 weapon|dmg');
		expect(weapon?.type).toBe('Weapon (any)');
		expect(weapon?.text).toContain('+1 bonus to attack and damage');
		expect(items.find((i) => i.id === 'armor of fire resistance|dmg')?.text).toContain('resistance to fire damage');
		expect(items.find((i) => i.id === 'flame tongue|dmg')?.attunement).toBe('');
	});
	it('has charges and readable dawn regains', () => {
		const wand = items.find((i) => i.id === 'wand of magic missiles|dmg')!;
		expect(wand).toMatchObject({ charges: 7, regain: '1d6 + 1' });
		for (const i of items.filter((x) => x.regain)) expect(parseRegain(i.regain!), i.name).not.toBeNull();
		expect(inventoryItem(wand)).toMatchObject({ ref: wand.id, name: wand.name, charges: { max: 7, used: 0, regain: '1d6 + 1' } });
	});
	it('records who can attune', () => {
		expect(items.find((i) => i.id === 'staff of healing|dmg')?.attunement).toBe('by a bard, cleric, or druid');
		expect(items.find((i) => i.id === 'bag of holding|dmg')?.attunement).toBeUndefined();
	});
});
