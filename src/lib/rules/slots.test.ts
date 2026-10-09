import { describe, expect, it } from 'vitest';
import { migrateToBaseStats, newCharacter } from '$lib/character';
import type { Character, InventoryItem } from '$lib/types';
import { addItem, isActive, setEquipped } from './items';
import { displaced, fillWorn, setWorn, slotOf, wornIn } from './slots';
import { armorClass } from './stats';
import { isUsable } from './usable';

function pc(items: InventoryItem[] = []): Character {
	return { ...newCharacter(), name: 'Bree', classKey: 'fighter', level: 3, items };
}

function magic(name: string, type = 'Wondrous item', overrides: Partial<InventoryItem> = {}): InventoryItem {
	return {
		id: name.toLowerCase().replace(/\W+/g, '-'),
		kind: 'magic',
		name,
		type,
		rarity: 'uncommon',
		attunement: false,
		attuned: false,
		quantity: 1,
		effects: {},
		notes: '',
		...overrides
	};
}

describe('slotOf', () => {
	it('knows worn wondrous items by name, and rings by type', () => {
		expect(slotOf(magic('Cloak of Protection'))).toBe('cloak');
		expect(slotOf(magic('Cap of Water Breathing'))).toBe('head');
		expect(slotOf(magic('Amulet of Health'))).toBe('neck');
		expect(slotOf(magic('Boots of Elvenkind'))).toBe('feet');
		expect(slotOf(magic('Gauntlets of Ogre Power'))).toBe('hands');
		expect(slotOf(magic('Belt of Hill Giant Strength'))).toBe('belt');
		expect(slotOf(magic('Eyes of the Eagle'))).toBe('eyes');
		expect(slotOf(magic('Wings of Flying'))).toBe('cloak');
		expect(slotOf(magic('Ring of Protection', 'Ring'))).toBe('ring');
	});

	it('leaves out things that are held or carried, tattoos and gear', () => {
		expect(slotOf(magic('Bag of Holding'))).toBeUndefined();
		expect(slotOf(magic('Ioun Stone, Awareness'))).toBeUndefined();
		expect(slotOf(magic('Absorbing Tattoo', 'Wondrous item (tattoo)'))).toBeUndefined();
		expect(slotOf(magic('Cloak of the Bat', 'Wand'))).toBeUndefined();
		expect(slotOf({ ...magic('Fine Cloak'), kind: 'gear' })).toBeUndefined();
	});
});

describe('wearing', () => {
	it('swaps out the cloak already worn', () => {
		const old = magic('Cloak of Protection', 'Wondrous item', { equipped: true });
		const next = magic('Cloak of Elvenkind');
		const c = pc([old, next]);
		expect(displaced(c, next).map((i) => i.name)).toEqual(['Cloak of Protection']);
		setEquipped(c, next.id, true);
		expect(wornIn(c, 'cloak').map((i) => i.name)).toEqual(['Cloak of Elvenkind']);
		expect(old.equipped).toBe(false);
	});

	it('takes two rings before swapping the first', () => {
		const a = magic('Ring of Protection', 'Ring', { equipped: true });
		const b = magic('Ring of Feather Falling', 'Ring');
		const third = magic('Ring of Jumping', 'Ring');
		const c = pc([a, b, third]);
		expect(displaced(c, b)).toEqual([]);
		setWorn(c, b.id, true);
		expect(displaced(c, third).map((i) => i.name)).toEqual(['Ring of Protection']);
		setWorn(c, third.id, true);
		expect(wornIn(c, 'ring').map((i) => i.name)).toEqual(['Ring of Feather Falling', 'Ring of Jumping']);
	});

	it('takes it out of a container, and not from a stash', () => {
		const boots = magic('Boots of Elvenkind', 'Wondrous item', { inside: 'pack' });
		const kept = magic('Cloak of Protection', 'Wondrous item', { stash: 'hall' });
		const c = pc([boots, kept]);
		expect(setWorn(c, boots.id, true)).toBe(true);
		expect(boots.inside).toBeUndefined();
		expect(setWorn(c, kept.id, true)).toBe(false);
	});

	it('counts effects only while worn', () => {
		const cloak = magic('Cloak of Protection', 'Wondrous item', { attunement: true, attuned: true, effects: { ac: 1 } });
		const c = pc();
		addItem(c, cloak);
		expect(cloak.equipped).toBe(false);
		expect(isActive(cloak)).toBe(false);
		const before = armorClass(c).total;
		setWorn(c, cloak.id, true);
		expect(isActive(cloak)).toBe(true);
		expect(armorClass(c).total).toBe(before + 1);
	});

	it('only lets worn things with a use be used', () => {
		const boots = magic('Boots of Speed', 'Wondrous item', { ref: 'boots of speed|dmg', attunement: true, attuned: true, use: { times: ['bonus'], consumed: false } });
		const c = pc([boots]);
		boots.equipped = false;
		expect(isUsable(boots)).toBe(false);
		setWorn(c, boots.id, true);
		expect(isUsable(boots)).toBe(true);
	});
});

describe('fillWorn', () => {
	it('puts on what an older character carried, one a slot, and leaves stashed and packed ones off', () => {
		const cloak = magic('Cloak of Protection');
		const spare = magic('Cloak of Elvenkind');
		const packed = magic('Boots of Elvenkind', 'Wondrous item', { inside: 'pack' });
		const kept = magic('Ring of Protection', 'Ring', { stash: 'hall' });
		const bag = magic('Bag of Holding');
		const c = pc([cloak, spare, packed, kept, bag]);
		migrateToBaseStats(c);
		expect(cloak.equipped).toBe(true);
		expect(spare.equipped).toBe(false);
		expect(packed.equipped).toBe(false);
		expect(kept.equipped).toBe(false);
		expect(bag.equipped).toBeUndefined();
	});

	it('leaves items already marked alone', () => {
		const ring = magic('Ring of Protection', 'Ring', { equipped: false });
		const c = pc([ring]);
		fillWorn(c);
		expect(ring.equipped).toBe(false);
	});
});
