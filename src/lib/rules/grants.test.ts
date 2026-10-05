import { describe, expect, it } from 'vitest';
import { newCharacter } from '$lib/character';
import spells from '$lib/data/spells.json';
import grantsJson from '$lib/data/spell-grants.json';
import { CLASSES } from '$lib/data/classes';
import { RACES } from '$lib/data/races';
import optionsJson from '$lib/data/options.json';
import featsJson from '$lib/data/feats.json';
import { FIGHTING_STYLE_MAP } from './attacks';
import type { Character } from '$lib/types';
import {
	canSwapTo,
	expandedBy,
	castSummary,
	filterLabel,
	grantCastOptions,
	grantChoices,
	grantedIds,
	grantedSpells,
	grantsFor,
	newGrantChoices,
	newGrants,
	pickedSpells,
	schoolLimit,
	shortRestCasts,
	slotsAllowed,
	spendCast,
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

	it('is keyed by our class, subclass, option, fighting style, feat and race keys', () => {
		const optionIds = new Set(optionsJson.map((o) => o.id));
		const featIds = new Set(featsJson.map((f) => f.id));
		for (const owner of Object.keys(grants)) {
			const [kind, key] = owner.includes(':') ? owner.split(/:(.*)/) : ['class', owner];
			if (kind === 'option') expect(optionIds, owner).toContain(key);
			else if (kind === 'style') expect(FIGHTING_STYLE_MAP.has(key), owner).toBe(true);
			else if (kind === 'feat') expect(featIds, owner).toContain(key);
			else if (kind === 'race') expect(RACES.some((r) => r.key === key), owner).toBe(true);
			else if (kind === 'subrace') {
				const [race, sub] = key.split('/');
				expect(RACES.find((r) => r.key === race)?.subraces?.some((s) => s.key === sub), owner).toBe(true);
			} else {
				const [classKey, subKey] = key.split('/');
				const cls = CLASSES.find((c) => c.key === classKey);
				expect(cls, owner).toBeTruthy();
				if (subKey) expect(cls!.subclasses.some((s) => s.key === subKey), owner).toBe(true);
			}
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

describe('casting granted spells', () => {
	const options = (c: Character, id: string) => grantCastOptions(c, spell(id)).map((o) => [o.label, o.detail, o.left, o.level]);
	const find = (c: Character, id: string) => grantedSpells(c).find((g) => g.id === id)!;

	it('casts psionic spells for sorcery points from 6th level', () => {
		expect(options(pc({ subclassKey: 'aberrant-mind', level: 5 }), 'arms of hadar|phb')).toEqual([]);
		const c = pc({ subclassKey: 'aberrant-mind', level: 6 });
		expect(options(c, 'hunger of hadar|phb')).toEqual([['3 sorcery points', 'No verbal or somatic components', 1, 3]]);
		const [o] = grantCastOptions(c, spell('hunger of hadar|phb'));
		expect(spendCast(c, o.spend)).toBe(true);
		expect(c.sorceryPointsUsed).toBe(3);
		expect(slotsAllowed(c, find(c, 'hunger of hadar|phb'))).toBe(true);
	});

	it('casts a Shadow sorcerer’s Darkness for 2 sorcery points', () => {
		expect(options(pc({ subclassKey: 'shadow', level: 3 }), 'darkness|phb')).toEqual([['2 sorcery points', 'You can see through it', 1, 2]]);
	});

	it('casts invocations at will or once a day with a pact slot', () => {
		const armor = { ref: 'armor of shadows|phb', name: 'Armor of Shadows', kind: 'invocation' as const };
		const whispers = { ref: 'bewitching whispers|phb', name: 'Bewitching Whispers', kind: 'invocation' as const };
		const c = pc({ classKey: 'warlock', level: 7, classOptions: [armor, whispers] });
		expect(options(c, 'mage armor|phb')).toEqual([['At will', '', 1, 1]]);
		expect(slotsAllowed(c, find(c, 'mage armor|phb'))).toBe(false);
		const [pact] = grantCastOptions(c, spell('compulsion|phb'));
		expect([pact.label, pact.left, pact.level]).toEqual(['Pact slot (4th)', 1, 4]);
		expect(spendCast(c, pact.spend)).toBe(true);
		expect(c.pactSlotsUsed).toBe(1);
		expect(grantCastOptions(c, spell('compulsion|phb'))[0].left).toBe(0);
		expect(spendCast(c, pact.spend)).toBe(false);
	});

	it('uses the race’s own counter for racial spells', () => {
		const c = pc({ classKey: 'fighter', raceKey: 'tiefling', level: 5 });
		expect(names(c)).toEqual(['Thaumaturgy', 'Hellish Rebuke', 'Darkness']);
		expect(options(c, 'hellish rebuke|phb')).toEqual([['Free', '1 / long rest', 1, 2]]);
		const [o] = grantCastOptions(c, spell('hellish rebuke|phb'));
		expect(spendCast(c, o.spend)).toBe(true);
		expect(c.resourcesUsed['hellish-rebuke']).toBe(1);
		expect(grantCastOptions(c, spell('hellish rebuke|phb'))[0].left).toBe(0);
		// MPMM races: 5etools says at will, the race's counter says once per long rest.
		const genasi = pc({ classKey: 'fighter', raceKey: 'genasi', subraceKey: 'earth', level: 5 });
		expect(options(genasi, 'pass without trace|phb')[0]).toEqual(['Free', '1 / long rest', 1, 2]);
		expect(castSummary(genasi, find(genasi, 'pass without trace|phb'))).toBe('1 / long rest');
	});

	it('casts ki spells, at a higher level for more ki', () => {
		const shadow = pc({ classKey: 'monk', subclassKey: 'shadow', level: 5 });
		expect(options(shadow, 'darkness|phb')).toEqual([['2 ki', '', 1, 2]]);
		const thunders = { ref: 'fist of four thunders|phb', name: 'Fist of Four Thunders', kind: 'discipline' as const };
		const monk = pc({ classKey: 'monk', subclassKey: 'four-elements', level: 9, classOptions: [thunders] });
		expect(options(monk, 'thunderwave|phb')).toEqual([
			['2 ki', '', 1, 1],
			['3 ki', '2nd level', 1, 2],
			['4 ki', '3rd level', 1, 3]
		]);
		const [, , four] = grantCastOptions(monk, spell('thunderwave|phb'));
		expect(spendCast(monk, four.spend)).toBe(true);
		expect(monk.resourcesUsed.ki).toBe(4);
	});

	it('gives free casts that come back on a short rest, shared where the feature says', () => {
		const c = pc({ classKey: 'barbarian', subclassKey: 'ancestral', level: 10 });
		const [augury] = grantCastOptions(c, spell('augury|phb'));
		expect(spendCast(c, augury.spend)).toBe(true);
		expect(grantCastOptions(c, spell('clairvoyance|phb'))[0].left).toBe(0);
		shortRestCasts(c);
		expect(grantCastOptions(c, spell('clairvoyance|phb'))[0].left).toBe(1);
	});

	it('gives Primal Awareness spells a free cast and slots too', () => {
		const c = pc({ classKey: 'ranger', level: 5 });
		expect(options(c, 'beast sense|phb')).toEqual([['Free', '1 / long rest', 1, 2]]);
		expect(slotsAllowed(c, find(c, 'beast sense|phb'))).toBe(true);
		expect(castSummary(c, find(c, 'beast sense|phb'))).toBe('1 / long rest');
	});

	it('lets TCE feat spells use slots, and counts a feat spell also picked normally', () => {
		const fey = { id: 'f', ref: 'fey touched|tce', name: 'Fey Touched' };
		const c = pc({ level: 4, feats: [fey], spells: [{ id: 'misty step|phb', prepared: true }] });
		expect(options(c, 'misty step|phb')).toEqual([['Free', '1 / long rest', 1, 2]]);
		expect(slotsAllowed(c, find(c, 'misty step|phb'))).toBe(true);
		expect(grantedIds(c).has('misty step|phb')).toBe(false);
		expect(grantChoices(c).map((ch) => ch.filter)).toEqual([{ levels: [1], schools: ['Enchantment', 'Divination'] }]);
	});

	it('asks which class a Magic Initiate feat draws from', () => {
		const mi = { id: 'f', ref: 'magic initiate|phb', name: 'Magic Initiate' };
		const c = pc({ classKey: 'fighter', level: 4, feats: [mi] });
		expect(variantPicks(c)[0]).toMatchObject({ owner: 'feat:magic initiate|phb', label: 'Magic Initiate class' });
		const wizard = { ...c, grantVariants: { 'feat:magic initiate|phb': 'Wizard Spells' } };
		expect(grantChoices(wizard).map((ch) => [ch.count, ch.filter, ch.cast])).toEqual([
			[2, { levels: [0], classes: ['wizard'] }, undefined],
			[1, { levels: [1], classes: ['wizard'] }, [{ kind: 'rest', per: 'long', uses: 1 }]]
		]);
	});

	it('gives a wizard Spell Mastery and Signature Spells to pick', () => {
		expect(grantChoices(pc({ classKey: 'wizard', level: 17 }))).toEqual([]);
		const c = pc({ classKey: 'wizard', level: 20 });
		expect(grantChoices(c).map((ch) => [ch.grant.name, ch.count, ch.filter.levels])).toEqual([
			['Spell Mastery', 1, [1]],
			['Spell Mastery', 1, [2]],
			['Signature Spells', 2, [3]]
		]);
	});
});
