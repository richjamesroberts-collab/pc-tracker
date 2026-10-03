import { describe, expect, it } from 'vitest';
import spells from './spells.json';
import classesJson from './classes.json';
import racesJson from './races.json';
import itemsJson from './items.json';
import gearJson from './gear.json';
import { CLASSES } from './classes';
import { RACES, raceLabel } from './races';
import { RESOURCES } from '../rules/features';
import {
	featureGroups,
	fillItemDetails,
	gearInventoryItem,
	inventoryItem,
	RARITIES,
	unpack,
	type ClassContent,
	type Content,
	type GearItem,
	type MagicItem,
	type RaceContent
} from './content';
import { parseRegain } from '../rules/items';
import raceAbilities from './race-abilities.json';
import { newCharacter } from '$lib/character';
import { armorClass, maxHp } from '../rules/stats';

const classes = classesJson as Record<string, ClassContent>;
const races = racesJson as RaceContent[];
const items = itemsJson as MagicItem[];
const gear = gearJson as GearItem[];
const gearById = new Map(gear.map((g) => [g.id, g]));

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

describe('bundled gear', () => {
	const find = (id: string) => gearById.get(id)!;

	it('has PHB equipment and DMG treasure with unique ids', () => {
		expect(gear.length).toBeGreaterThanOrEqual(250);
		expect(gearById.size).toBe(gear.length);
		expect(new Set(gear.map((g) => g.category))).toEqual(new Set(['weapon', 'armor', 'gear', 'pack', 'tool', 'treasure']));
	});
	it('describes weapons and armor', () => {
		expect(find('longsword|phb')).toMatchObject({ type: 'Martial melee weapon', weight: 3, value: 1500, stats: '1d8 slashing · Versatile (1d10)' });
		expect(find('studded leather armor|phb').stats).toBe('AC 12 + Dex');
		expect(find('chain mail|phb').stats).toBe('AC 16 · Str 13 · Stealth disadvantage');
	});
	it('folds bundles into a default quantity', () => {
		expect(gearById.has('arrows (20)|phb')).toBe(false);
		expect(find('arrow|phb').bundle).toBe(20);
		expect(gearInventoryItem(find('arrow|phb'))).toMatchObject({ kind: 'gear', quantity: 20, name: 'Arrow' });
	});
	it('unpacks equipment packs into their contents', () => {
		const items = unpack(find("explorer's pack|phb"), gearById);
		expect(items.map((i) => [i.name, i.quantity])).toContainEqual(['Torch', 10]);
		expect(items.every((i) => i.kind === 'gear' && i.ref)).toBe(true);
		const burglar = unpack(find("burglar's pack|phb"), gearById);
		expect(burglar.map((i) => [i.name, i.quantity])).toContainEqual(['Ball Bearing', 1000]);
		expect(burglar.find((i) => i.name === '10 feet of string')?.ref).toBeUndefined();
		for (const g of gear) for (const c of g.contents ?? []) if (c.ref) expect(gearById.has(c.ref), `${g.name}: ${c.ref}`).toBe(true);
	});
});

describe('item effects and armor', () => {
	const magicById = new Map(items.map((i) => [i.id, i]));
	it('copies effects and armor onto new inventory entries', () => {
		expect(inventoryItem(magicById.get('headband of intellect|dmg')!).effects).toEqual({ set: { int: 19 } });
		expect(inventoryItem(magicById.get('dwarven plate|dmg')!)).toMatchObject({ armor: { type: 'heavy', ac: 18 }, equipped: false, effects: { ac: 2 } });
		expect(gearInventoryItem(gearById.get('chain mail|phb')!)).toMatchObject({ armor: { type: 'heavy', ac: 16 }, effects: {} });
		expect(magicById.get('manual of gainful exercise|dmg')!.effects).toBeUndefined();
	});
	it('fills in entries added before effects were tracked', () => {
		const old = { ...inventoryItem(magicById.get('ring of protection|dmg')!), effects: undefined };
		const shield = { ...gearInventoryItem(gearById.get('shield|phb')!), effects: undefined, armor: undefined, equipped: undefined };
		const c = { ...newCharacter(), items: [old, shield] };
		expect(fillItemDetails(c, magicById, gearById)).toBe(true);
		expect(c.items[0].effects).toEqual({ ac: 1 });
		expect(c.items[1]).toMatchObject({ armor: { type: 'shield', ac: 2 }, equipped: false, effects: {} });
		expect(fillItemDetails(c, magicById, gearById)).toBe(false);
	});
	it("doesn't change the AC or max HP shown when filling in attuned items", () => {
		const ring = { ...inventoryItem(magicById.get('ring of protection|dmg')!), attuned: true, effects: undefined };
		const amulet = { ...inventoryItem(magicById.get('amulet of health|dmg')!), attuned: true, effects: undefined };
		const c = { ...newCharacter(), level: 4, acAuto: false, acBase: 17, hpBase: 40, items: [ring, amulet] };
		fillItemDetails(c, magicById, gearById);
		expect(armorClass(c).total).toBe(17);
		expect(maxHp(c).total).toBe(40);
		expect(c.acBase).toBe(16);
		c.items[0].attuned = false;
		expect(armorClass(c).total).toBe(16);
	});
	it('has racial increases for every race', () => {
		for (const r of RACES) expect((raceAbilities as Record<string, unknown>)[r.key], r.key).toBeDefined();
	});
});
