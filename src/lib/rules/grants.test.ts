import { describe, expect, it } from 'vitest';
import { newCharacter } from '$lib/character';
import spells from '$lib/data/spells.json';
import grantsJson from '$lib/data/spell-grants.json';
import { CLASSES } from '$lib/data/classes';
import type { Character } from '$lib/types';
import { grantedIds, grantedSpells, grantsFor, newGrants, pickedSpells, type SpellGrant } from './grants';

function pc(overrides: Partial<Character> = {}): Character {
	return { ...newCharacter(), classKey: 'sorcerer', ...overrides };
}

const names = (c: Character) => grantedSpells(c).map((s) => s.name);

describe('spell grant data', () => {
	const grants = grantsJson as Record<string, SpellGrant[]>;
	const ids = new Set(spells.map((s) => s.id));

	it('only names bundled spells', () => {
		for (const list of Object.values(grants)) for (const g of list) for (const s of g.spells) expect(ids, `${g.name}: ${s.id}`).toContain(s.id);
	});

	it('is keyed by our class and subclass keys', () => {
		for (const owner of Object.keys(grants)) {
			const [classKey, subKey] = owner.split('/');
			const cls = CLASSES.find((c) => c.key === classKey);
			expect(cls, owner).toBeTruthy();
			if (subKey) expect(cls!.subclasses.some((s) => s.key === subKey), owner).toBe(true);
		}
	});

	it('covers every cleric domain, paladin oath and artificer specialist', () => {
		for (const classKey of ['cleric', 'paladin', 'artificer']) {
			for (const sub of CLASSES.find((c) => c.key === classKey)!.subclasses) {
				expect(grantsFor({ classKey, subclassKey: sub.key }).some((g) => g.mode === 'prepared'), `${classKey}/${sub.key}`).toBe(true);
			}
		}
	});
});

describe('granted spells', () => {
	it('gives Aberrant Mind psionic spells by sorcerer level', () => {
		const c = pc({ subclassKey: 'aberrant-mind', level: 3 });
		expect(names(c)).toEqual(['Arms of Hadar', 'Dissonant Whispers', 'Mind Sliver', 'Calm Emotions', 'Detect Thoughts']);
		expect(grantedSpells(c).every((s) => s.grant.tag === 'Psionic' && s.grant.mode === 'known')).toBe(true);
		// Ten spells plus the Mind Sliver cantrip.
		expect(grantedSpells(pc({ subclassKey: 'aberrant-mind', level: 9 }))).toHaveLength(11);
	});

	it('gives domain spells as always prepared', () => {
		const c = pc({ classKey: 'cleric', subclassKey: 'life', level: 3 });
		expect(names(c)).toEqual(['Bless', 'Cure Wounds', 'Lesser Restoration', 'Spiritual Weapon']);
		expect(grantedSpells(c)[0].grant).toMatchObject({ name: 'Domain Spells', tag: 'Domain', mode: 'prepared' });
	});

	it('gives oath spells from 3rd level', () => {
		expect(names(pc({ classKey: 'paladin', subclassKey: 'devotion', level: 2 }))).toEqual([]);
		expect(names(pc({ classKey: 'paladin', subclassKey: 'devotion', level: 3 }))).toEqual(['Protection from Evil and Good', 'Sanctuary']);
	});

	it('gives every ranger Primal Awareness, plus subclass magic', () => {
		expect(names(pc({ classKey: 'ranger', level: 2 }))).toEqual([]);
		expect(names(pc({ classKey: 'ranger', level: 5 }))).toEqual(['Speak with Animals', 'Beast Sense']);
		const gloom = grantedSpells(pc({ classKey: 'ranger', subclassKey: 'gloom-stalker', level: 3 }));
		expect(gloom.map((s) => [s.name, s.grant.tag])).toEqual([
			['Speak with Animals', 'Primal'],
			['Disguise Self', 'Gloom Stalker']
		]);
	});

	it("gives an Arcane Trickster Mage Hand", () => {
		expect(names(pc({ classKey: 'rogue', subclassKey: 'arcane-trickster', level: 3 }))).toEqual(['Mage Hand']);
	});

	it('waits for a pick before giving a variant list', () => {
		expect(grantedSpells(pc({ classKey: 'druid', subclassKey: 'land', level: 5 }))).toEqual([]);
		expect(grantedSpells(pc({ subclassKey: 'divine-soul', level: 1 }))).toEqual([]);
	});

	it('gives nothing without a subclass that grants spells', () => {
		expect(grantedSpells(pc({ subclassKey: 'draconic', level: 10 }))).toEqual([]);
		expect(grantedSpells(pc({ classKey: 'wizard', level: 10 }))).toEqual([]);
	});

	it('leaves granted spells out of what counts', () => {
		const c = pc({ subclassKey: 'aberrant-mind', level: 1 });
		const picked = [{ id: 'arms of hadar|phb' }, { id: 'shield|phb' }];
		expect(grantedIds(c).has('arms of hadar|phb')).toBe(true);
		expect(pickedSpells(c, picked)).toEqual([{ id: 'shield|phb' }]);
	});

	it('lists what a level adds', () => {
		const prev = pc({ subclassKey: 'clockwork-soul', level: 4 });
		expect(newGrants(prev, { ...prev, level: 5 })).toEqual([{ name: 'Clockwork Magic', spells: ['Dispel Magic', 'Protection from Energy'] }]);
		expect(newGrants(pc({ classKey: 'cleric', level: 1 }), pc({ classKey: 'cleric', subclassKey: 'life', level: 1 }))).toEqual([
			{ name: 'Domain Spells', spells: ['Bless', 'Cure Wounds'] }
		]);
	});
});
