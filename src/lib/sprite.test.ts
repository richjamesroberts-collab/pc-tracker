import { describe, expect, it } from 'vitest';
import type { InventoryItem } from '$lib/types';
import { HERO_W, drawHero, heroGear, runs } from './sprite';

function item(name: string, overrides: Partial<InventoryItem> = {}): InventoryItem {
	return {
		id: name.toLowerCase().replace(/\W+/g, '-'),
		kind: 'magic',
		name,
		type: 'Wondrous item',
		rarity: 'uncommon',
		attunement: false,
		attuned: false,
		quantity: 1,
		equipped: true,
		notes: '',
		...overrides
	};
}

const weapon = (name: string, ranged = false) =>
	item(name, { kind: 'gear', type: 'Weapon', weapon: { base: name.toLowerCase(), category: 'martial', damage: '1d8', damageType: 'slashing', ranged, properties: [] } });

describe('heroGear', () => {
	it('draws what is equipped and worn', () => {
		const gear = heroGear({
			items: [
				weapon('Longsword'),
				weapon('Longbow', true),
				item('Chain Mail', { kind: 'gear', type: 'Heavy armor', armor: { type: 'heavy', ac: 16 } }),
				item('Shield', { kind: 'gear', type: 'Shield', armor: { type: 'shield', ac: 2 } }),
				item('Cloak of Protection'),
				item('Ring of Protection', { type: 'Ring' }),
				item('Backpack', { kind: 'gear', type: 'Adventuring gear', container: { lb: 30 } }),
				item('Pouch', { kind: 'gear', type: 'Adventuring gear', container: { lb: 6 } }),
				item('Sack', { kind: 'gear', type: 'Adventuring gear', container: { lb: 30 } })
			]
		});
		expect(gear.armor).toBe('heavy');
		expect(new Set(gear.layers)).toEqual(new Set(['sword', 'bow', 'armor', 'shield', 'cloak', 'ring', 'back', 'pouch', 'sack']));
	});

	it('leaves out what is carried but not on, and what is in a stash', () => {
		const gear = heroGear({
			items: [item('Boots of Elvenkind', { equipped: false }), item('Amulet of Health', { stash: 'hall' }), item('Bag of Tricks')]
		});
		expect(gear.layers).toEqual([]);
	});
});

describe('drawHero', () => {
	it('adds a layer only when it is on', () => {
		const bare = drawHero({ layers: [] });
		const cloaked = drawHero({ layers: ['cloak'] });
		expect(cloaked.size).toBeGreaterThan(bare.size);
		expect([...cloaked.values()]).toContain('cloak');
		expect([...bare.values()]).not.toContain('cloak');
	});

	it('draws just the layers asked for, for the flash', () => {
		const flash = drawHero({ layers: ['sword', 'cloak'] }, ['sword']);
		expect([...flash.values()]).toContain('steel');
		expect([...flash.values()]).not.toContain('skin');
	});

	it('keeps to the grid and joins runs of one colour', () => {
		const g = drawHero({ layers: ['sword', 'bow', 'shield', 'cloak', 'sack', 'back'], armor: 'heavy' });
		const r = runs(g);
		expect(r.reduce((n, p) => n + p.w, 0)).toBe(g.size);
		expect(r.every((p) => p.x >= 0 && p.x + p.w <= HERO_W)).toBe(true);
		expect(r.length).toBeLessThan(g.size);
	});
});
