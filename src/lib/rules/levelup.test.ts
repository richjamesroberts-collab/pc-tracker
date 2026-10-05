import { describe, expect, it } from 'vitest';
import { newCharacter } from '$lib/character';
import type { FeatData } from '$lib/data/content';
import type { Character } from '$lib/types';
import { applyChoices, applyLevelUp, hasChoices, isAsiLevel, levelUpChanges, levelUpNeeds, optionCount, startingHp, subclassLevel, weaponPicks } from './levelup';
import { recompute } from './stats';
import { hpGain } from './xp';

function pc(overrides: Partial<Character> = {}): Character {
	return recompute({ ...newCharacter(), name: 'Lyra', classKey: 'fighter', level: 3, hpBase: 28, hpCurrent: 28, ...overrides });
}

/** The character one level up, with a subclass if one is picked. */
const up = (c: Character, subclassKey = c.subclassKey) => recompute({ ...structuredClone(c), level: c.level + 1, subclassKey });

const feat = (o: Partial<FeatData>): FeatData => ({ id: 'test|phb', name: 'Test', source: 'PHB', text: '', ...o });

describe('level up needs', () => {
	it('asks for a subclass when one is due and missing', () => {
		expect(subclassLevel('cleric')).toBe(1);
		expect(subclassLevel('wizard')).toBe(2);
		expect(subclassLevel('rogue')).toBe(3);
		const rogue = pc({ classKey: 'rogue', level: 2 });
		expect(levelUpNeeds(rogue, up(rogue)).subclass).toBe(true);
		expect(levelUpNeeds(rogue, up(rogue, 'thief')).subclass).toBe(false);
		const early = pc({ classKey: 'rogue', level: 1 });
		expect(levelUpNeeds(early, up(early)).subclass).toBe(false);
	});

	it('offers an Ability Score Improvement at the right levels', () => {
		expect([4, 8, 12, 16, 19].every((l) => isAsiLevel('wizard', l))).toBe(true);
		expect(isAsiLevel('wizard', 6)).toBe(false);
		expect(isAsiLevel('fighter', 6)).toBe(true);
		expect(isAsiLevel('fighter', 14)).toBe(true);
		expect(isAsiLevel('rogue', 10)).toBe(true);
		expect(isAsiLevel('fighter', 10)).toBe(false);
	});

	it('counts expertise, fighting styles and metamagic', () => {
		const rogue = pc({ classKey: 'rogue', subclassKey: 'thief', level: 5 });
		expect(levelUpNeeds(rogue, up(rogue)).expertise).toBe(2);
		const champion = pc({ subclassKey: 'champion', level: 9, fightingStyles: ['defense'] });
		expect(levelUpNeeds(champion, up(champion)).fightingStyles).toBe(2);
		const paladin = pc({ classKey: 'paladin', level: 1 });
		expect(levelUpNeeds(paladin, up(paladin)).fightingStyles).toBe(1);
		const sorc = pc({ classKey: 'sorcerer', subclassKey: 'draconic', level: 9, metamagic: ['quickened', 'twinned'] });
		expect(levelUpNeeds(sorc, up(sorc)).metamagic).toBe(3);
		const sorc3 = pc({ classKey: 'sorcerer', subclassKey: 'draconic', level: 2 });
		expect(levelUpNeeds(sorc3, up(sorc3)).metamagic).toBe(2);
	});

	it('grows option lists with the class tables', () => {
		const blade = { ref: 'pact of the blade|phb', name: 'Pact of the Blade', kind: 'pact-boon' as const };
		const warlock = pc({ classKey: 'warlock', subclassKey: 'fiend', level: 4, classOptions: [blade] });
		expect(optionCount(warlock, 'invocation')).toBe(2);
		expect(levelUpNeeds(warlock, up(warlock)).options).toEqual([{ kind: 'invocation', total: 3 }]);
		// One that never picked a pact boon is asked for it.
		expect(levelUpNeeds({ ...warlock, classOptions: [] }, up(warlock)).options).toContainEqual({ kind: 'pact-boon', total: 1 });
		const invocations = ['Agonizing Blast', 'Armor of Shadows'].map((name) => ({ ref: `${name.toLowerCase()}|phb`, name, kind: 'invocation' as const }));
		const w2 = pc({ classKey: 'warlock', subclassKey: 'fiend', level: 2, classOptions: invocations });
		expect(levelUpNeeds(w2, up(w2)).options).toEqual([{ kind: 'pact-boon', total: 1 }]);
		// A battle master picked at 3rd level gets three maneuvers.
		const fighter = pc({ level: 2 });
		expect(levelUpNeeds(fighter, up(fighter, 'battle-master')).options).toEqual([{ kind: 'maneuver', total: 3 }]);
		expect(levelUpNeeds(fighter, up(fighter, 'champion')).options).toEqual([]);
		const artificer = pc({ classKey: 'artificer', level: 1 });
		expect(levelUpNeeds(artificer, up(artificer)).options).toEqual([{ kind: 'infusion', total: 4 }]);
	});

	it('counts new cantrips and spells by how the class learns them', () => {
		const bard = pc({ classKey: 'bard', subclassKey: 'lore', level: 3 });
		expect(levelUpNeeds(bard, up(bard))).toMatchObject({ cantrips: 1, spells: 1, swapSpell: true, prep: 'known' });
		const wizard = pc({ classKey: 'wizard', subclassKey: 'evocation', level: 5 });
		expect(levelUpNeeds(wizard, up(wizard))).toMatchObject({ cantrips: 0, spells: 2, swapSpell: false, prep: 'spellbook' });
		const cleric = pc({ classKey: 'cleric', subclassKey: 'life', level: 3 });
		expect(levelUpNeeds(cleric, up(cleric))).toMatchObject({ cantrips: 1, spells: 0, prep: 'prepared' });
		// Eldritch Knight at 3rd level: first spells, nothing to swap yet.
		const ek = pc({ level: 2 });
		expect(levelUpNeeds(ek, up(ek, 'eldritch-knight'))).toMatchObject({ cantrips: 2, spells: 3, swapSpell: false });
		const warlock = pc({ classKey: 'warlock', subclassKey: 'fiend', level: 10 });
		expect(levelUpNeeds(warlock, up(warlock)).arcanum).toBe(6);
	});
});

describe('level up changes', () => {
	it('lists what goes up', () => {
		const barbarian = pc({ classKey: 'barbarian', level: 4 });
		const lines = levelUpChanges(barbarian, up(barbarian));
		expect(lines).toContain('Proficiency bonus +2 → +3');
		expect(lines).toContain('Hit dice 4 → 5');
		expect(lines).toContain('Attacks per Attack action 1 → 2');
		const wizard = pc({ classKey: 'wizard', subclassKey: 'evocation', level: 4, abilities: { str: 8, dex: 14, con: 14, int: 16, wis: 12, cha: 10 } });
		const w = levelUpChanges(wizard, up(wizard));
		expect(w).toContain('3rd-level slots 0 → 2');
		expect(w).toContain('Spells you can prepare 7 → 8');
		const monk = pc({ classKey: 'monk', level: 1 });
		expect(levelUpChanges(monk, up(monk))).toContain('New: Ki 2');
	});

	it('lists granted spells that arrive', () => {
		const sorcerer = pc({ classKey: 'sorcerer', subclassKey: 'aberrant-mind', level: 2 });
		expect(levelUpChanges(sorcerer, up(sorcerer))).toContain('Psionic Spells: Calm Emotions, Detect Thoughts');
	});
});

describe('applying a level up', () => {
	it('applies an Ability Score Improvement, HP and XP in one go', () => {
		const c = pc({ level: 3, xp: 2700, abilities: { str: 16, dex: 12, con: 14, int: 10, wis: 10, cha: 8 } });
		expect(applyLevelUp(c, { hp: 8, improvement: { kind: 'asi', abilities: ['str', 'str'] } })).toBe(true);
		expect(c).toMatchObject({ level: 4, hpBase: 36, hpCurrent: 36, xp: 2700 });
		expect(c.abilities.str).toBe(18);
	});

	it('raises HP for earlier levels when the CON modifier goes up', () => {
		const c = pc({ level: 7, hpBase: 60, hpCurrent: 50, abilities: { str: 16, dex: 12, con: 15, int: 10, wis: 10, cha: 8 } });
		applyLevelUp(c, { hp: 9, improvement: { kind: 'asi', abilities: ['con', 'str'] } });
		// +1 for each of the 7 earlier levels, plus 9 for level 8 (rolled with the new modifier).
		expect(c).toMatchObject({ level: 8, hpBase: 76, hpCurrent: 66 });
	});

	it('takes a feat with its choices', () => {
		const c = pc({ level: 3, skillProficiencies: ['athletics'] });
		const skillExpert = feat({ id: 'skill expert|tce', name: 'Skill Expert', ability: { choose: ['str', 'dex'], amount: 1 }, skills: { from: 'any', count: 1 }, expertise: 1 });
		applyLevelUp(c, { hp: 8, improvement: { kind: 'feat', feat: skillExpert, ability: 'dex', skills: ['stealth'], expertise: ['athletics'] } });
		expect(c.abilities.dex).toBe(11);
		expect(c.skillProficiencies).toEqual(['athletics', 'stealth']);
		expect(c.skillExpertise).toEqual(['athletics']);
		expect(c.feats).toMatchObject([{ ref: 'skill expert|tce', name: 'Skill Expert', level: 4, abilities: ['dex'] }]);

		const r = pc({ level: 7 });
		const resilient = feat({ id: 'resilient|phb', name: 'Resilient', ability: { choose: ['wis', 'con'], amount: 1 }, save: ['wis', 'con'] });
		applyLevelUp(r, { hp: 6, improvement: { kind: 'feat', feat: resilient, ability: 'wis', skills: [], expertise: [] } });
		expect(r.saveProficiencies).toEqual(['wis']);
		expect(r.abilities.wis).toBe(11);
	});

	it('gives Tough its HP for every level, then for each new one', () => {
		const c = pc({ level: 3, hpBase: 28, hpCurrent: 20 });
		const tough = feat({ id: 'tough|phb', name: 'Tough', hpPerLevel: 2 });
		applyLevelUp(c, { hp: 8, improvement: { kind: 'feat', feat: tough, skills: [], expertise: [] } });
		// 2 × 3 earlier levels, plus 8 for level 4 (which the page works out with Tough already counted).
		expect(c).toMatchObject({ level: 4, hpBase: 42, hpCurrent: 34 });
		expect(hpGain(c).parts).toContainEqual({ label: 'Tough', value: 2 });
	});

	it('sets subclass, styles, options and spells', () => {
		const c = pc({
			classKey: 'warlock',
			level: 4,
			classOptions: [
				{ ref: 'agonizing blast|phb', name: 'Agonizing Blast', kind: 'invocation' },
				{ ref: 'armor of shadows|phb', name: 'Armor of Shadows', kind: 'invocation' },
				{ ref: 'pact of the blade|phb', name: 'Pact of the Blade', kind: 'pact-boon' }
			],
			spells: [{ id: 'hex|phb', prepared: true }, { id: 'charm person|phb', prepared: true }],
			concentration: 'Hex'
		});
		applyLevelUp(c, {
			hp: 5,
			subclassKey: 'fiend',
			optionKinds: ['invocation'],
			options: [
				{ ref: 'agonizing blast|phb', name: 'Agonizing Blast', kind: 'invocation' },
				{ ref: 'thirsting blade|phb', name: 'Thirsting Blade', kind: 'invocation' },
				{ ref: 'devil’s sight|phb', name: "Devil's Sight", kind: 'invocation' }
			],
			learn: ['fireball|phb', 'hex|phb'],
			forget: ['hex|phb']
		});
		expect(c.subclassKey).toBe('fiend');
		expect(c.classOptions.map((o) => o.name)).toEqual(['Pact of the Blade', 'Agonizing Blast', 'Thirsting Blade', "Devil's Sight"]);
		// Swapped out and learned again in the same level: still known, once, and still concentrating.
		expect(c.spells.map((s) => s.id)).toEqual(['hex|phb', 'charm person|phb', 'fireball|phb']);
		expect(c.concentration).toBe('Hex');
	});

	it('stops at level 20', () => {
		const c = pc({ level: 20 });
		expect(applyLevelUp(c, { hp: 8, subclassKey: 'champion' })).toBe(false);
		expect(c.subclassKey).toBeUndefined();
	});
});

describe('a new character, level by level', () => {
	const at1 = (o: Partial<Character>) => pc({ level: 1, ...o });

	it('counts 1st-level choices from nothing', () => {
		const fighter = at1({});
		expect(levelUpNeeds(fighter, fighter, true)).toMatchObject({ fightingStyles: 1, asi: false, cantrips: 0, spells: 0 });
		const rogue = at1({ classKey: 'rogue' });
		expect(levelUpNeeds(rogue, rogue, true).expertise).toBe(2);
		const wizard = at1({ classKey: 'wizard' });
		expect(levelUpNeeds(wizard, wizard, true)).toMatchObject({ cantrips: 3, spells: 6, swapSpell: false, subclass: false });
		const sorcerer = at1({ classKey: 'sorcerer' });
		expect(levelUpNeeds(sorcerer, sorcerer, true)).toMatchObject({ subclass: true, cantrips: 4, spells: 2 });
		const barbarian = at1({ classKey: 'barbarian' });
		expect(hasChoices(levelUpNeeds(barbarian, barbarian, true))).toBe(false);
	});

	it('asks for a racial feat and weapon picks at 1st level', () => {
		const human = at1({ classKey: 'barbarian', raceKey: 'human', subraceKey: 'variant' });
		expect(levelUpNeeds(human, human, true).raceFeat).toBe(true);
		expect(levelUpNeeds(human, { ...human, level: 2 }).raceFeat).toBe(false);
		const hobgoblin = at1({ classKey: 'wizard', raceKey: 'hobgoblin-vgm' });
		expect(levelUpNeeds(hobgoblin, hobgoblin, true).weapons).toBe(2);
	});

	it('knows when Bladesingers and Kensei pick weapons', () => {
		expect(weaponPicks({ classKey: 'wizard', subclassKey: 'bladesinging', level: 2 }, false).count).toBe(1);
		expect(weaponPicks({ classKey: 'monk', subclassKey: 'kensei', level: 3 }, false).count).toBe(2);
		expect(weaponPicks({ classKey: 'monk', subclassKey: 'kensei', level: 6 }, false).count).toBe(1);
		expect(weaponPicks({ classKey: 'monk', subclassKey: 'kensei', level: 7 }, false).count).toBe(0);
		const monk = pc({ classKey: 'monk', level: 2 });
		expect(levelUpNeeds(monk, up(monk, 'kensei')).weapons).toBe(2);
	});

	it('applies 1st-level choices without levelling, a racial feat without a level', () => {
		const c = at1({ classKey: 'fighter', raceKey: 'human', subraceKey: 'variant' });
		const alert = feat({ id: 'alert|phb', name: 'Alert' });
		applyChoices(c, { hp: 0, fightingStyles: ['defense'], weapons: ['whip'], improvement: { kind: 'feat', feat: alert, skills: [], expertise: [], fromRace: true } }, 1);
		expect(c.level).toBe(1);
		expect(c.fightingStyles).toEqual(['defense']);
		expect(c.weaponProficiencies).toEqual(['whip']);
		expect(c.feats).toMatchObject([{ name: 'Alert' }]);
		expect(c.feats[0].level).toBeUndefined();
	});

	it('works out starting hit points', () => {
		// d10 at 1st, then 6 a level, +2 CON each level.
		const fighter = pc({ level: 5, abilities: { str: 16, dex: 12, con: 14, int: 10, wis: 10, cha: 8 } });
		expect(startingHp(fighter)).toBe(10 + 2 + 4 * (6 + 2));
		expect(startingHp(fighter, [10, null, 1, 3])).toBe(12 + 12 + 8 + 3 + 5);
		const tough = pc({ level: 2, abilities: { str: 16, dex: 12, con: 10, int: 10, wis: 10, cha: 8 }, feats: [{ id: 't', name: 'Tough', hpPerLevel: 2 }] });
		expect(startingHp(tough)).toBe(12 + 8);
	});
});
