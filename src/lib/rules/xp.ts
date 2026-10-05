import type { Character } from '$lib/types';
import { abilityMod } from './abilities';
import { abilityBreakdown } from './stats';

/** XP needed to reach each level, indexed by level - 1 (PHB p.15). */
export const XP_TABLE = [
	0, 300, 900, 2700, 6500, 14000, 23000, 34000, 48000, 64000, 85000, 100000, 120000, 140000, 165000, 195000, 225000, 265000,
	305000, 355000
];

export const MAX_LEVEL = 20;

/** The level a character with this much XP has reached. */
export function levelForXp(xp: number): number {
	let level = 1;
	for (let l = 2; l <= MAX_LEVEL; l++) if (xp >= XP_TABLE[l - 1]) level = l;
	return level;
}

/** XP needed to reach `level`. */
export const xpForLevel = (level: number) => XP_TABLE[Math.min(MAX_LEVEL, Math.max(1, level)) - 1];

export interface XpProgress {
	/** XP the current level starts at. */
	from: number;
	/** XP for the next level; null at level 20. */
	next: number | null;
	/** 0-1 of the way from `from` to `next` (1 at level 20 or once `next` is reached). */
	fraction: number;
	/** Enough XP for the next level (or more). */
	ready: boolean;
}

export function xpProgress(c: Pick<Character, 'level' | 'xp'>): XpProgress {
	const from = xpForLevel(c.level);
	if (c.level >= MAX_LEVEL) return { from, next: null, fraction: 1, ready: false };
	const next = xpForLevel(c.level + 1);
	const fraction = Math.min(1, Math.max(0, (c.xp - from) / (next - from)));
	return { from, next, fraction, ready: c.xp >= next };
}

const HIT_DIE: Record<string, number> = {
	barbarian: 12,
	fighter: 10,
	paladin: 10,
	ranger: 10,
	sorcerer: 6,
	wizard: 6
};

/** The class's hit die size: d12 barbarian, d10 fighter/paladin/ranger, d6 sorcerer/wizard, d8 the rest. */
export const hitDie = (classKey: string) => HIT_DIE[classKey] ?? 8;

export interface HpGain {
	/** The hit die's fixed value (half the die plus one), the PHB's alternative to rolling. */
	average: number;
	/** Added to the roll or average each level: CON modifier, Dwarven Toughness, Draconic Resilience, Tough. */
	bonus: number;
	parts: { label: string; value: number }[];
}

/**
 * Max HP gained for a new level. Uses CON without magic items, since the player's max HP doesn't
 * include them (rules/stats.ts adds those on top).
 */
export function hpGain(c: Parameters<typeof abilityBreakdown>[0] & Pick<Character, 'subclassKey'> & Partial<Pick<Character, 'feats'>>): HpGain {
	const die = hitDie(c.classKey);
	const con = abilityMod(abilityBreakdown(c).withoutItems.con);
	const parts = [{ label: 'CON', value: con }];
	if (c.raceKey === 'dwarf' && c.subraceKey === 'hill') parts.push({ label: 'Dwarven Toughness', value: 1 });
	if (c.classKey === 'sorcerer' && c.subclassKey === 'draconic') parts.push({ label: 'Draconic Resilience', value: 1 });
	for (const f of c.feats ?? []) if (f.hpPerLevel) parts.push({ label: f.name, value: f.hpPerLevel });
	return { average: die / 2 + 1, bonus: parts.reduce((n, p) => n + p.value, 0), parts };
}

/** Hit points for a level from a die roll (or the average): at least 1. */
export const hpForLevel = (roll: number, bonus: number) => Math.max(1, roll + bonus);

/**
 * Go up a level, adding `hp` to max and current HP. Returns false at level 20.
 * Run `recompute` afterwards (session.mutate does).
 */
export function levelUp(c: Character, hp: number): boolean {
	if (c.level >= MAX_LEVEL) return false;
	c.level += 1;
	c.hpBase += hp;
	c.hpCurrent += hp;
	if (!c.milestone) c.xp = Math.max(c.xp, xpForLevel(c.level));
	return true;
}
