import { describe, expect, it } from 'vitest';
import { newCharacter } from '$lib/character';
import type { Character, InventoryItem } from '$lib/types';
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
import {
	hitDiceLeft,
	hitDieHealing,
	longRest,
	metamagicCost,
	pointsToSlot,
	shortRest,
	slotToPoints,
	sorceryPointsLeft,
	spendHitDie,
	spendSlot
} from './resources';
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
import { abilityMod, signedMod } from './abilities';
import { abilityBreakdown, armorClass, initiative, maxHp, recompute, setAcTotal } from './stats';
import { coinWorth, formatGp, gainCoins, spendCoins } from './coins';
import {
	addItem,
	attunementLimit,
	carriedWeight,
	changeQuantity,
	chargesLeft,
	dawn,
	setEquipped,
	parseRegain,
	restoreCharges,
	rollRegain,
	setAttuned,
	spendCharges
} from './items';
import { attacks, attacksPerAction, damageText, fightingStyleCount, isMonkWeapon, martialArtsDie } from './attacks';
import { isProficient, proficiencyList, weaponProficiencies, weaponProficiencySources } from './proficiency';
import { senses } from './senses';
import { skillChecks } from './skills';
import { savingThrows } from './saves';
import { hpGain, hpForLevel, levelForXp, levelUp, xpProgress } from './xp';
import type { ItemWeapon } from '$lib/types';

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
	it('hit dice heal by the roll plus CON and refuse when spent or off the die', () => {
		// Sorcerer 7: seven d6s. CON 14 (+2).
		const c = pc({ abilities: { str: 10, dex: 10, con: 14, int: 10, wis: 10, cha: 16 }, hitDiceUsed: 5 });
		expect(hitDiceLeft(c)).toBe(2);
		expect(hitDieHealing(c, 4)).toBe(6);
		expect(spendHitDie(c, 7)).toBe(false);
		expect(spendHitDie(c, 4)).toBe(true);
		expect([c.hpCurrent, c.hitDiceUsed]).toEqual([44, 6]);
		c.hpCurrent = 50;
		expect(spendHitDie(c, 6)).toBe(true);
		expect(c.hpCurrent).toBe(52);
		expect(spendHitDie(c, 1)).toBe(false);
		// A low roll with a CON penalty heals nothing rather than hurting.
		expect(hitDieHealing(pc({ abilities: { str: 10, dex: 10, con: 6, int: 10, wis: 10, cha: 16 } }), 1)).toBe(0);
	});
	it('long rest gives back half the hit dice (at least one); short rest none', () => {
		const c = pc({ hitDiceUsed: 7 });
		shortRest(c);
		expect(c.hitDiceUsed).toBe(7);
		longRest(c);
		expect(c.hitDiceUsed).toBe(4);
		longRest(c);
		expect(c.hitDiceUsed).toBe(1);
		longRest(c);
		expect(c.hitDiceUsed).toBe(0);
		const one = pc({ level: 1, hitDiceUsed: 1 });
		longRest(one);
		expect(one.hitDiceUsed).toBe(0);
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
				{ id: 'b', name: 'B', max: 1, reset: 'long', used: 1 },
				{ id: 'c', name: 'C', max: 3, reset: 'none', used: 2 }
			]
		});
		shortRest(c);
		expect(c.resourcesUsed).toEqual({ indomitable: 1, stale: 3 });
		expect(c.customResources.map((r) => r.used)).toEqual([0, 1, 2]);
		longRest(c);
		expect(c.resourcesUsed).toEqual({});
		expect(c.customResources.map((r) => r.used)).toEqual([0, 0, 2]);
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

function item(overrides: Partial<InventoryItem> = {}): InventoryItem {
	return {
		id: crypto.randomUUID(),
		kind: 'magic',
		name: 'Cloak of Protection',
		type: 'Wondrous item',
		rarity: 'uncommon',
		attunement: true,
		attuned: false,
		quantity: 1,
		notes: '',
		...overrides
	};
}

/** A `random` that always rolls the highest face. */
const maxRoll = () => 0.999;

describe('magic items', () => {
	it('limits attunement to three, more for high-level artificers', () => {
		expect(attunementLimit(pc())).toBe(3);
		expect(attunementLimit(pc({ classKey: 'artificer', level: 10 }))).toBe(4);
		expect(attunementLimit(pc({ classKey: 'artificer', level: 14 }))).toBe(5);
		expect(attunementLimit(pc({ classKey: 'artificer', level: 18 }))).toBe(6);

		const c = pc({ items: [item(), item(), item(), item(), item({ attunement: false })] });
		for (const i of c.items.slice(0, 3)) expect(setAttuned(c, i.id, true)).toBe(true);
		expect(setAttuned(c, c.items[3].id, true)).toBe(false);
		expect(setAttuned(c, c.items[0].id, true)).toBe(true);
		expect(setAttuned(c, c.items[4].id, true)).toBe(false);
		expect(setAttuned(c, c.items[0].id, false)).toBe(true);
		expect(setAttuned(c, c.items[3].id, true)).toBe(true);
	});

	it('spends and restores charges within the max', () => {
		const wand = item({ charges: { max: 7, used: 0, regain: '1d6 + 1' } });
		const c = pc({ items: [wand] });
		expect(spendCharges(c, wand.id, 3)).toBe(true);
		expect(chargesLeft(c.items[0])).toBe(4);
		expect(spendCharges(c, wand.id, 5)).toBe(false);
		restoreCharges(c, wand.id, 10);
		expect(chargesLeft(c.items[0])).toBe(7);
		expect(c.items[0].charges!.used).toBe(0);
	});

	it('reads and rolls regain amounts', () => {
		expect(parseRegain('all')).toEqual({ all: true });
		expect(parseRegain('3')).toEqual({ count: 0, die: 0, bonus: 3 });
		expect(parseRegain('1d6 + 1')).toEqual({ count: 1, die: 6, bonus: 1 });
		expect(parseRegain('d3')).toEqual({ count: 1, die: 3, bonus: 0 });
		expect(parseRegain('2d8+4')).toEqual({ count: 2, die: 8, bonus: 4 });
		expect(parseRegain('some')).toBeNull();
		expect(rollRegain('2d8 + 4', maxRoll)).toBe(20);
		expect(rollRegain('1d6 + 1', () => 0)).toBe(2);
		expect(rollRegain('all')).toBe(Infinity);
	});

	it('recharges at dawn without going over the max', () => {
		const wand = item({ name: 'Wand of Magic Missiles', charges: { max: 7, used: 2, regain: '1d6 + 1' } });
		const staff = item({ name: 'Staff of Healing', charges: { max: 10, used: 10, regain: '1d6 + 4' } });
		const robe = item({ name: 'Robe of Stars', charges: { max: 6, used: 3 } });
		const full = item({ name: 'Ring', charges: { max: 3, used: 0, regain: 'all' } });
		const c = pc({ items: [wand, staff, robe, full] });
		expect(dawn(c, maxRoll)).toEqual([
			{ name: 'Wand of Magic Missiles', amount: 2 },
			{ name: 'Staff of Healing', amount: 10 }
		]);
		expect(c.items.map((i) => i.charges!.used)).toEqual([0, 0, 3, 0]);
	});

	it('stacks potions but not other items, and removes at zero', () => {
		const c = pc();
		const potion = () => item({ ref: 'potion of healing|dmg', name: 'Potion of Healing', type: 'Potion', attunement: false });
		const sword = () => item({ ref: '+1 weapon|dmg', name: '+1 Weapon', type: 'Weapon (any)', attunement: false });
		const id = addItem(c, potion());
		addItem(c, potion());
		addItem(c, sword());
		addItem(c, sword());
		expect(c.items.map((i) => i.quantity)).toEqual([2, 1, 1]);
		changeQuantity(c, id, -1);
		expect(c.items[0].quantity).toBe(1);
		changeQuantity(c, id, -1);
		expect(c.items.map((i) => i.name)).toEqual(['+1 Weapon', '+1 Weapon']);
	});
});

describe('coins', () => {
	const purse = (coins: Partial<Character['coins']>) => pc({ coins: { cp: 0, sp: 0, ep: 0, gp: 0, pp: 0, ...coins } });

	it('pays with the coin asked for when there are enough', () => {
		const c = purse({ gp: 20, sp: 5 });
		expect(spendCoins(c, 'gp', 15)).toBe(true);
		expect(c.coins).toMatchObject({ gp: 5, sp: 5 });
	});

	it('uses smaller coins before breaking bigger ones', () => {
		const c = purse({ gp: 1, sp: 15, pp: 1 });
		expect(spendCoins(c, 'gp', 2)).toBe(true);
		expect(c.coins).toMatchObject({ pp: 1, gp: 0, sp: 5 });
	});

	it('breaks a bigger coin and takes change in coins no bigger than asked for', () => {
		const c = purse({ pp: 1 });
		expect(spendCoins(c, 'gp', 3)).toBe(true);
		expect(c.coins).toMatchObject({ pp: 0, gp: 7, ep: 0 });
		const d = purse({ gp: 1 });
		expect(spendCoins(d, 'cp', 5)).toBe(true);
		expect(d.coins).toMatchObject({ gp: 0, sp: 0, cp: 95 });
	});

	it('refuses, changing nothing, when the character cannot afford it', () => {
		const c = purse({ gp: 2, sp: 9 });
		expect(spendCoins(c, 'gp', 3)).toBe(false);
		expect(c.coins).toMatchObject({ gp: 2, sp: 9 });
		expect(spendCoins(c, 'gp', 0)).toBe(false);
		expect(spendCoins(c, 'gp', 1.5)).toBe(false);
	});

	it('never loses value when paying', () => {
		const start = { cp: 7, sp: 3, ep: 2, gp: 4, pp: 1 };
		for (const coin of ['cp', 'sp', 'ep', 'gp', 'pp'] as const) {
			for (const n of [1, 2, 3, 7, 11]) {
				const c = purse(start);
				const before = coinWorth(c.coins);
				const cost = n * { cp: 1, sp: 10, ep: 50, gp: 100, pp: 1000 }[coin];
				if (spendCoins(c, coin, n)) expect(coinWorth(c.coins), `${n} ${coin}`).toBe(before - cost);
				else expect(before, `${n} ${coin}`).toBeLessThan(cost);
				expect(Object.values(c.coins).every((x) => x >= 0)).toBe(true);
			}
		}
	});

	it('gains coins and formats worth', () => {
		const c = purse({});
		expect(gainCoins(c, 'sp', 25)).toBe(true);
		expect(gainCoins(c, 'sp', -1)).toBe(false);
		expect(formatGp(coinWorth(c.coins))).toBe('2.5 gp');
		expect(formatGp(1234)).toBe('12.34 gp');
		expect(formatGp(300)).toBe('3 gp');
	});
});

describe('gear', () => {
	const gear = (overrides: Partial<InventoryItem> = {}) =>
		item({ kind: 'gear', ref: 'torch|phb', name: 'Torch', type: 'Adventuring gear', rarity: '', attunement: false, weight: 1, ...overrides });

	it('stacks gear with the same ref and name, including unlisted pack contents', () => {
		const c = pc();
		addItem(c, gear({ quantity: 10 }));
		addItem(c, gear({ quantity: 5 }));
		addItem(c, gear({ ref: undefined, name: 'Censer' }));
		addItem(c, gear({ ref: undefined, name: 'Censer' }));
		expect(c.items.map((i) => [i.name, i.quantity])).toEqual([
			['Torch', 15],
			['Censer', 2]
		]);
	});

	it('weighs everything carried, coins at 50 to the pound', () => {
		const c = pc({ items: [gear({ quantity: 10 }), item({ weight: 3 })], coins: { cp: 0, sp: 0, ep: 0, gp: 100, pp: 0 } });
		expect(carriedWeight(c)).toBe(15);
		expect(carriedWeight(c, (i) => (i.kind === 'gear' ? 2 : 0))).toBe(22);
	});
});

describe('ability scores', () => {
	it('works out modifiers', () => {
		expect([1, 8, 9, 10, 11, 12, 15, 20, 30].map(abilityMod)).toEqual([-5, -1, -1, 0, 0, 1, 2, 5, 10]);
		expect(signedMod(3)).toBe('+3');
		expect(signedMod(0)).toBe('+0');
		expect(signedMod(-1)).toBe('-1');
	});
});

const scores = (o: Partial<Character['abilities']> = {}) => ({ str: 10, dex: 10, con: 10, int: 10, wis: 10, cha: 10, ...o });
const magic = (name: string, effects: InventoryItem['effects'], o: Partial<InventoryItem> = {}) =>
	item({ name, effects, attunement: true, attuned: true, ...o });

describe('worked-out stats', () => {
	it('adds racial increases, with subraces replacing where they should', () => {
		const dwarf = abilityBreakdown(pc({ raceKey: 'dwarf', subraceKey: 'hill', abilities: scores({ con: 14, wis: 12 }) }));
		expect(dwarf.scores).toMatchObject({ con: 16, wis: 13 });
		expect(dwarf.sources.con).toEqual([{ label: 'Race', value: '+2' }]);
		const human = abilityBreakdown(pc({ raceKey: 'human', abilities: scores() }));
		expect(Object.values(human.scores)).toEqual([11, 11, 11, 11, 11, 11]);
		const variant = abilityBreakdown(pc({ raceKey: 'human', subraceKey: 'variant', raceAbilityChoices: ['str', 'con'], abilities: scores() }));
		expect(variant.scores).toMatchObject({ str: 11, dex: 10, con: 11 });
	});

	it('only counts valid race picks, up to the number allowed', () => {
		const halfElf = abilityBreakdown(pc({ raceKey: 'half-elf', raceAbilityChoices: ['cha', 'dex', 'con', 'wis'], abilities: scores() }));
		expect(halfElf.scores).toMatchObject({ cha: 12, dex: 11, con: 11, wis: 10 });
	});

	it('applies attuned items: increases to their maximum, and "becomes" scores only when higher', () => {
		const items = [
			magic('Headband of Intellect', { set: { int: 19 } }),
			magic('Ioun Stone, Agility', { add: { dex: 2 }, addMax: 20 }),
			magic('Amulet of Health', { set: { con: 19 } }, { attuned: false })
		];
		const b = abilityBreakdown(pc({ abilities: scores({ int: 12, dex: 19, con: 12 }), items }));
		expect(b.scores).toMatchObject({ int: 19, dex: 20, con: 12 });
		expect(b.withoutItems).toMatchObject({ int: 12, dex: 19 });
		expect(b.sources.int).toEqual([{ label: 'Headband of Intellect', value: 'becomes 19' }]);
		expect(abilityBreakdown(pc({ abilities: scores({ int: 20 }), items })).scores.int).toBe(20);
	});

	it('gives level 20 barbarians Primal Champion', () => {
		expect(abilityBreakdown(pc({ classKey: 'barbarian', level: 20, abilities: scores({ str: 22, con: 18 }) })).scores).toMatchObject({ str: 24, con: 22 });
	});

	it('raises max HP when items raise Constitution, and lowers current HP if the max drops', () => {
		const amulet = magic('Amulet of Health', { set: { con: 19 } });
		const c = pc({ level: 5, hpBase: 40, hpCurrent: 40, abilities: scores({ con: 12 }), items: [amulet] });
		expect(maxHp(c).total).toBe(55);
		recompute(c);
		expect(c.hpMax).toBe(55);
		c.hpCurrent = 55;
		c.items[0].attuned = false;
		recompute(c);
		expect(c.hpMax).toBe(40);
		expect(c.hpCurrent).toBe(40);
	});
});

describe('armor class', () => {
	const armor = (name: string, type: 'light' | 'medium' | 'heavy' | 'shield', ac: number, o: Partial<InventoryItem> = {}) =>
		item({ name, armor: { type, ac }, equipped: true, attunement: false, ...o });

	it('works out unarmored AC, with Unarmored Defense and Draconic Resilience', () => {
		expect(armorClass(pc({ classKey: 'wizard', abilities: scores({ dex: 14 }) })).total).toBe(12);
		expect(armorClass(pc({ classKey: 'barbarian', abilities: scores({ dex: 14, con: 16 }) })).total).toBe(15);
		expect(armorClass(pc({ classKey: 'monk', abilities: scores({ dex: 16, wis: 16 }) })).total).toBe(16);
		expect(armorClass(pc({ classKey: 'sorcerer', subclassKey: 'draconic', abilities: scores({ dex: 14 }) })).total).toBe(15);
	});

	it('loses monk Unarmored Defense with a shield, but barbarians keep theirs', () => {
		const shield = armor('Shield', 'shield', 2);
		expect(armorClass(pc({ classKey: 'monk', abilities: scores({ dex: 16, wis: 16 }), items: [shield] })).total).toBe(15);
		expect(armorClass(pc({ classKey: 'barbarian', abilities: scores({ dex: 14, con: 16 }), items: [shield] })).total).toBe(17);
	});

	it('uses worn armor with the right DEX limit, plus a shield', () => {
		const dex = scores({ dex: 18 });
		expect(armorClass(pc({ abilities: dex, items: [armor('Leather Armor', 'light', 11)] })).total).toBe(15);
		expect(armorClass(pc({ abilities: dex, items: [armor('Breastplate', 'medium', 14)] })).total).toBe(16);
		expect(armorClass(pc({ abilities: dex, items: [armor('Chain Mail', 'heavy', 16), armor('Shield', 'shield', 2)] })).total).toBe(18);
		expect(armorClass(pc({ abilities: dex, items: [armor('Chain Mail', 'heavy', 16, { equipped: false })] })).total).toBe(14);
	});

	it('adds magic bonuses only when attuned or worn', () => {
		const plus1 = armor('+1 Chain Mail', 'heavy', 16, { effects: { ac: 1 } });
		const ring = magic('Ring of Protection', { ac: 1 });
		const ringOff = magic('Ring of Protection', { ac: 1 }, { attuned: false });
		expect(armorClass(pc({ items: [plus1, ring, ringOff] })).total).toBe(18);
		const scaleUnattuned = armor('Red Dragon Scale Mail', 'medium', 14, { effects: { ac: 1 }, attunement: true, attuned: false });
		expect(armorClass(pc({ items: [scaleUnattuned] })).total).toBe(14);
	});

	it('only counts Bracers of Defense without armor or a shield', () => {
		const bracers = magic('Bracers of Defense', { ac: 2, unarmoredOnly: true });
		expect(armorClass(pc({ items: [bracers] })).total).toBe(12);
		expect(armorClass(pc({ items: [bracers, armor('Shield', 'shield', 2)] })).total).toBe(12);
	});

	it('uses the entered AC in manual mode, with item bonuses on top but not armor', () => {
		const c = pc({ acAuto: false, acBase: 17, items: [magic('Cloak of Protection', { ac: 1 }), armor('+1 Shield', 'shield', 2, { effects: { ac: 1 } })] });
		expect(armorClass(c).total).toBe(18);
	});

	it('sets AC through the adjustment in auto mode and the base in manual mode', () => {
		const auto = pc({ abilities: scores({ dex: 14 }) });
		setAcTotal(auto, 17);
		expect(auto.acAdjust).toBe(5);
		expect(armorClass(auto).total).toBe(17);
		const manual = pc({ acAuto: false, acBase: 15, items: [magic('Ring of Protection', { ac: 1 })] });
		setAcTotal(manual, 21);
		expect(manual.acBase).toBe(20);
		expect(armorClass(manual).total).toBe(21);
	});

	it('wears one suit of armor and one shield at a time', () => {
		const c = pc({ items: [armor('Leather', 'light', 11), armor('Chain Mail', 'heavy', 16, { equipped: false }), armor('Shield', 'shield', 2)] });
		setEquipped(c, c.items[1].id, true);
		expect(c.items.map((i) => !!i.equipped)).toEqual([false, true, true]);
	});
});

describe('initiative and spellcasting', () => {
	it('adds Jack of All Trades or Remarkable Athlete to DEX', () => {
		expect(initiative(pc({ classKey: 'bard', level: 5, abilities: scores({ dex: 14 }) })).total).toBe(3);
		expect(initiative(pc({ classKey: 'bard', level: 1, abilities: scores({ dex: 14 }) })).total).toBe(2);
		expect(initiative(pc({ classKey: 'fighter', subclassKey: 'champion', level: 7, abilities: scores({ dex: 14 }) })).total).toBe(4);
		expect(initiative(pc({ classKey: 'bard', level: 5, initiativeOverride: 7 })).total).toBe(7);
	});

	it('works out the spellcasting modifier and item bonuses to DC and attack', () => {
		const rod = magic('+1 Rod of the Pact Keeper', { spellAttack: 1, spellDc: 1 });
		const c = recompute(pc({ classKey: 'warlock', level: 5, spellModOverride: undefined, abilities: scores({ cha: 18 }), items: [rod] }));
		expect(c.spellMod).toBe(4);
		expect(spellSaveDC(c)).toBe(16);
		expect(spellAttack(c)).toBe(8);
		expect(recompute({ ...c, spellModOverride: 6 }).spellMod).toBe(6);
	});
});

describe('experience', () => {
	it('finds the level for an XP total', () => {
		expect(levelForXp(0)).toBe(1);
		expect(levelForXp(299)).toBe(1);
		expect(levelForXp(300)).toBe(2);
		expect(levelForXp(6500)).toBe(5);
		expect(levelForXp(400000)).toBe(20);
	});

	it('shows progress to the next level', () => {
		expect(xpProgress({ level: 4, xp: 4600 })).toEqual({ from: 2700, next: 6500, fraction: 0.5, ready: false });
		expect(xpProgress({ level: 4, xp: 7000 })).toMatchObject({ next: 6500, fraction: 1, ready: true });
		// Started above level 1 without the XP: the bar sits at empty.
		expect(xpProgress({ level: 5, xp: 0 })).toMatchObject({ fraction: 0, ready: false });
		expect(xpProgress({ level: 20, xp: 355000 })).toMatchObject({ next: null, ready: false });
	});

	it('works out hit points for a new level', () => {
		const fighter = pc({ classKey: 'fighter', abilities: scores({ con: 14 }) });
		expect(hpGain(fighter)).toMatchObject({ average: 6, bonus: 2 });
		const wizard = pc({ classKey: 'wizard', abilities: scores({ con: 6 }) });
		expect(hpGain(wizard)).toMatchObject({ average: 4, bonus: -2 });
		expect(hpForLevel(1, -2)).toBe(1);
		// Hill dwarf draconic sorcerer: +1 each, and CON from items doesn't count.
		const amulet = item({ name: 'Amulet of Health', attuned: true, effects: { set: { con: 19 } } });
		const sorc = pc({ classKey: 'sorcerer', subclassKey: 'draconic', raceKey: 'dwarf', subraceKey: 'hill', abilities: scores({ con: 13 }), items: [amulet] });
		expect(hpGain(sorc)).toMatchObject({ average: 4, bonus: 1 + 2 + 1 });
	});

	it('levels up, raising max and current HP and XP to the new level', () => {
		const c = pc({ level: 4, xp: 6600, hpBase: 30, hpCurrent: 20 });
		expect(levelUp(c, 7)).toBe(true);
		expect(c).toMatchObject({ level: 5, hpBase: 37, hpCurrent: 27, xp: 6600 });
		const m = pc({ level: 4, xp: 0, milestone: true });
		levelUp(m, 5);
		expect(m.xp).toBe(0);
		const capped = pc({ level: 20 });
		expect(levelUp(capped, 5)).toBe(false);
		expect(capped.level).toBe(20);
		const fresh = pc({ level: 1, xp: 0 });
		levelUp(fresh, 5);
		expect(fresh.xp).toBe(300);
	});
});

const weapon = (base: string, o: Partial<ItemWeapon> = {}): ItemWeapon => ({
	base,
	category: 'martial',
	ranged: false,
	damage: '1d8',
	damageType: 'slashing',
	properties: [],
	...o
});

const LONGSWORD = weapon('longsword', { properties: ['versatile'], versatile: '1d10' });
const RAPIER = weapon('rapier', { damageType: 'piercing', properties: ['finesse'] });
const DAGGER = weapon('dagger', { category: 'simple', damage: '1d4', damageType: 'piercing', properties: ['finesse', 'light', 'thrown'], range: [20, 60] });
const SHORTSWORD = weapon('shortsword', { damage: '1d6', damageType: 'piercing', properties: ['finesse', 'light'] });
const LONGBOW = weapon('longbow', { ranged: true, damageType: 'piercing', properties: ['ammunition', 'heavy', 'two-handed'], range: [150, 600] });
const GREATSWORD = weapon('greatsword', { damage: '2d6', properties: ['heavy', 'two-handed'] });
const QUARTERSTAFF = weapon('quarterstaff', { category: 'simple', damage: '1d6', damageType: 'bludgeoning', properties: ['versatile'], versatile: '1d8' });

const wielded = (w: ItemWeapon, o: Partial<InventoryItem> = {}) =>
	item({ kind: 'gear', name: w.base[0].toUpperCase() + w.base.slice(1), type: 'Weapon', attunement: false, weapon: w, equipped: true, ...o });

describe('weapon proficiency', () => {
	it('comes from class, subclass and race', () => {
		const wizard = weaponProficiencies(pc({ classKey: 'wizard' }));
		expect(isProficient(wizard, DAGGER)).toBe(true);
		expect(isProficient(wizard, LONGSWORD)).toBe(false);
		const highElf = weaponProficiencies(pc({ classKey: 'wizard', raceKey: 'elf', subraceKey: 'high' }));
		expect(isProficient(highElf, LONGSWORD)).toBe(true);
		expect(isProficient(highElf, LONGBOW)).toBe(true);
		const hexblade = weaponProficiencies(pc({ classKey: 'warlock', subclassKey: 'hexblade' }));
		expect(isProficient(hexblade, GREATSWORD)).toBe(true);
		const dwarfCleric = weaponProficiencies(pc({ classKey: 'cleric', raceKey: 'dwarf', subraceKey: 'hill' }));
		expect([...dwarfCleric]).toEqual(expect.arrayContaining(['simple', 'battleaxe', 'warhammer']));
	});

	it("adds the player's own picks", () => {
		const c = pc({ classKey: 'wizard', weaponProficiencies: ['whip', 'martial'] });
		expect(isProficient(weaponProficiencies(c), GREATSWORD)).toBe(true);
		expect(weaponProficiencySources(c).at(-1)).toEqual({ source: 'Your choice', weapons: ['whip', 'martial'] });
	});

	it('lists categories first and leaves out weapons they cover', () => {
		expect(proficiencyList(['rapier', 'simple', 'dagger', 'hand crossbow'])).toEqual(['simple', 'hand crossbow', 'rapier']);
	});
});

describe('senses', () => {
	const names = (c: Character) => senses(c).map((x) => `${x.name} ${x.range}`);

	it('gives racial darkvision, superior for drow', () => {
		expect(names(pc({ raceKey: 'human' }))).toEqual([]);
		expect(names(pc({ raceKey: 'elf', subraceKey: 'high' }))).toEqual(['Darkvision 60']);
		expect(names(pc({ raceKey: 'elf', subraceKey: 'drow' }))).toEqual(['Darkvision 120']);
	});

	it('adds class features, taking the longest range', () => {
		expect(names(pc({ classKey: 'cleric', subclassKey: 'twilight', raceKey: 'dwarf', level: 1 }))).toEqual(['Darkvision 300']);
		expect(names(pc({ classKey: 'ranger', subclassKey: 'gloom-stalker', raceKey: 'dwarf', level: 3 }))).toEqual(['Darkvision 90']);
		expect(names(pc({ classKey: 'ranger', subclassKey: 'gloom-stalker', raceKey: 'human', level: 3 }))).toEqual(['Darkvision 60']);
		expect(names(pc({ classKey: 'ranger', subclassKey: 'gloom-stalker', raceKey: 'human', level: 2 }))).toEqual([]);
		expect(names(pc({ classKey: 'rogue', level: 14 }))).toEqual(['Blindsense 10']);
		expect(names(pc({ classKey: 'fighter', fightingStyles: ['blind-fighting'] }))).toEqual(['Blindsight 10']);
	});

	it("merges the player's own senses", () => {
		const c = pc({ raceKey: 'elf', senses: [{ id: '1', name: 'darkvision', range: 120 }, { id: '2', name: 'Tremorsense', range: 30 }] });
		expect(names(c)).toEqual(['Darkvision 120', 'Tremorsense 30']);
		expect(senses(c)[0].sources).toEqual(['Race', 'Your choice']);
	});
});

describe('attacks', () => {
	const fighter = (o: Partial<Character> = {}) =>
		pc({ classKey: 'fighter', level: 5, abilities: scores({ str: 16, dex: 14 }), ...o });

	it('lists equipped weapons, then an unarmed strike', () => {
		const list = attacks(fighter({ items: [wielded(LONGSWORD), wielded(RAPIER, { equipped: false })] }));
		expect(list.map((a) => a.name)).toEqual(['Longsword', 'Unarmed strike']);
		expect(list[0]).toMatchObject({ toHit: 6, damage: '1d8 + 3 slashing', versatile: '1d10 + 3 slashing', reach: 'Melee 5 ft' });
		expect(list[1]).toMatchObject({ toHit: 6, damage: '4 bludgeoning' });
	});

	it('picks the better of STR and DEX for finesse weapons, DEX for ranged', () => {
		const c = fighter({ abilities: scores({ str: 10, dex: 18 }), items: [wielded(RAPIER), wielded(LONGBOW)] });
		const [rapier, bow] = attacks(c);
		expect(rapier).toMatchObject({ ability: 'dex', toHit: 7, damage: '1d8 + 4 piercing' });
		expect(bow).toMatchObject({ ability: 'dex', toHit: 7, reach: 'Ranged 150/600 ft' });
	});

	it('leaves out the proficiency bonus without proficiency', () => {
		const [a] = attacks(pc({ classKey: 'wizard', level: 5, abilities: scores({ str: 14 }), items: [wielded(GREATSWORD)] }));
		expect(a).toMatchObject({ proficient: false, toHit: 2, damage: '2d6 + 2 slashing' });
		expect(a.notes[0]).toMatch(/Not proficient/);
	});

	it('adds magic weapon bonuses while usable', () => {
		const plus1 = wielded(LONGSWORD, { kind: 'magic', name: '+1 Longsword', effects: { attack: 1, damage: 1 } });
		expect(attacks(fighter({ items: [plus1] }))[0]).toMatchObject({ toHit: 7, damage: '1d8 + 4 slashing' });
		const unattuned = wielded(LONGSWORD, { kind: 'magic', attunement: true, attuned: false, effects: { attack: 3, damage: 3 } });
		expect(attacks(fighter({ items: [unattuned] }))[0].toHit).toBe(6);
	});

	it('applies Archery, Dueling and Two-Weapon Fighting', () => {
		const archer = attacks(fighter({ fightingStyles: ['archery'], items: [wielded(LONGBOW), wielded(LONGSWORD)] }));
		expect(archer[0].toHit).toBe(2 + 3 + 2);
		expect(archer[1].toHit).toBe(6);
		const duelist = attacks(fighter({ fightingStyles: ['dueling'], items: [wielded(LONGSWORD), wielded(GREATSWORD)] }));
		expect(duelist[0]).toMatchObject({ damage: '1d8 + 5 slashing', versatile: '1d10 + 3 slashing' });
		expect(duelist[1].damage).toBe('2d6 + 3 slashing');
		const twin = [wielded(SHORTSWORD), wielded(DAGGER)];
		expect(attacks(fighter({ items: twin }))[0].notes).toContain('Off-hand (bonus action): 1d6 piercing');
		expect(attacks(fighter({ items: twin, fightingStyles: ['two-weapon'] }))[0].notes).toContain('Off-hand (bonus action): 1d6 + 3 piercing');
	});

	it('leaves Dueling out while holding two light weapons, with a note', () => {
		const [sword] = attacks(fighter({ fightingStyles: ['dueling'], abilities: scores({ dex: 16 }), items: [wielded(SHORTSWORD), wielded(DAGGER)] }));
		expect(sword).toMatchObject({ damage: '1d6 + 3 piercing', damageBonus: 3 });
		expect(sword.notes).toContainEqual(expect.stringMatching(/^Dueling: 1d6 \+ 5 piercing if it’s your only weapon/));
		const [alone] = attacks(fighter({ fightingStyles: ['dueling'], abilities: scores({ dex: 16 }), items: [wielded(SHORTSWORD)] }));
		expect(alone.damage).toBe('1d6 + 5 piercing');
	});

	it('says where each part of the numbers comes from', () => {
		const plus1 = wielded(LONGSWORD, { kind: 'magic', name: '+1 Longsword', effects: { attack: 1, damage: 1 } });
		const [a] = attacks(fighter({ raceKey: 'half-orc', abilities: scores({ str: 16 }), items: [plus1] }));
		expect(a.hitParts).toEqual([
			{ label: 'STR modifier', value: '+4', from: 'STR 18: base 16, Race +2 · melee weapon' },
			{ label: 'Proficiency', value: '+3', from: 'Fighter: Martial weapons (level 5 bonus)' },
			{ label: '+1 Longsword', value: '+1', from: 'Magic weapon' }
		]);
		expect(a.damageParts.map((p) => `${p.label} ${p.value}`)).toEqual(['Weapon die 1d8', 'STR modifier +4', '+1 Longsword +1']);
		expect(a).toMatchObject({ damage: '1d8 + 5 slashing', damageBonus: 5 });
	});

	it('gives monks their Martial Arts die and DEX', () => {
		const monk = pc({ classKey: 'monk', level: 5, abilities: scores({ str: 10, dex: 16 }), items: [wielded(QUARTERSTAFF)] });
		const [staff, fist] = attacks(monk);
		expect(staff).toMatchObject({ ability: 'dex', damage: '1d6 + 3 bludgeoning' });
		expect(fist).toMatchObject({ ability: 'dex', toHit: 6, damage: '1d6 + 3 bludgeoning' });
		expect(isMonkWeapon(GREATSWORD)).toBe(false);
		expect(isMonkWeapon(SHORTSWORD)).toBe(true);
		expect(martialArtsDie(17)).toBe('d10');
	});

	it('uses CHA for a Hexblade and INT for a Battle Smith with a magic weapon', () => {
		const hex = pc({ classKey: 'warlock', subclassKey: 'hexblade', level: 3, abilities: scores({ str: 10, cha: 18 }), items: [wielded(LONGSWORD)] });
		expect(attacks(hex)[0]).toMatchObject({ ability: 'cha', toHit: 6 });
		const smith = pc({ classKey: 'artificer', subclassKey: 'battle-smith', level: 3, abilities: scores({ int: 16 }) });
		expect(attacks({ ...smith, items: [wielded(LONGSWORD, { kind: 'magic' })] })[0].ability).toBe('int');
		expect(attacks({ ...smith, items: [wielded(LONGSWORD)] })[0].ability).toBe('str');
	});

	it('notes Sneak Attack, Rage and critical ranges', () => {
		const rogue = attacks(pc({ classKey: 'rogue', level: 5, items: [wielded(RAPIER), wielded(LONGSWORD)] }));
		expect(rogue[0].notes).toContain('Sneak Attack: 3d6 once per turn');
		expect(rogue[1].notes.some((n) => n.startsWith('Sneak'))).toBe(false);
		const barb = attacks(pc({ classKey: 'barbarian', level: 9, abilities: scores({ str: 16 }), items: [wielded(GREATSWORD)] }));
		expect(barb[0].notes).toEqual(expect.arrayContaining(['Raging: +3 damage', expect.stringMatching(/^Brutal Critical/)]));
		const champ = attacks(fighter({ subclassKey: 'champion', level: 15 }));
		expect(champ[0].notes).toContain('Critical hit on 18–20');
	});

	it('counts ammunition for launchers', () => {
		const arrows = item({ kind: 'gear', ref: 'arrow|phb', name: 'Arrow', type: 'Ammunition', attunement: false, quantity: 18 });
		const [bow] = attacks(fighter({ items: [wielded(LONGBOW), arrows] }));
		expect(bow.ammo).toEqual({ name: 'Arrows', count: 18, itemId: arrows.id });
	});

	it('counts attacks per Attack action', () => {
		expect(attacksPerAction(pc({ classKey: 'fighter', level: 4 }))).toBe(1);
		expect(attacksPerAction(pc({ classKey: 'fighter', level: 11 }))).toBe(3);
		expect(attacksPerAction(pc({ classKey: 'fighter', level: 20 }))).toBe(4);
		expect(attacksPerAction(pc({ classKey: 'paladin', level: 5 }))).toBe(2);
		expect(attacksPerAction(pc({ classKey: 'bard', subclassKey: 'valor', level: 6 }))).toBe(2);
		expect(attacksPerAction(pc({ classKey: 'bard', subclassKey: 'lore', level: 6 }))).toBe(1);
	});

	it('formats damage', () => {
		expect(damageText('1d4', -1, 'piercing')).toBe('1d4 − 1 piercing');
		expect(damageText('1', 3, 'piercing')).toBe('4 piercing');
		expect(damageText('', 3, '')).toBe('—');
	});

	it('counts fighting styles by class', () => {
		expect(fightingStyleCount(pc({ classKey: 'fighter', subclassKey: 'champion', level: 10 }))).toBe(2);
		expect(fightingStyleCount(pc({ classKey: 'paladin', level: 1 }))).toBe(0);
		expect(fightingStyleCount(pc({ classKey: 'wizard' }))).toBe(0);
	});

	it('gives +1 AC with the Defense style only while wearing armor', () => {
		const mail = item({ name: 'Chain Mail', armor: { type: 'heavy', ac: 16 }, equipped: true, attunement: false });
		expect(armorClass(pc({ fightingStyles: ['defense'], items: [mail] })).total).toBe(17);
		expect(armorClass(pc({ fightingStyles: ['defense'], abilities: scores({ dex: 14 }) })).total).toBe(12);
	});

	it('equips weapons alongside each other', () => {
		const c = pc({ items: [wielded(LONGSWORD, { equipped: false }), wielded(DAGGER, { equipped: false })] });
		expect(setEquipped(c, c.items[0].id, true)).toBe(true);
		expect(setEquipped(c, c.items[1].id, true)).toBe(true);
		expect(c.items.every((i) => i.equipped)).toBe(true);
		const ring = item();
		expect(setEquipped({ ...c, items: [ring] }, ring.id, true)).toBe(false);
	});
});

describe("Volo's and Monsters of the Multiverse races", () => {
	it('gives MPMM races +2 and +1, or +1 to three abilities', () => {
		const twoOne = abilityBreakdown(pc({ raceKey: 'tabaxi', raceAbilityChoices: ['dex', 'dex', 'cha'], abilities: scores() }));
		expect(twoOne.scores).toMatchObject({ dex: 12, cha: 11, str: 10 });
		expect(twoOne.sources.dex).toEqual([{ label: 'Race (your pick)', value: '+2' }]);
		const three = abilityBreakdown(pc({ raceKey: 'tabaxi', raceAbilityChoices: ['str', 'dex', 'con'], abilities: scores() }));
		expect(three.scores).toMatchObject({ str: 11, dex: 11, con: 11 });
		// No +3 on one ability, and no more than three picks.
		const greedy = abilityBreakdown(pc({ raceKey: 'goliath', raceAbilityChoices: ['str', 'str', 'str', 'con', 'wis'], abilities: scores() }));
		expect(greedy.scores).toMatchObject({ str: 12, con: 11, wis: 10 });
	});

	it('keeps fixed increases for Volo’s races, with subraces on top', () => {
		const protector = abilityBreakdown(pc({ raceKey: 'aasimar-vgm', subraceKey: 'protector', abilities: scores() }));
		expect(protector.scores).toMatchObject({ cha: 12, wis: 11 });
		// Picks don't apply to a race without a choice.
		expect(abilityBreakdown(pc({ raceKey: 'goliath-vgm', raceAbilityChoices: ['dex'], abilities: scores() })).scores).toMatchObject({ str: 12, con: 11, dex: 10 });
	});

	it('takes darkvision from the race data', () => {
		const names = (c: Character) => senses(c).map((s) => `${s.name} ${s.range}`);
		expect(names(pc({ raceKey: 'duergar' }))).toEqual(['Darkvision 120']);
		expect(names(pc({ raceKey: 'aasimar-vgm', subraceKey: 'fallen' }))).toEqual(['Darkvision 60']);
		expect(names(pc({ raceKey: 'genasi', subraceKey: 'air' }))).toEqual(['Darkvision 60']);
		expect(names(pc({ raceKey: 'fairy' }))).toEqual([]);
		expect(names(pc({ raceKey: 'custom-lineage' }))).toEqual([]);
	});

	it('works out natural armor', () => {
		const shield = item({ name: 'Shield', armor: { type: 'shield', ac: 2 }, equipped: true, attunement: false });
		const lizard = armorClass(pc({ raceKey: 'lizardfolk', abilities: scores({ dex: 14 }) }));
		expect(lizard.total).toBe(15);
		expect(lizard.parts[0]).toEqual({ label: 'Natural Armor', value: '13' });
		expect(armorClass(pc({ raceKey: 'lizardfolk-vgm', abilities: scores({ dex: 14 }), items: [shield] })).total).toBe(17);
		expect(armorClass(pc({ raceKey: 'tortle', abilities: scores({ dex: 18 }), items: [shield] })).total).toBe(19);
		// A barbarian's Unarmored Defense still wins when it's higher.
		expect(armorClass(pc({ raceKey: 'tortle', classKey: 'barbarian', abilities: scores({ dex: 18, con: 18 }) })).total).toBe(18);
	});

	it('adds Hare-Trigger to a harengon’s initiative', () => {
		const init = initiative(pc({ raceKey: 'harengon', classKey: 'wizard', level: 5, abilities: scores({ dex: 14 }) }));
		expect(init.total).toBe(5);
		expect(init.parts).toContainEqual({ label: 'Hare-Trigger', value: '+3' });
	});

	it('adds an attack for natural weapons', () => {
		const tabaxi = attacks(pc({ raceKey: 'tabaxi', classKey: 'rogue', level: 1, abilities: scores({ str: 14 }) }));
		expect(tabaxi.map((a) => a.name)).toEqual(['Claws (unarmed strike)', 'Unarmed strike']);
		expect(tabaxi[0]).toMatchObject({ id: 'natural', toHit: 4, damage: '1d6 + 2 slashing' });
		expect(tabaxi[0].damageParts[0]).toMatchObject({ label: 'Claws', value: '1d6' });
		expect(attacks(pc({ raceKey: 'tabaxi-vgm', abilities: scores({ str: 14 }) }))[0].damage).toBe('1d4 + 2 slashing');
		const bite = attacks(pc({ raceKey: 'lizardfolk', level: 5, abilities: scores({ str: 14 }) }))[0];
		expect(bite.notes).toContain('Hungry Jaws: bite as a bonus action; on a hit gain 3 temporary HP');
		// A monk uses their Martial Arts die when it's bigger, but keeps the natural weapon's damage type.
		const monk = attacks(pc({ raceKey: 'minotaur', classKey: 'monk', level: 11, abilities: scores({ dex: 16 }) }))[0];
		expect(monk).toMatchObject({ ability: 'dex', damage: '1d8 + 3 piercing' });
		expect(attacks(pc({ raceKey: 'human' })).map((a) => a.id)).toEqual(['unarmed']);
	});

	it('notes Long-Limbed and Surprise Attack for bugbears', () => {
		const [fist] = attacks(pc({ raceKey: 'bugbear' }));
		expect(fist.notes).toEqual(expect.arrayContaining(['Long-Limbed: 5 ft more reach on your turn', expect.stringMatching(/^Surprise Attack: \+2d6 if/)]));
		expect(attacks(pc({ raceKey: 'bugbear-vgm' }))[0].notes).toContainEqual(expect.stringMatching(/once per combat$/));
	});

	it('tracks racial uses: proficiency bonus per long rest, and spells from 3rd and 5th level', () => {
		const keys = (c: Character) => resourcesFor(c).map((r) => r.key);
		expect(keys(pc({ raceKey: 'githyanki', level: 2 }))).toEqual([]);
		expect(keys(pc({ raceKey: 'githyanki', level: 3 }))).toEqual(['githyanki-jump']);
		expect(keys(pc({ raceKey: 'githyanki', level: 5 }))).toEqual(['githyanki-jump', 'githyanki-misty-step']);
		const goliath = pc({ raceKey: 'goliath', level: 9 });
		expect(resourceLeft(goliath, resourcesFor(goliath)[0])).toBe(4);
		expect(resourcesFor(pc({ raceKey: 'goliath-vgm', level: 9 }))[0].reset(goliath)).toBe('short');
		expect(keys(pc({ raceKey: 'genasi', subraceKey: 'earth', level: 5 }))).toEqual(['merge-with-stone', 'genasi-pass-without-trace']);
		expect(keys(pc({ raceKey: 'aasimar-vgm', subraceKey: 'scourge', level: 3 }))).toEqual(['healing-hands-vgm', 'radiant-consumption']);
		expect(resourcesFor(pc({ raceKey: 'aasimar', level: 5 }))[0].die!(pc({ level: 5 }))).toBe('3d4');
	});
});

describe('skills', () => {
	const skill = (c: Character, key: string) => skillChecks(c).find((s) => s.key === key)!;

	it('adds proficiency, expertise and racial skills', () => {
		const c = pc({ classKey: 'rogue', level: 5, raceKey: 'elf', abilities: scores({ dex: 16, wis: 12 }), skillProficiencies: ['stealth'], skillExpertise: ['stealth'] });
		expect(skill(c, 'stealth')).toMatchObject({ total: 4 + 3 + 3, level: 'expertise' }); // DEX 16 + Elf 2
		expect(skill(c, 'perception')).toMatchObject({ total: 1 + 3, level: 'proficient' });
		expect(skill(c, 'perception').parts[1].from).toMatch(/^Elf \(Keen Senses\)/);
		expect(skill(c, 'arcana')).toMatchObject({ total: 0, level: 'none' });
		expect(skill(c, 'perception').notes).toContain('Passive perception: 14');
	});

	it('gives Jack of All Trades and Remarkable Athlete to skills without proficiency', () => {
		const bard = pc({ classKey: 'bard', level: 5, skillProficiencies: ['persuasion'] });
		expect(skill(bard, 'arcana')).toMatchObject({ total: 1, level: 'half' });
		expect(skill(bard, 'persuasion').total).toBe(3);
		const champ = pc({ classKey: 'fighter', subclassKey: 'champion', level: 7 });
		expect(skill(champ, 'athletics').total).toBe(2);
		expect(skill(champ, 'arcana').total).toBe(0);
	});

	it('counts item bonuses and notes armor and advantage', () => {
		const luck = item({ ref: 'stone of good luck|dmg', name: 'Stone of Good Luck', attunement: true, attuned: true });
		const gloves = item({ ref: 'gloves of thievery|dmg', name: 'Gloves of Thievery', attunement: false });
		const cloak = item({ ref: 'cloak of elvenkind|dmg', name: 'Cloak of Elvenkind', attunement: true, attuned: true });
		const chain = item({ kind: 'gear', name: 'Chain Mail', attunement: false, armor: { type: 'heavy', ac: 16 }, equipped: true });
		const c = pc({ items: [luck, gloves, cloak, chain] });
		expect(skill(c, 'sleight-of-hand').total).toBe(6);
		expect(skill(c, 'arcana').total).toBe(1);
		expect(skill(c, 'stealth').notes).toEqual(expect.arrayContaining(['Cloak of Elvenkind: Advantage to hide, hood up', 'Chain Mail: disadvantage']));
		expect(skill(pc({ items: [{ ...luck, attuned: false }] }), 'arcana').total).toBe(0);
	});
});

describe('saving throws', () => {
	const save = (c: Character, a: string) => savingThrows(c).find((s) => s.ability === a)!;

	it('adds proficiency from the class, class features and the player', () => {
		const fighter = pc({ classKey: 'fighter', level: 5, abilities: scores({ str: 16, wis: 12 }), saveProficiencies: ['wis'] });
		expect(save(fighter, 'str')).toMatchObject({ total: 6, proficient: true });
		expect(save(fighter, 'str').parts[1].from).toMatch(/^Fighter/);
		expect(save(fighter, 'wis')).toMatchObject({ total: 4, proficient: true });
		expect(save(fighter, 'dex')).toMatchObject({ total: 0, proficient: false });
		expect(savingThrows(pc({ classKey: 'monk', level: 14 })).every((s) => s.proficient)).toBe(true);
		expect(save(pc({ classKey: 'rogue', level: 15 }), 'wis').proficient).toBe(true);
	});

	it('adds Aura of Protection and item bonuses, and notes advantage', () => {
		const paladin = pc({ classKey: 'paladin', level: 6, abilities: scores({ cha: 16 }) });
		expect(save(paladin, 'dex').total).toBe(3);
		expect(save(pc({ classKey: 'paladin', level: 6, abilities: scores({ cha: 8 }) }), 'dex').total).toBe(1);
		const cloak = item({ ref: 'cloak of protection|dmg', name: 'Cloak of Protection', attunement: true, attuned: true });
		const luck = item({ ref: 'stone of good luck|dmg', name: 'Stone of Good Luck', attunement: true, attuned: true });
		expect(save(pc({ items: [cloak, luck] }), 'str').total).toBe(2);
		expect(save(pc({ items: [{ ...cloak, attuned: false }] }), 'str').total).toBe(0);
		expect(save(pc({ raceKey: 'dwarf' }), 'con').notes).toContain('Dwarven Resilience (Dwarf): advantage against poison');
		expect(save(pc({ raceKey: 'gnome' }), 'wis').notes[0]).toMatch(/^Gnome Cunning/);
		expect(save(pc({ classKey: 'barbarian', level: 2 }), 'dex').notes[0]).toMatch(/^Danger Sense/);
	});
});
