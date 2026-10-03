import type { Ability } from '$lib/types';

export const ABILITIES: { key: Ability; short: string; name: string }[] = [
	{ key: 'str', short: 'STR', name: 'Strength' },
	{ key: 'dex', short: 'DEX', name: 'Dexterity' },
	{ key: 'con', short: 'CON', name: 'Constitution' },
	{ key: 'int', short: 'INT', name: 'Intelligence' },
	{ key: 'wis', short: 'WIS', name: 'Wisdom' },
	{ key: 'cha', short: 'CHA', name: 'Charisma' }
];

export const ABILITY_SHORT = Object.fromEntries(ABILITIES.map((a) => [a.key, a.short])) as Record<Ability, string>;

/** The modifier for an ability score: 10-11 is +0, 12-13 is +1, 8-9 is -1. */
export const abilityMod = (score: number) => Math.floor((score - 10) / 2);

/** "+2", "-1", "+0". */
export const signedMod = (n: number) => `${n >= 0 ? '+' : ''}${n}`;
