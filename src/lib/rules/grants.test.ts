import { describe, expect, it } from 'vitest';
import { newCharacter } from '$lib/character';
import spells from '$lib/data/spells.json';
import grantsJson from '$lib/data/spell-grants.json';
import { CLASSES } from '$lib/data/classes';
import type { Character } from '$lib/types';
import {
	canSwapTo,
	expandedBy,
	filterLabel,
	grantChoices,
	grantedIds,
	grantedSpells,
	grantsFor,
	newGrantChoices,
	newGrants,
	pickedSpells,
	schoolLimit,
	swappable,
	variantPicks,
	type SpellGrant
} from './grants';
import { applyChoices, levelUpNeeds } from './levelup';

function pc(overrides: Partial<Character> = {}): Character {
	return { ...newCharacter(), classKey: 'sorcerer', ...overrides };
}

const names = (c: Character) => grantedSpells(c).map((s) => s.name);
const spell = (id: string) => spells.find((s) => s.id === id)!;

describe('spell grant data', () => {
	const grants = grantsJson as Record<string, SpellGrant[]>;
	const ids = new Set(spells.map((s) => s.id));

	it('only names bundled spells', () => {
		for (const list of Object.values(grants)) for (const g of list) for (const s of g.spells) expect(ids, `${g.name}: ${s.id}`).toContain(s.id);
	});

	it('is keyed by our class and subclass keys', () => {
		for (const owner of Object.keys(grants)) {
			if (owner.startsWith('option:') || owner.startsWith('style:')) continue;
			const [classKey, subKey] = owner.split('/');
			const cls = CLASSES.find((c) => c.key === classKey);
			expect(cls, owner).toBeTruthy();
			if (subKey) expect(cls!.subclasses.some((s) => s.key === subKey), owner).toBe(true);
		}
	});

	it('covers every cleric domain, paladin oath and artificer specialist', () => {
		for (const classKey of ['cleric', 'paladin', 'artificer']) {
			for (const sub of CLASSES.find((c) => c.key === classKey)!.subclasses) {
				expect(grantsFor({ classKey, subclassKey: sub.key, level: 20 }).some((g) => g.mode === 'prepared'), `${classKey}/${sub.key}`).toBe(true);
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
		expect(variantPicks(pc({ classKey: 'druid', subclassKey: 'land', level: 2 }))).toEqual([
			{ owner: 'druid/land', label: 'Land', variants: ['Arctic', 'Coast', 'Desert', 'Forest', 'Grassland', 'Mountain', 'Swamp', 'Underdark'] }
		]);
		const arctic = pc({ classKey: 'druid', subclassKey: 'land', level: 3, grantVariants: { 'druid/land': 'Arctic' } });
		expect(names(arctic)).toEqual(['Hold Person', 'Spike Growth']);
		expect(grantChoices(arctic).map((ch) => [ch.count, ch.filter])).toEqual([[1, { levels: [0], classes: ['druid'] }]]);
		const good = pc({ subclassKey: 'divine-soul', level: 1, grantVariants: { 'sorcerer/divine-soul': 'Good' } });
		expect(names(good)).toEqual(['Cure Wounds']);
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

describe('grant choices', () => {
	it('offers a domain cantrip, kept free once picked', () => {
		const nature = pc({ classKey: 'cleric', subclassKey: 'nature', level: 1 });
		const [ch] = grantChoices(nature);
		expect(ch).toMatchObject({ count: 1, filter: { levels: [0], classes: ['druid'] }, picked: [] });
		const picked = { ...nature, spells: [{ id: 'shillelagh|phb', prepared: true, grant: ch.key }, { id: 'guidance|phb', prepared: true }] };
		expect(grantChoices(picked)[0].picked).toEqual(['shillelagh|phb']);
		expect(grantedIds(picked).has('shillelagh|phb')).toBe(true);
		expect(pickedSpells(picked, picked.spells).map((s) => s.id)).toEqual(['guidance|phb']);
	});

	it('comes from a pact boon or fighting style', () => {
		const tome = pc({ classKey: 'warlock', level: 3, classOptions: [{ ref: 'pact of the tome|phb', name: 'Pact of the Tome', kind: 'pact-boon' }] });
		expect(grantChoices(tome).map((ch) => [ch.grant.name, ch.count, ch.filter])).toEqual([['Book of Shadows', 3, { levels: [0] }]]);
		const paladin = pc({ classKey: 'paladin', level: 2, fightingStyles: ['blessed-warrior'] });
		expect(grantChoices(paladin).map((ch) => [ch.count, ch.filter])).toEqual([[2, { levels: [0], classes: ['cleric'] }]]);
		expect(newGrantChoices(pc({ classKey: 'paladin', level: 1 }), paladin)).toHaveLength(1);
	});

	it('takes Magical Secrets out of the new spells, and counts them', () => {
		const bard = pc({ classKey: 'bard', level: 9, spellMod: 3 });
		const next = { ...bard, level: 10 };
		expect(levelUpNeeds(bard, next).spells).toBe(0);
		expect(levelUpNeeds({ ...bard, level: 8 }, bard).spells).toBe(1);
		const [secrets] = newGrantChoices(bard, next);
		expect(secrets).toMatchObject({ count: 2, filter: { levels: [0, 1, 2, 3, 4, 5] } });
		const withPick = { ...next, spells: [{ id: 'fireball|phb', prepared: true, grant: secrets.key }] };
		expect(grantedSpells(withPick).map((s) => s.id)).toEqual(['fireball|phb']);
		expect(grantedIds(withPick).size).toBe(0);
	});

	it('offers Arcane Archer one of two cantrips', () => {
		const [ch] = grantChoices(pc({ classKey: 'fighter', subclassKey: 'arcane-archer', level: 3 }));
		expect(ch.filter).toEqual({ ids: ['prestidigitation|phb', 'druidcraft|phb'] });
		expect(filterLabel(ch.filter, (id) => spell(id).name)).toBe('Prestidigitation or Druidcraft');
	});

	it('describes what a choice asks for', () => {
		expect(filterLabel({ levels: [0], classes: ['druid'] })).toBe('Druid cantrip');
		expect(filterLabel({ levels: [6], classes: ['wizard'] })).toBe('Wizard 6th-level spell');
		expect(filterLabel({ levels: [0, 1, 2, 3] })).toBe('cantrip or spell up to 3rd level, any class');
		expect(filterLabel({})).toBe('spell of any level, any class');
	});

	it('applies picks and list choices from a level up', () => {
		const c = pc({ classKey: 'cleric', subclassKey: 'nature', level: 1, spells: [{ id: 'druidcraft|phb', prepared: true }] });
		const key = grantChoices(c)[0].key;
		applyChoices(c, { hp: 0, grantSpells: { [key]: ['druidcraft|phb'] } }, 1);
		expect(c.spells).toEqual([{ id: 'druidcraft|phb', prepared: true, grant: key }]);
		const druid = pc({ classKey: 'druid', subclassKey: 'land', level: 2 });
		applyChoices(druid, { hp: 0, grantVariants: { 'druid/land': 'Coast' } }, 2);
		expect(druid.grantVariants).toEqual({ 'druid/land': 'Coast' });
	});
});

describe('expanded lists', () => {
	it('adds patron spells as the warlock reaches their level', () => {
		const fiend = pc({ classKey: 'warlock', subclassKey: 'fiend', level: 4 });
		expect(expandedBy(fiend, spell('burning hands|phb'))?.tag).toBe('Patron');
		expect(expandedBy(fiend, spell('fireball|phb'))).toBeUndefined();
		expect(expandedBy({ ...fiend, level: 5 }, spell('fireball|phb'))).toBeTruthy();
	});

	it("adds the cleric list for a Divine Soul, and these count", () => {
		const c = pc({ subclassKey: 'divine-soul', level: 3, grantVariants: { 'sorcerer/divine-soul': 'Law' } });
		expect(expandedBy(c, spell('spiritual weapon|phb'))?.free).toBe(false);
		expect(expandedBy(c, spell('spirit guardians|phb'))).toBeUndefined();
	});
});

describe('subclass spell swaps', () => {
	it('trades a psionic spell for a divination or enchantment one of the same level', () => {
		const c = pc({ subclassKey: 'aberrant-mind', level: 3 });
		const arms = swappable(c).find((x) => x.id === 'arms of hadar|phb')!;
		expect(canSwapTo(arms.grant, spell('arms of hadar|phb'), spell('charm person|phb'))).toBe(true);
		expect(canSwapTo(arms.grant, spell('arms of hadar|phb'), spell('magic missile|phb'))).toBe(false);
		expect(canSwapTo(arms.grant, spell('arms of hadar|phb'), spell('suggestion|phb'))).toBe(false);
		applyChoices(c, { hp: 0, grantSwap: { grant: arms.grant.key, original: arms.original, to: 'charm person|phb' } }, 4);
		const ids = grantedSpells(c).map((s) => s.id);
		expect(ids).toContain('charm person|phb');
		expect(ids).not.toContain('arms of hadar|phb');
		expect(grantedIds(c).has('charm person|phb')).toBe(true);
		// Trading the swapped-in spell again replaces it, still standing for Arms of Hadar.
		applyChoices(c, { hp: 0, grantSwap: { grant: arms.grant.key, original: arms.original, to: 'sleep|phb' } }, 5);
		expect(c.spells).toEqual([{ id: 'sleep|phb', prepared: true, grant: arms.grant.key, replaces: 'arms of hadar|phb' }]);
	});
});

describe('school limits', () => {
	it('allows one spell from any school at 3rd, 8th, 14th and 20th level', () => {
		expect(schoolLimit(pc({ classKey: 'fighter', subclassKey: 'eldritch-knight', level: 2 }))).toBeNull();
		expect(schoolLimit(pc({ classKey: 'fighter', subclassKey: 'eldritch-knight', level: 8 }))).toEqual({ schools: ['Abjuration', 'Evocation'], anyMax: 2 });
		expect(schoolLimit(pc({ classKey: 'rogue', subclassKey: 'arcane-trickster', level: 20 }))?.anyMax).toBe(4);
		expect(schoolLimit(pc({ classKey: 'wizard', level: 20 }))).toBeNull();
	});
});
