import { describe, expect, it } from 'vitest';
import { newCharacter } from '$lib/character';
import type { Character, InventoryItem } from '$lib/types';
import {
	addStash,
	carriedCoins,
	carrySpeed,
	carryState,
	coinRoom,
	containersOf,
	encumbrance,
	gainCoinsAt,
	moveCoinsTo,
	moveItem,
	overLimit,
	partyBag,
	placed,
	putCoinsAway,
	removeStash,
	spendCarried,
	wornContainers
} from './carry';
import { isActive, removeItem, setEquipped } from './items';
import { spendCoins } from './coins';
import { savingThrows } from './saves';
import { skillChecks } from './skills';

function pc(overrides: Partial<Character> = {}): Character {
	return { ...newCharacter(), name: 'Bree', classKey: 'fighter', level: 3, ...overrides };
}

function gear(name: string, weight: number, overrides: Partial<InventoryItem> = {}): InventoryItem {
	return {
		id: name.toLowerCase().replace(/\W+/g, '-'),
		kind: 'gear',
		ref: `${name.toLowerCase()}|phb`,
		name,
		type: 'Adventuring gear',
		rarity: '',
		attunement: false,
		attuned: false,
		quantity: 1,
		weight,
		notes: '',
		...overrides
	};
}

const coins = (gp: number) => ({ cp: 0, sp: 0, ep: 0, gp, pp: 0 });
const pouch = (o: Partial<InventoryItem> = {}) => gear('Pouch', 1, { container: { lb: 6, coins: true }, ...o });
const backpack = (o: Partial<InventoryItem> = {}) => gear('Backpack', 5, { container: { lb: 30 }, ...o });
const bag = (o: Partial<InventoryItem> = {}) =>
	gear('Bag of Holding', 15, { kind: 'magic', ref: 'bag of holding|dmg', container: { lb: 500, weightless: true }, ...o });

describe('carried weight', () => {
	it('counts items carried, inside containers or not, and coins at 50 to the pound', () => {
		const c = pc({ items: [backpack(), gear('Rope', 10, { inside: 'backpack' }), gear('Torch', 1, { quantity: 10 })], coins: coins(100) });
		const s = carryState(c);
		expect(s.carried).toBe(27);
		expect(s.loads.get('backpack')).toBe(10);
		expect(s.looseCoins).toBe(100);
	});

	it('weighs coins in containers, and only the bag counts in a Bag of Holding', () => {
		const c = pc({ items: [pouch({ coins: coins(100), equipped: true }), gear('Chalk', 1, { inside: 'pouch' })] });
		const s = carryState(c);
		// The chalk and 100 coins leave 3 lb: 150 more coins.
		expect(s.loads.get('pouch')).toBe(3);
		expect(coinRoom(s, c.items[0])).toBe(150);
		expect(s.carried).toBe(4);
		expect(s.onPerson).toBe(1);

		const d = pc({ items: [bag({ coins: coins(1000) }), gear('Anvil', 200, { inside: 'bag-of-holding' })] });
		expect(carryState(d).carried).toBe(15);
		expect(carryState(d).loads.get('bag-of-holding')).toBe(220);
	});

	it('nests: a pouch in a backpack adds to the backpack', () => {
		const c = pc({ items: [backpack(), pouch({ inside: 'backpack', coins: coins(50) })] });
		const s = carryState(c);
		expect(s.loads.get('pouch')).toBe(1);
		expect(s.loads.get('backpack')).toBe(2);
		expect(s.carried).toBe(7);
	});

	it('leaves stashed things out, and weighs each stash', () => {
		const c = pc({ items: [gear('Chest', 25, { stash: 'hall', container: { lb: 300 } }), gear('Rope', 10, { stash: 'hall', inside: 'chest' })] });
		c.stashes = [{ id: 'hall', name: 'Guild hall', kind: 'place', coins: coins(500) }];
		const s = carryState(c);
		expect(s.carried).toBe(0);
		expect(s.stashLoads.get('hall')).toBe(45);
	});

	it('cuts loops from old backups', () => {
		const c = pc({ items: [backpack({ inside: 'sack' }), gear('Sack', 0.5, { container: { lb: 30 }, inside: 'backpack' })] });
		expect(containersOf(c).size).toBe(0);
		expect(carryState(c).carried).toBe(5.5);
	});
});

describe('encumbrance', () => {
	const strong = (str: number, carried: number, o: Partial<Character> = {}) =>
		encumbrance(pc({ abilities: { str, dex: 10, con: 10, int: 10, wis: 10, cha: 10 }, ...o }), carried);

	it('carries STR × 15, push or drag twice that', () => {
		expect(strong(10, 150)).toMatchObject({ capacity: 150, pushDrag: 300, status: 'light' });
		expect(strong(10, 151).status).toBe('over');
		expect(strong(10, 301).status).toBe('stuck');
	});

	it('uses the variant thresholds only when the player picks them', () => {
		const variant = { encumbranceRule: 'variant' as const };
		expect(strong(10, 51, variant).status).toBe('encumbered');
		expect(strong(10, 101, variant).status).toBe('heavy');
		expect(strong(10, 101).status).toBe('light');
		expect(carrySpeed(30, 'encumbered')).toBe(20);
		expect(carrySpeed(30, 'heavy')).toBe(10);
		expect(carrySpeed(30, 'over')).toBe(5);
	});

	it('notes disadvantage on STR, DEX and CON checks and saves when heavily encumbered', () => {
		const c = pc({ abilities: { str: 8, dex: 10, con: 10, int: 10, wis: 10, cha: 10 }, items: [gear('Anvil', 90)], encumbranceRule: 'variant' });
		const note = 'Heavily encumbered: disadvantage';
		expect(savingThrows(c).filter((s) => s.notes.includes(note)).map((s) => s.ability)).toEqual(['str', 'dex', 'con']);
		expect(skillChecks(c).find((s) => s.key === 'stealth')!.notes).toContain(note);
		expect(skillChecks(c).find((s) => s.key === 'arcana')!.notes).not.toContain(note);
		expect(savingThrows({ ...c, encumbranceRule: undefined }).some((s) => s.notes.includes(note))).toBe(false);
	});

	it('doubles for Powerful Build and counts STR from race and items', () => {
		expect(strong(15, 0, { raceKey: 'goliath' })).toMatchObject({ powerfulBuild: true, capacity: 450 });
		const belt = gear('Belt of Hill Giant Strength', 1, { kind: 'magic', attunement: true, attuned: true, effects: { set: { str: 21 } } });
		expect(strong(10, 0, { items: [belt] }).capacity).toBe(315);
	});
});

describe('moving things', () => {
	it('puts things in containers, and says when something is over its limit', () => {
		const c = pc({ items: [backpack({ equipped: true }), gear('Rope', 10), gear('Anvil', 25)] });
		const before = structuredClone(c);
		expect(moveItem(c, 'rope', { inside: 'backpack' })).toBe('rope');
		expect(carryState(c).loads.get('backpack')).toBe(10);
		expect(moveItem(c, 'backpack', { inside: 'backpack' })).toBeNull();
		expect(moveItem(c, 'rope', { inside: 'backpack' })).toBeNull();
		expect(overLimit(before, c, { inside: 'backpack' })).toBe('');
		moveItem(c, 'anvil', { inside: 'backpack' });
		expect(overLimit(before, c, { inside: 'backpack' })).toBe('Backpack holds 30 lb');
	});

	it('stops the character carrying more than their capacity, but not keeping what they had', () => {
		const weak = { str: 4, dex: 10, con: 10, int: 10, wis: 10, cha: 10 };
		const c = pc({ abilities: weak, items: [gear('Rope', 50)] });
		const more = structuredClone(c);
		more.items.push(gear('Torch', 20));
		expect(overLimit(c, more, {})).toBe("you'd carry 70 of 60 lb");
		const horse = addStash(more, 'mount', 'Pony', 225);
		moveItem(more, 'torch', { stash: horse });
		expect(overLimit(c, more, { stash: horse })).toBe('');
		const heavier = structuredClone(c);
		heavier.items[0].weight = 70;
		const lighter = structuredClone(heavier);
		lighter.items[0].weight = 65;
		expect(overLimit(heavier, lighter, {})).toBe('');
	});

	it('equips containers on the character, and only those are ways to carry things', () => {
		const c = pc({ items: [pouch(), backpack({ equipped: true }), gear('Sack', 0.5, { container: { lb: 30 }, inside: 'backpack' })] });
		expect(wornContainers(c).map((i) => i.name)).toEqual(['Backpack']);
		expect(setEquipped(c, 'sack', true)).toBe(true);
		expect(c.items[2].inside).toBeUndefined();
		moveItem(c, 'sack', { inside: 'backpack' });
		expect(c.items[2].equipped).toBe(false);
		expect(placed(c, pouch(), {}).equipped).toBe(true);
		expect(placed(c, pouch(), { inside: 'backpack' }).equipped).toBe(false);
	});

	it('places new things in a container wherever it is', () => {
		const c = pc({ items: [backpack({ stash: 'hall' })] });
		const rope = placed(c, gear('Rope', 10, { equipped: true }), { inside: 'backpack' });
		expect(rope).toMatchObject({ inside: 'backpack', stash: 'hall', equipped: false });
		expect(placed(c, rope, {})).not.toHaveProperty('stash');
	});

	it('splits a stack, piling onto one already there', () => {
		const c = pc({ items: [gear('Torch', 1, { quantity: 10 })] });
		const hall = addStash(c, 'place', 'Guild hall');
		const moved = moveItem(c, 'torch', { stash: hall }, 4)!;
		expect(c.items.map((i) => [i.quantity, i.stash])).toEqual([
			[6, undefined],
			[4, hall]
		]);
		expect(moveItem(c, 'torch', { stash: hall }, 6)).toBe(moved);
		expect(c.items).toHaveLength(1);
		expect(c.items[0].quantity).toBe(10);
	});

	it('takes a container’s contents along and unequips what goes to a stash', () => {
		const sword = gear('Longsword', 3, { inside: 'backpack', equipped: true });
		const c = pc({ items: [backpack(), sword] });
		const bagId = addStash(c, 'bag');
		expect(addStash(c, 'bag')).toBe(bagId);
		expect(partyBag(c)?.name).toBe('Party Bag of Holding');
		moveItem(c, 'backpack', { stash: bagId });
		expect(c.items.map((i) => i.stash)).toEqual([bagId, bagId]);
		expect(c.items[1]).toMatchObject({ inside: 'backpack', equipped: false });
		expect(carryState(c).stashLoads.get(bagId)).toBe(8);
		expect(isActive({ ...sword, stash: bagId })).toBe(false);
	});

	it('brings everything back when a stash goes, and lets go of a removed container’s contents and coins', () => {
		const c = pc({ items: [backpack({ coins: coins(5) }), gear('Rope', 10, { inside: 'backpack' })] });
		const hall = addStash(c, 'place', 'Bank');
		expect(moveCoinsTo(c, 'gp', 5, undefined, { stash: hall })).toBe(true);
		expect(c.items[0].coins!.gp).toBe(0);
		moveItem(c, 'backpack', { stash: hall });
		expect(spendCoins(c, 'gp', 2, hall)).toBe(true);
		removeStash(c, hall);
		expect(c.items.every((i) => !i.stash)).toBe(true);
		expect(c.coins.gp).toBe(3);
		c.items[0].coins = coins(4);
		removeItem(c, 'backpack');
		expect(c.items).toEqual([expect.objectContaining({ name: 'Rope' })]);
		expect(c.items[0].inside).toBeUndefined();
		expect(c.coins.gp).toBe(7);
	});
});

describe('coins', () => {
	it('gains coins in a chosen container or stash', () => {
		const c = pc({ items: [pouch({ equipped: true })] });
		expect(gainCoinsAt(c, 'gp', 50, { inside: 'pouch' })).toBe(true);
		const hall = addStash(c, 'place', 'Bank');
		expect(gainCoinsAt(c, 'sp', 10, { stash: hall })).toBe(true);
		expect(c.items[0].coins!.gp).toBe(50);
		expect(c.stashes[0].coins.sp).toBe(10);
		expect(carriedCoins(c).gp).toBe(50);
	});

	it('spends what the character carries, loose coins first, change back where it was paid from', () => {
		const c = pc({ coins: coins(1), items: [pouch({ equipped: true, coins: { cp: 0, sp: 0, ep: 0, gp: 0, pp: 1 } }), gear('Sack', 0.5, { container: { lb: 30, coins: true }, equipped: true, coins: coins(3) })] });
		expect(spendCarried(c, 'gp', 3)).toBe(true);
		expect(c.coins.gp).toBe(0);
		expect(c.items[1].coins!.gp).toBe(1);
		expect(spendCarried(c, 'gp', 3)).toBe(true);
		// The platinum piece pays 3 gp; 7 gp change goes back in the pouch, and the sack's gold isn't needed.
		expect(c.items[0].coins).toMatchObject({ pp: 0, gp: 7 });
		expect(c.items[1].coins!.gp).toBe(1);
		expect(spendCarried(c, 'pp', 1)).toBe(false);
	});

	it('puts loose coins away in coin containers, as many as fit', () => {
		const c = pc({ coins: { cp: 0, sp: 0, ep: 0, gp: 400, pp: 2 }, items: [pouch({ equipped: true }), backpack({ equipped: true })] });
		expect(putCoinsAway(c)).toBe(300);
		expect(c.items[0].coins).toMatchObject({ pp: 2, gp: 298 });
		expect(c.coins).toMatchObject({ pp: 0, gp: 102 });
	});
});
