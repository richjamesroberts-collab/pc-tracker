import type { Character } from '$lib/types';

export type Progression = 'full' | 'half' | 'artificer' | 'third' | 'pact' | 'none';
export type SpellPrep = 'known' | 'prepared' | 'spellbook' | 'none';

const THIRD_CASTERS = ['eldritch-knight', 'arcane-trickster'];

/** Spell slots per level for a full caster, indexed by caster level 1-20 (PHB p.165). */
const FULL_SLOTS: number[][] = [
	[],
	[2],
	[3],
	[4, 2],
	[4, 3],
	[4, 3, 2],
	[4, 3, 3],
	[4, 3, 3, 1],
	[4, 3, 3, 2],
	[4, 3, 3, 3, 1],
	[4, 3, 3, 3, 2],
	[4, 3, 3, 3, 2, 1],
	[4, 3, 3, 3, 2, 1],
	[4, 3, 3, 3, 2, 1, 1],
	[4, 3, 3, 3, 2, 1, 1],
	[4, 3, 3, 3, 2, 1, 1, 1],
	[4, 3, 3, 3, 2, 1, 1, 1],
	[4, 3, 3, 3, 2, 1, 1, 1, 1],
	[4, 3, 3, 3, 3, 1, 1, 1, 1],
	[4, 3, 3, 3, 3, 2, 1, 1, 1],
	[4, 3, 3, 3, 3, 2, 2, 1, 1]
];

const KNOWN: Record<string, number[]> = {
	bard: [4, 5, 6, 7, 8, 9, 10, 11, 12, 14, 15, 15, 16, 18, 19, 19, 20, 22, 22, 22],
	sorcerer: [2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 12, 13, 13, 14, 14, 15, 15, 15, 15],
	warlock: [2, 3, 4, 5, 6, 7, 8, 9, 10, 10, 11, 11, 12, 12, 13, 13, 14, 14, 15, 15],
	ranger: [0, 2, 3, 3, 4, 4, 5, 5, 6, 6, 7, 7, 8, 8, 9, 9, 10, 10, 11, 11],
	// Eldritch Knight and Arcane Trickster share a table (fighter/rogue level).
	third: [0, 0, 3, 4, 4, 4, 5, 6, 6, 7, 8, 8, 9, 10, 10, 11, 11, 11, 12, 13]
};

/** Cantrips known at levels 1-3, 4-9 and 10+ (artificer steps at 10 and 14 instead). */
const CANTRIPS: Record<string, [number, number, number]> = {
	bard: [2, 3, 4],
	cleric: [3, 4, 5],
	druid: [2, 3, 4],
	sorcerer: [4, 5, 6],
	warlock: [2, 3, 4],
	wizard: [3, 4, 5]
};

export const SPELL_ABILITY: Record<string, string> = {
	artificer: 'INT',
	bard: 'CHA',
	cleric: 'WIS',
	druid: 'WIS',
	paladin: 'CHA',
	ranger: 'WIS',
	sorcerer: 'CHA',
	warlock: 'CHA',
	wizard: 'INT',
	fighter: 'INT',
	rogue: 'INT'
};

export function progression(c: Pick<Character, 'classKey' | 'subclassKey'>): Progression {
	switch (c.classKey) {
		case 'bard':
		case 'cleric':
		case 'druid':
		case 'sorcerer':
		case 'wizard':
			return 'full';
		case 'paladin':
		case 'ranger':
			return 'half';
		case 'artificer':
			return 'artificer';
		case 'warlock':
			return 'pact';
		case 'fighter':
		case 'rogue':
			return c.subclassKey && THIRD_CASTERS.includes(c.subclassKey) ? 'third' : 'none';
		default:
			return 'none';
	}
}

export function isCaster(c: Pick<Character, 'classKey' | 'subclassKey'>): boolean {
	return progression(c) !== 'none';
}

export function prepStyle(c: Pick<Character, 'classKey' | 'subclassKey'>): SpellPrep {
	if (!isCaster(c)) return 'none';
	if (c.classKey === 'wizard') return 'spellbook';
	if (['cleric', 'druid', 'paladin', 'artificer'].includes(c.classKey)) return 'prepared';
	return 'known';
}

export function proficiencyBonus(level: number): number {
	return 2 + Math.floor((Math.max(1, level) - 1) / 4);
}

export function spellSaveDC(c: Pick<Character, 'level' | 'spellMod'>): number {
	return 8 + proficiencyBonus(c.level) + c.spellMod;
}

export function spellAttack(c: Pick<Character, 'level' | 'spellMod'>): number {
	return proficiencyBonus(c.level) + c.spellMod;
}

/** Maximum slots per spell level (index 0 = 1st level). Warlock pact slots are separate. */
export function slotMax(c: Pick<Character, 'classKey' | 'subclassKey' | 'level'>): number[] {
	const lvl = Math.min(20, Math.max(1, c.level));
	switch (progression(c)) {
		case 'full':
			return FULL_SLOTS[lvl];
		case 'half':
			return lvl < 2 ? [] : FULL_SLOTS[Math.ceil(lvl / 2)];
		case 'artificer':
			return FULL_SLOTS[Math.ceil(lvl / 2)];
		case 'third':
			return lvl < 3 ? [] : FULL_SLOTS[Math.ceil(lvl / 3)];
		default:
			return [];
	}
}

export function pactSlots(c: Pick<Character, 'classKey' | 'level'>): { count: number; level: number } | null {
	if (c.classKey !== 'warlock') return null;
	const lvl = Math.min(20, Math.max(1, c.level));
	const count = lvl === 1 ? 1 : lvl < 11 ? 2 : lvl < 17 ? 3 : 4;
	return { count, level: Math.min(5, Math.ceil(lvl / 2)) };
}

/** Mystic Arcanum spell levels a warlock has unlocked (6th at 11, 7th at 13, 8th at 15, 9th at 17). */
export function arcanumLevels(c: Pick<Character, 'classKey' | 'level'>): number[] {
	if (c.classKey !== 'warlock') return [];
	return [6, 7, 8, 9].filter((l, i) => c.level >= 11 + i * 2);
}

export function slotsLeft(c: Character, level: number): number {
	const max = (slotMax(c)[level - 1] ?? 0) + (c.bonusSlots[level] ?? 0);
	return Math.max(0, max - (c.slotsUsed[level] ?? 0));
}

export function cantripsKnown(c: Pick<Character, 'classKey' | 'subclassKey' | 'level'>): number {
	const p = progression(c);
	if (p === 'third') {
		if (c.level < 3) return 0;
		// Arcane Tricksters get Mage Hand on top of the table's count.
		return (c.level >= 10 ? 3 : 2) + (c.subclassKey === 'arcane-trickster' ? 1 : 0);
	}
	if (c.classKey === 'artificer') return c.level >= 14 ? 4 : c.level >= 10 ? 3 : 2;
	const row = CANTRIPS[c.classKey];
	if (!row) return 0;
	return c.level >= 10 ? row[2] : c.level >= 4 ? row[1] : row[0];
}

/** Levelled spells a known caster can know, or a prepared caster (wizard included) can prepare. */
export function spellLimit(c: Pick<Character, 'classKey' | 'subclassKey' | 'level' | 'spellMod'>): number {
	const idx = Math.min(20, Math.max(1, c.level)) - 1;
	switch (c.classKey) {
		case 'bard':
		case 'sorcerer':
		case 'warlock':
		case 'ranger':
			return KNOWN[c.classKey][idx];
		case 'fighter':
		case 'rogue':
			return progression(c) === 'third' ? KNOWN.third[idx] : 0;
		case 'cleric':
		case 'druid':
		case 'wizard':
			return Math.max(1, c.level + c.spellMod);
		case 'paladin':
		case 'artificer':
			return Math.max(1, Math.floor(c.level / 2) + c.spellMod);
		default:
			return 0;
	}
}

/** Highest spell level the character can cast with a slot. */
export function maxSpellLevel(c: Character): number {
	const pact = pactSlots(c);
	const arc = arcanumLevels(c);
	return Math.max(slotMax(c).length, pact?.level ?? 0, arc[arc.length - 1] ?? 0);
}

export function ordinal(n: number): string {
	if (n === 1) return '1st';
	if (n === 2) return '2nd';
	if (n === 3) return '3rd';
	return `${n}th`;
}
