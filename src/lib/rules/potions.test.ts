import { describe, expect, it } from 'vitest';
import { newCharacter } from '$lib/character';
import type { Character, InventoryItem } from '$lib/types';
import { drinkPotion, healingDice, healingRange, isPotion, potionTempHp } from './potions';

function pc(overrides: Partial<Character> = {}): Character {
	return { ...newCharacter(), name: 'Lyra', hpMax: 30, hpCurrent: 12, ...overrides };
}

function potion(overrides: Partial<InventoryItem> = {}): InventoryItem {
	return {
		id: 'p1',
		kind: 'magic',
		ref: 'potion of healing|dmg',
		name: 'Potion of Healing',
		type: 'Potion',
		rarity: 'common',
		attunement: false,
		attuned: false,
		quantity: 2,
		notes: '',
		...overrides
	};
}

describe('potions', () => {
	it('counts magic items of the Potion type only', () => {
		expect(isPotion(potion())).toBe(true);
		expect(isPotion(potion({ kind: 'gear' }))).toBe(false);
		expect(isPotion(potion({ type: 'Wondrous item' }))).toBe(false);
	});

	it('knows the healing potions, renamed ones by ref', () => {
		expect(healingDice(potion())).toBe('2d4 + 2');
		expect(healingDice(potion({ name: 'Red vial', ref: 'potion of supreme healing|dmg' }))).toBe('10d4 + 20');
		expect(healingDice(potion({ ref: undefined, name: 'Potion of Greater Healing' }))).toBe('4d4 + 4');
		expect(healingDice(potion({ ref: 'potion of heroism|dmg', name: 'Potion of Heroism' }))).toBeNull();
	});

	it('reads healing from a custom potion description', () => {
		const custom = potion({ ref: undefined, name: 'Troll tonic', notes: 'You regain 3d6+1 hit points.' });
		expect(healingDice(custom)).toBe('3d6 + 1');
		expect(healingDice({ ...custom, notes: 'Tastes of moss.' })).toBeNull();
	});

	it('gives the range of a roll', () => {
		expect(healingRange('2d4 + 2')).toEqual({ min: 4, max: 10 });
		expect(healingRange('10d4 + 20')).toEqual({ min: 30, max: 60 });
	});

	it('uses one and heals up to max HP', () => {
		const c = pc({ items: [potion()] });
		expect(drinkPotion(c, 'p1', 10)).toEqual({ healed: 10, temp: 0 });
		expect(c.hpCurrent).toBe(22);
		expect(c.items[0].quantity).toBe(1);
		expect(drinkPotion(c, 'p1', 10)).toEqual({ healed: 8, temp: 0 });
		expect(c.hpCurrent).toBe(30);
		expect(c.items).toHaveLength(0);
	});

	it('brings a character at 0 HP back up', () => {
		const c = pc({ hpCurrent: 0, deathSaves: { successes: 1, failures: 2 }, items: [potion()] });
		expect(drinkPotion(c, 'p1', 6)).toEqual({ healed: 6, temp: 0 });
		expect(c.hpCurrent).toBe(6);
		expect(c.deathSaves).toEqual({ successes: 0, failures: 0 });
	});

	it('uses up a potion that does not heal', () => {
		const c = pc({ items: [potion({ quantity: 1, ref: 'potion of flying|dmg', name: 'Potion of Flying' })] });
		expect(drinkPotion(c, 'p1')).toEqual({ healed: 0, temp: 0 });
		expect(c.items).toHaveLength(0);
		expect(c.hpCurrent).toBe(12);
		expect(c.tempHp).toBe(0);
	});

	it('knows the temp HP a potion gives', () => {
		const heroism = potion({ ref: 'potion of heroism|dmg', name: 'Potion of Heroism' });
		expect(potionTempHp(heroism)).toBe(10);
		expect(potionTempHp({ ...heroism, name: 'Blue brew' })).toBe(10);
		expect(potionTempHp(potion())).toBe(0);
		expect(potionTempHp(potion({ ref: undefined, name: 'Ogre ale', notes: 'You gain 5 temporary hit points.' }))).toBe(5);
	});

	it('gives Potion of Heroism temp HP, which does not stack', () => {
		const heroism = potion({ quantity: 2, ref: 'potion of heroism|dmg', name: 'Potion of Heroism' });
		const c = pc({ tempHp: 4, items: [heroism] });
		expect(drinkPotion(c, 'p1')).toEqual({ healed: 0, temp: 6 });
		expect(c.tempHp).toBe(10);
		expect(c.hpCurrent).toBe(12);
		expect(drinkPotion(c, 'p1')).toEqual({ healed: 0, temp: 0 });
		expect(c.tempHp).toBe(10);
		expect(c.items).toHaveLength(0);
	});
});
