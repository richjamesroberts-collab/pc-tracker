import { describe, expect, it } from 'vitest';
import { newCharacter } from '$lib/character';
import type { Character, InventoryItem } from '$lib/types';
import { isUsable, readItemUse, useCost, useItem, useTimes } from './usable';

function pc(items: InventoryItem[]): Character {
	return { ...newCharacter(), name: 'Lyra', items };
}

function item(overrides: Partial<InventoryItem> = {}): InventoryItem {
	return {
		id: 'w1',
		kind: 'magic',
		ref: 'wand of magic missiles|dmg',
		name: 'Wand of Magic Missiles',
		type: 'Wand',
		rarity: 'uncommon',
		attunement: false,
		attuned: false,
		quantity: 1,
		charges: { max: 7, used: 0, regain: '1d6 + 1' },
		use: { times: ['action'] },
		notes: '',
		...overrides
	};
}

describe('usable items', () => {
	it('reads the kinds of action a description names', () => {
		const magic = { kind: 'magic' as const, type: 'Wondrous item' };
		expect(readItemUse(magic, 'While holding it, you can use an action to cast fireball.')).toEqual({ times: ['action'] });
		expect(readItemUse(magic, 'As a bonus action, you can speak its command word. As an action, you can...')).toEqual({ times: ['action', 'bonus'] });
		expect(readItemUse(magic, 'You can use your reaction to halve the damage.')).toEqual({ times: ['reaction'] });
		expect(readItemUse(magic, 'You gain a +1 bonus to AC while wearing this cloak.')).toBeUndefined();
	});

	it('knows what gets used up', () => {
		expect(readItemUse({ kind: 'magic', type: 'Scroll' }, 'Once the spell is cast, the scroll crumbles to dust.')).toEqual({ times: [], consumed: true });
		expect(readItemUse({ kind: 'magic', type: 'Wondrous item' }, 'You can use an action to throw the bead. The bead explodes on impact and is destroyed.')).toEqual({
			times: ['action'],
			consumed: true
		});
		expect(readItemUse({ kind: 'gear', type: 'Adventuring gear', ref: "alchemist's fire (flask)|phb" }, 'As an action, you can throw this flask')).toEqual({
			times: ['action'],
			consumed: true
		});
		expect(readItemUse({ kind: 'gear', type: 'Adventuring gear', ref: 'antitoxin (vial)|phb' }, 'A creature that drinks this vial')).toEqual({
			times: ['action'],
			consumed: true
		});
		expect(readItemUse({ kind: 'gear', type: 'Poison', ref: 'drow poison|dmg' }, '')).toEqual({ times: ['action'], consumed: true });
		expect(readItemUse({ kind: 'gear', type: 'Adventuring gear', ref: 'tinderbox|phb' }, 'Using it to light a torch takes an action.')).toEqual({
			times: ['action']
		});
	});

	it('leaves out potions and mundane weapons', () => {
		expect(readItemUse({ kind: 'magic', type: 'Potion' }, 'As an action, you can drink it.')).toBeUndefined();
		expect(readItemUse({ kind: 'gear', type: 'Martial ranged weapon', ref: 'net|phb' }, 'As an action, you can...')).toBeUndefined();
	});

	it('lists items with a use or charges, attuned and worn when they need to be', () => {
		expect(isUsable(item())).toBe(true);
		expect(isUsable(item({ use: undefined }))).toBe(true);
		expect(isUsable(item({ use: undefined, charges: undefined }))).toBe(false);
		expect(isUsable(item({ attunement: true }))).toBe(false);
		expect(isUsable(item({ attunement: true, attuned: true }))).toBe(true);
		expect(isUsable(item({ armor: { type: 'heavy', ac: 18 }, equipped: false }))).toBe(false);
		expect(isUsable(item({ type: 'Potion', charges: undefined }))).toBe(false);
	});

	it('reads a custom item’s use from its description', () => {
		const custom = item({ ref: undefined, use: undefined, charges: undefined, name: 'Lucky Coin', notes: 'As a bonus action, flip the coin.' });
		expect(isUsable(custom)).toBe(true);
		expect(useTimes(custom)).toBe('Bonus action');
		expect(useCost(custom)).toBe('free');
	});

	it('spends charges, as many as asked while there are enough', () => {
		const c = pc([item({ charges: { max: 7, used: 4 } })]);
		expect(useItem(c, 'w1', 2)).toBe(true);
		expect(c.items[0].charges!.used).toBe(6);
		expect(useItem(c, 'w1', 2)).toBe(false);
		expect(c.items[0].charges!.used).toBe(6);
		expect(useItem(c, 'w1')).toBe(true);
		expect(c.items[0].charges!.used).toBe(7);
		expect(c.items).toHaveLength(1);
	});

	it('uses one up of a consumable, removing the last', () => {
		const scroll = item({ id: 's1', type: 'Scroll', charges: undefined, use: { times: [], consumed: true }, quantity: 2 });
		const c = pc([scroll]);
		expect(useCost(scroll)).toBe('consumed');
		useItem(c, 's1');
		expect(c.items[0].quantity).toBe(1);
		useItem(c, 's1');
		expect(c.items).toHaveLength(0);
	});

	it('leaves items whose use isn’t tracked as they are', () => {
		const rod = item({ id: 'r1', name: 'Immovable Rod', charges: undefined });
		const c = pc([rod]);
		expect(useCost(rod)).toBe('free');
		expect(useItem(c, 'r1')).toBe(true);
		expect(c.items[0]).toEqual(rod);
	});
});
