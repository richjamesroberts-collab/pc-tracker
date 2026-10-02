import type { Character } from '$lib/types';
import { resetResources } from './features';
import { pactSlots, slotMax, slotsLeft } from './spellcasting';

export const METAMAGIC: { key: string; name: string; cost: number | 'level' }[] = [
	{ key: 'careful', name: 'Careful Spell', cost: 1 },
	{ key: 'distant', name: 'Distant Spell', cost: 1 },
	{ key: 'empowered', name: 'Empowered Spell', cost: 1 },
	{ key: 'extended', name: 'Extended Spell', cost: 1 },
	{ key: 'heightened', name: 'Heightened Spell', cost: 3 },
	{ key: 'quickened', name: 'Quickened Spell', cost: 2 },
	{ key: 'seeking', name: 'Seeking Spell', cost: 2 },
	{ key: 'subtle', name: 'Subtle Spell', cost: 1 },
	{ key: 'transmuted', name: 'Transmuted Spell', cost: 1 },
	{ key: 'twinned', name: 'Twinned Spell', cost: 'level' }
];

/** Twinned costs the spell's level (1 for a cantrip). */
export function metamagicCost(key: string, spellLevel: number): number {
	const m = METAMAGIC.find((x) => x.key === key);
	if (!m) return 0;
	return m.cost === 'level' ? Math.max(1, spellLevel) : m.cost;
}

/** Sorcery points to create a slot of each level with Font of Magic (PHB p.101). */
export const SLOT_COST: Record<number, number> = { 1: 2, 2: 3, 3: 5, 4: 6, 5: 7 };

export function sorceryPointsMax(c: Pick<Character, 'classKey' | 'level'>): number {
	return c.classKey === 'sorcerer' && c.level >= 2 ? c.level : 0;
}

export function sorceryPointsLeft(c: Character): number {
	return Math.max(0, sorceryPointsMax(c) - c.sorceryPointsUsed);
}

export function spendSlot(c: Character, level: number): boolean {
	if (slotsLeft(c, level) <= 0) return false;
	// Font of Magic slots go first since they vanish on a long rest anyway.
	if ((c.bonusSlots[level] ?? 0) > 0) c.bonusSlots[level] -= 1;
	else c.slotsUsed[level] = (c.slotsUsed[level] ?? 0) + 1;
	return true;
}

export function restoreSlot(c: Character, level: number): void {
	if ((c.slotsUsed[level] ?? 0) > 0) c.slotsUsed[level] -= 1;
}

export function spendPactSlot(c: Character): boolean {
	const pact = pactSlots(c);
	if (!pact || c.pactSlotsUsed >= pact.count) return false;
	c.pactSlotsUsed += 1;
	return true;
}

export function spendSorceryPoints(c: Character, n: number): boolean {
	if (n > sorceryPointsLeft(c)) return false;
	c.sorceryPointsUsed += n;
	return true;
}

/** Font of Magic: burn a slot for points equal to its level, capped at the sorcery point max. */
export function slotToPoints(c: Character, level: number): boolean {
	if (sorceryPointsMax(c) === 0 || c.sorceryPointsUsed === 0) return false;
	if (!spendSlot(c, level)) return false;
	c.sorceryPointsUsed = Math.max(0, c.sorceryPointsUsed - level);
	return true;
}

/** Font of Magic: spend points to create a slot of 1st-5th level. */
export function pointsToSlot(c: Character, level: number): boolean {
	const cost = SLOT_COST[level];
	if (!cost || level > slotMax(c).length) return false;
	if (!spendSorceryPoints(c, cost)) return false;
	c.bonusSlots[level] = (c.bonusSlots[level] ?? 0) + 1;
	return true;
}

export function shortRest(c: Character): void {
	c.pactSlotsUsed = 0;
	resetResources(c, 'short');
}

export function longRest(c: Character): void {
	c.hpCurrent = c.hpMax;
	c.tempHp = 0;
	c.deathSaves = { successes: 0, failures: 0 };
	c.stable = false;
	c.slotsUsed = {};
	c.bonusSlots = {};
	c.pactSlotsUsed = 0;
	c.arcanumUsed = [];
	c.sorceryPointsUsed = 0;
	c.concentration = undefined;
	resetResources(c, 'long');
}
