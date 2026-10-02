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
import { longRest, metamagicCost, pointsToSlot, shortRest, slotToPoints, sorceryPointsLeft, spendSlot } from './resources';
import {
	RESOURCES,
	proficiencyBonus,
	resourceLeft,
	resourcesFor,
	restoreCustom,
	restoreResource,
	spendCustom,
	spendResource
} from './features';

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

describe('limited-use features', () => {
	const max = (c: Character, key: string) => resourcesFor(c).find((r) => r.key === key)?.max(c) ?? 0;
	it('proficiency bonus', () => expect([1, 4, 5, 9, 13, 17, 20].map(proficiencyBonus)).toEqual([2, 2, 3, 4, 5, 6, 6]));
	it('rage breakpoints', () => expect([1, 2, 3, 6, 12, 17, 20].map((level) => max(pc({ classKey: 'barbarian', level }), 'rage'))).toEqual([2, 2, 3, 4, 5, 6, 0]));
	it('action surge hidden before 2', () => {
		expect(resourcesFor(pc({ classKey: 'fighter', level: 1 })).map((r) => r.key)).toEqual(['second-wind']);
		expect(max(pc({ classKey: 'fighter', level: 17 }), 'action-surge')).toBe(2);
	});
	it('ki equals level from 2', () => expect([1, 2, 11].map((level) => max(pc({ classKey: 'monk', level }), 'ki'))).toEqual([0, 2, 11]));
	it('bardic inspiration die and reset', () => {
		const b4 = pc({ classKey: 'bard', level: 4, spellMod: 3 });
		const b5 = pc({ classKey: 'bard', level: 5, spellMod: 0 });
		const def = RESOURCES.find((r) => r.key === 'bardic-inspiration')!;
		expect([def.max(b4), def.reset(b4), def.die!(b4)]).toEqual([3, 'long', 'd6']);
		expect([def.max(b5), def.reset(b5), def.die!(b5)]).toEqual([1, 'short', 'd8']);
	});
	it('subclass resources need the matching class', () => {
		expect(max(pc({ classKey: 'fighter', subclassKey: 'battle-master', level: 7 }), 'superiority-dice')).toBe(5);
		expect(max(pc({ classKey: 'sorcerer', subclassKey: 'shadow', level: 7 }), 'superiority-dice')).toBe(0);
	});
	it('bolstering magic starts at 6th level (text says so)', () =>
		expect([5, 6, 13].map((level) => max(pc({ classKey: 'barbarian', subclassKey: 'wild-magic', level }), 'bolstering-magic'))).toEqual([0, 3, 5]));
	it('favored foe: proficiency bonus uses, d4 → d6 at 6 → d8 at 14', () => {
		const def = RESOURCES.find((r) => r.key === 'favored-foe')!;
		const rangers = [1, 6, 14].map((level) => pc({ classKey: 'ranger', level }));
		expect(rangers.map((c) => max(c, 'favored-foe'))).toEqual([2, 3, 5]);
		expect(rangers.map((c) => def.die!(c))).toEqual(['d4', 'd6', 'd8']);
		expect(def.reset(rangers[0])).toBe('long');
	});
	it("hexblade's curse: once per short rest", () => {
		const c = pc({ classKey: 'warlock', subclassKey: 'hexblade', level: 1 });
		expect(max(c, 'hexblades-curse')).toBe(1);
		expect(RESOURCES.find((r) => r.key === 'hexblades-curse')!.reset(c)).toBe('short');
		expect(max(pc({ classKey: 'warlock', subclassKey: 'fiend', level: 1 }), 'hexblades-curse')).toBe(0);
	});
	it('bladesong: proficiency bonus uses per long rest from 2nd level', () => {
		const at = (level: number) => pc({ classKey: 'wizard', subclassKey: 'bladesinging', level });
		expect([1, 2, 5, 17].map((level) => max(at(level), 'bladesong'))).toEqual([0, 2, 3, 6]);
		expect(RESOURCES.find((r) => r.key === 'bladesong')!.reset(at(2))).toBe('long');
	});
	it('race and subrace resources', () => {
		expect(resourcesFor(pc({ raceKey: 'elf', subraceKey: 'drow', level: 5 })).map((r) => r.key)).toEqual(expect.arrayContaining(['faerie-fire', 'drow-darkness']));
		expect(max(pc({ raceKey: 'tiefling', level: 2 }), 'hellish-rebuke')).toBe(0);
	});
	it('left is clamped when used exceeds a lowered max', () => {
		const c = pc({ classKey: 'monk', level: 3, resourcesUsed: { ki: 9 } });
		expect(resourceLeft(c, RESOURCES.find((r) => r.key === 'ki')!)).toBe(0);
	});
	it('restore clamps used to the current max first', () => {
		const c = pc({ classKey: 'monk', level: 3, resourcesUsed: { ki: 9 } });
		const ki = RESOURCES.find((r) => r.key === 'ki')!;
		restoreResource(c, 'ki');
		expect(c.resourcesUsed.ki).toBe(2);
		expect(resourceLeft(c, ki)).toBe(1);
	});
	it('spend rejects non-integer and NaN amounts', () => {
		const p = pc({ classKey: 'paladin', level: 4 });
		expect(spendResource(p, 'lay-on-hands', 1.5)).toBe(false);
		expect(spendResource(p, 'lay-on-hands', NaN)).toBe(false);
		expect(p.resourcesUsed['lay-on-hands']).toBeUndefined();
	});
	it('spend and pool spend', () => {
		const p = pc({ classKey: 'paladin', level: 4 });
		expect(spendResource(p, 'lay-on-hands', 15)).toBe(true);
		expect(spendResource(p, 'lay-on-hands', 6)).toBe(false);
		expect(p.resourcesUsed['lay-on-hands']).toBe(15);
		restoreResource(p, 'lay-on-hands', 20);
		expect(p.resourcesUsed['lay-on-hands'] ?? 0).toBe(0);
	});
	it('short rest resets short resources and custom; long resets all', () => {
		const c = pc({
			classKey: 'fighter',
			level: 9,
			resourcesUsed: { 'action-surge': 1, indomitable: 1, stale: 3 },
			customResources: [
				{ id: 'a', name: 'A', max: 2, reset: 'short', used: 2 },
				{ id: 'b', name: 'B', max: 1, reset: 'long', used: 1 }
			]
		});
		shortRest(c);
		expect(c.resourcesUsed).toEqual({ indomitable: 1, stale: 3 });
		expect(c.customResources.map((r) => r.used)).toEqual([0, 1]);
		longRest(c);
		expect(c.resourcesUsed).toEqual({});
		expect(c.customResources.map((r) => r.used)).toEqual([0, 0]);
	});
	it('custom counters stay within 0..max and act on the first matching id', () => {
		const c = pc({
			customResources: [
				{ id: 'x', name: 'X', max: 2, reset: 'long', used: 0 },
				{ id: 'x', name: 'X2', max: 2, reset: 'long', used: 0 }
			]
		});
		expect(spendCustom(c, 'x')).toBe(true);
		expect(spendCustom(c, 'x')).toBe(true);
		expect(spendCustom(c, 'x')).toBe(false);
		expect(c.customResources.map((r) => r.used)).toEqual([2, 0]);
		restoreCustom(c, 'x');
		restoreCustom(c, 'x');
		restoreCustom(c, 'x');
		expect(c.customResources.map((r) => r.used)).toEqual([0, 0]);
		expect(spendCustom(c, 'nope')).toBe(false);
		const odd = pc({ customResources: [{ id: 'y', name: 'Y', max: 1.5, reset: 'long', used: 1 }] });
		expect(spendCustom(odd, 'y')).toBe(false);
		expect(odd.customResources[0].used).toBe(1);
	});
});
