import { describe, expect, it } from 'vitest';
import { newCharacter } from '$lib/character';
import type { Character } from '$lib/types';
import { applyDamage, applyHealing, applyTempHp, rollDeathSave, isDead } from './hp';
import {
	arcanumLevels,
	cantripsKnown,
	pactSlots,
	slotMax,
	slotsLeft,
	spellAttack,
	spellLimit,
	spellSaveDC
} from './spellcasting';
import { longRest, metamagicCost, pointsToSlot, slotToPoints, sorceryPointsLeft, spendSlot } from './resources';

function pc(overrides: Partial<Character> = {}): Character {
	return { ...newCharacter(), name: 'Lyra', classKey: 'sorcerer', level: 7, hpMax: 52, hpCurrent: 38, spellMod: 4, ...overrides };
}

describe('slot tables', () => {
	it('full casters follow the PHB table', () => {
		expect(slotMax(pc({ level: 7 }))).toEqual([4, 3, 3, 1]);
		expect(slotMax(pc({ level: 20 }))).toEqual([4, 3, 3, 3, 3, 2, 2, 1, 1]);
	});
	it('half casters start at 2nd level and round up', () => {
		expect(slotMax(pc({ classKey: 'paladin', level: 1 }))).toEqual([]);
		expect(slotMax(pc({ classKey: 'paladin', level: 3 }))).toEqual([3]);
		expect(slotMax(pc({ classKey: 'ranger', level: 5 }))).toEqual([4, 2]);
	});
	it('artificers have slots from 1st level', () => {
		expect(slotMax(pc({ classKey: 'artificer', level: 1 }))).toEqual([2]);
	});
	it('Eldritch Knights are third casters; other fighters have none', () => {
		expect(slotMax(pc({ classKey: 'fighter', subclassKey: 'eldritch-knight', level: 7 }))).toEqual([4, 2]);
		expect(slotMax(pc({ classKey: 'fighter', subclassKey: 'champion', level: 7 }))).toEqual([]);
	});
	it('warlocks use pact slots and arcanum', () => {
		expect(pactSlots(pc({ classKey: 'warlock', level: 1 }))).toEqual({ count: 1, level: 1 });
		expect(pactSlots(pc({ classKey: 'warlock', level: 9 }))).toEqual({ count: 2, level: 5 });
		expect(pactSlots(pc({ classKey: 'warlock', level: 17 }))).toEqual({ count: 4, level: 5 });
		expect(arcanumLevels(pc({ classKey: 'warlock', level: 15 }))).toEqual([6, 7, 8]);
	});
});

describe('spell counts', () => {
	it('derives DC and attack', () => {
		expect(spellSaveDC(pc())).toBe(15);
		expect(spellAttack(pc())).toBe(7);
	});
	it('counts known, prepared and cantrips', () => {
		expect(spellLimit(pc())).toBe(8);
		expect(cantripsKnown(pc())).toBe(5);
		expect(spellLimit(pc({ classKey: 'cleric', level: 5, spellMod: 3 }))).toBe(8);
		expect(spellLimit(pc({ classKey: 'paladin', level: 5, spellMod: 3 }))).toBe(5);
		expect(cantripsKnown(pc({ classKey: 'rogue', subclassKey: 'arcane-trickster', level: 3 }))).toBe(3);
	});
});

describe('hit points', () => {
	it('temp HP soaks damage first and concentration DC uses the full hit', () => {
		const c = pc({ tempHp: 5, concentration: 'Haste' });
		const r = applyDamage(c, 24);
		expect(r.absorbed).toBe(5);
		expect(c.tempHp).toBe(0);
		expect(c.hpCurrent).toBe(19);
		expect(r.concentrationDC).toBe(12);
	});
	it('dropping to 0 ends concentration and resets saves', () => {
		const c = pc({ concentration: 'Haste', deathSaves: { successes: 2, failures: 1 } });
		const r = applyDamage(c, 40);
		expect(c.hpCurrent).toBe(0);
		expect(r.droppedToZero).toBe(true);
		expect(r.concentrationDC).toBeUndefined();
		expect(c.concentration).toBeUndefined();
		expect(c.deathSaves).toEqual({ successes: 0, failures: 0 });
	});
	it('massive damage kills outright', () => {
		const c = pc({ hpCurrent: 10 });
		expect(applyDamage(c, 62).instantDeath).toBe(true);
		expect(isDead(c)).toBe(true);
	});
	it('damage while down adds failures, two on a crit', () => {
		const c = pc({ hpCurrent: 0 });
		applyDamage(c, 3);
		expect(c.deathSaves.failures).toBe(1);
		applyDamage(c, 3, { critical: true });
		expect(c.deathSaves.failures).toBe(3);
	});
	it('healing from 0 clears death saves', () => {
		const c = pc({ hpCurrent: 0, deathSaves: { successes: 1, failures: 2 } });
		applyHealing(c, 4);
		expect(c.hpCurrent).toBe(4);
		expect(c.deathSaves).toEqual({ successes: 0, failures: 0 });
	});
	it('temp HP keeps the higher value', () => {
		const c = pc({ tempHp: 8 });
		expect(applyTempHp(c, 5)).toBe(false);
		expect(c.tempHp).toBe(8);
	});
	it('nat 20 on a death save brings you back at 1 HP', () => {
		const c = pc({ hpCurrent: 0, deathSaves: { successes: 0, failures: 2 } });
		rollDeathSave(c, 'nat20');
		expect(c.hpCurrent).toBe(1);
	});
	it('three successes stabilise', () => {
		const c = pc({ hpCurrent: 0 });
		for (let i = 0; i < 3; i++) rollDeathSave(c, 'success');
		expect(c.stable).toBe(true);
	});
});

describe('resources', () => {
	it('spends slots and refuses when empty', () => {
		const c = pc();
		expect(spendSlot(c, 4)).toBe(true);
		expect(spendSlot(c, 4)).toBe(false);
	});
	it('Font of Magic converts both ways', () => {
		const c = pc({ sorceryPointsUsed: 5 });
		expect(sorceryPointsLeft(c)).toBe(2);
		expect(slotToPoints(c, 2)).toBe(true);
		expect(sorceryPointsLeft(c)).toBe(4);
		expect(slotsLeft(c, 2)).toBe(2);
		expect(pointsToSlot(c, 1)).toBe(true);
		expect(slotsLeft(c, 1)).toBe(5);
		expect(sorceryPointsLeft(c)).toBe(2);
		expect(pointsToSlot(c, 3)).toBe(false);
	});
	it('long rest clears created slots and refills everything', () => {
		const c = pc({ sorceryPointsUsed: 3, slotsUsed: { 1: 2 }, bonusSlots: { 1: 1 }, tempHp: 4 });
		longRest(c);
		expect(slotsLeft(c, 1)).toBe(4);
		expect(c.hpCurrent).toBe(52);
		expect(c.tempHp).toBe(0);
		expect(sorceryPointsLeft(c)).toBe(7);
	});
	it('Twinned costs the spell level', () => {
		expect(metamagicCost('twinned', 0)).toBe(1);
		expect(metamagicCost('twinned', 3)).toBe(3);
		expect(metamagicCost('quickened', 3)).toBe(2);
	});
});
