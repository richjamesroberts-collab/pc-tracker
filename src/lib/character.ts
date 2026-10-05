import type { Character } from '$lib/types';

export function newCharacter(): Character {
	const now = new Date().toISOString();
	return {
		id: crypto.randomUUID(),
		name: '',
		classKey: 'fighter',
		level: 1,
		xp: 0,
		milestone: false,
		abilities: { str: 10, dex: 10, con: 10, int: 10, wis: 10, cha: 10 },
		raceAbilityChoices: [],
		ac: 10,
		acAuto: true,
		acBase: 10,
		acAdjust: 0,
		hpMax: 10,
		hpBase: 10,
		hpCurrent: 10,
		tempHp: 0,
		deathSaves: { successes: 0, failures: 0 },
		stable: false,
		hitDiceUsed: 0,
		weaponProficiencies: [],
		skillProficiencies: [],
		skillExpertise: [],
		saveProficiencies: [],
		fightingStyles: [],
		senses: [],
		defenses: [],
		spellMod: 0,
		slotsUsed: {},
		bonusSlots: {},
		pactSlotsUsed: 0,
		arcanumUsed: [],
		sorceryPointsUsed: 0,
		metamagic: [],
		resourcesUsed: {},
		customResources: [],
		spells: [],
		customSpells: [],
		spellCache: [],
		items: [],
		coins: { cp: 0, sp: 0, ep: 0, gp: 0, pp: 0 },
		notes: '',
		createdAt: now,
		updatedAt: now
	};
}

export function initials(name: string): string {
	// Only words that start with a letter, so "Lyra Ashwood (copy)" gives "LA".
	const parts = name.trim().split(/\s+/).filter((w) => /^\p{L}/u.test(w));
	if (parts.length === 0) return '?';
	return (parts[0][0] + (parts.length > 1 ? parts[parts.length - 1][0] : '')).toUpperCase();
}

/** Fill in fields added since the character was saved. Safe to run on any character. */
export function migrateToBaseStats(c: Character): Character {
	c.abilities ??= { str: 10, dex: 10, con: 10, int: 10, wis: 10, cha: 10 };
	c.raceAbilityChoices ??= [];
	// XP, weapon proficiencies, fighting styles, senses, hit dice, skills, saves and defenses came later still.
	c.xp ??= 0;
	c.milestone ??= false;
	c.weaponProficiencies ??= [];
	c.fightingStyles ??= [];
	c.senses ??= [];
	c.hitDiceUsed ??= 0;
	c.skillProficiencies ??= [];
	c.skillExpertise ??= [];
	c.saveProficiencies ??= [];
	c.defenses ??= [];
	// `hpBase` arrived with the other base stats, so it marks a character that's already been moved over.
	return c.hpBase === undefined ? legacyToBase(c) : c;
}

/**
 * For characters saved before base stats: what the player typed (AC, max HP, spellcasting modifier,
 * initiative) becomes the base or an override, so nothing shown changes until they fill in ability scores.
 */
export function legacyToBase(c: Character): Character {
	c.hpBase = c.hpMax;
	c.acAuto = false;
	c.acBase = c.ac;
	c.acAdjust = 0;
	if (c.spellMod) c.spellModOverride = c.spellMod;
	if (c.initiativeModifier != null) c.initiativeOverride = c.initiativeModifier;
	return c;
}
