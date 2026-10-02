import type { Character } from '$lib/types';

export function newCharacter(): Character {
	const now = new Date().toISOString();
	return {
		id: crypto.randomUUID(),
		name: '',
		classKey: 'fighter',
		level: 1,
		ac: 10,
		hpMax: 10,
		hpCurrent: 10,
		tempHp: 0,
		deathSaves: { successes: 0, failures: 0 },
		stable: false,
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
