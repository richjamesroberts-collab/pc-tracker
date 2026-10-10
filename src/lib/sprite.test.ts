import { describe, expect, it } from 'vitest';
import type { InventoryItem } from '$lib/types';
import { HERO_W, PLAIN_LOOK, drawHero, heroGear, heroLook, runs } from './sprite';

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
		const flash = drawHero({ layers: ['sword', 'cloak'] }, PLAIN_LOOK, ['sword']);
		expect([...flash.values()]).toContain('steel');
		expect([...flash.values()]).not.toContain('skin-peach');
	});

	it('keeps to the grid and joins runs of one colour', () => {
		const g = drawHero({ layers: ['sword', 'bow', 'shield', 'cloak', 'sack', 'back'], armor: 'heavy' });
		const r = runs(g);
		expect(r.reduce((n, p) => n + p.w, 0)).toBe(g.size);
		expect(r.every((p) => p.x >= 0 && p.x + p.w <= HERO_W)).toBe(true);
		expect(r.length).toBeLessThan(g.size);
	});
});

describe('heroLook', () => {
	const look = (c: Parameters<typeof heroLook>[0]) => heroLook(c);

	it('takes skin and hair from the race and subrace', () => {
		expect(look({ classKey: 'fighter' })).toMatchObject({ skin: 'peach', hair: 'brown' });
		expect(look({ classKey: 'fighter', raceKey: 'elf', subraceKey: 'drow' })).toMatchObject({ skin: 'drow', hair: 'white' });
		expect(look({ classKey: 'fighter', raceKey: 'dragonborn', subraceKey: 'red' }).skin).toBe('red');
		expect(look({ classKey: 'fighter', raceKey: 'tabaxi-vgm' }).race.ears).toBe('cat');
	});

	it("uses the player's colours over the race's, and ignores ones it doesn't know", () => {
		const c = { classKey: 'fighter', raceKey: 'tiefling', look: { skin: 'blue', hair: 'mauve' } };
		expect(look(c)).toMatchObject({ skin: 'blue', hair: 'purple' });
	});
});

describe('drawing race, class and gender', () => {
	const colours = (c: Parameters<typeof heroLook>[0]) => [...drawHero({ layers: [] }, heroLook(c)).values()];
	const top = (c: Parameters<typeof heroLook>[0]) =>
		Math.min(...[...drawHero({ layers: [] }, heroLook(c)).keys()].map((k) => Number(k.split(',')[1])));

	it('paints the skin and clothes in their tones', () => {
		expect(colours({ classKey: 'wizard', raceKey: 'tiefling' })).toEqual(expect.arrayContaining(['skin-red', 'hair-purple', 'cloth-blue', 'horn']));
		expect(colours({ classKey: 'barbarian' })).toContain('cloth-hide');
	});

	it('draws a short race lower, and keeps everything in the grid', () => {
		expect(top({ classKey: 'fighter', raceKey: 'halfling' })).toBeGreaterThan(top({ classKey: 'fighter', raceKey: 'human' }));
		for (const raceKey of ['harengon', 'kobold', 'fairy', 'aarakocra', 'centaur'])
			expect(runs(drawHero({ layers: ['cloak', 'shield', 'sword'] }, heroLook({ classKey: 'wizard', raceKey }))).every((p) => p.x >= 0 && p.x + p.w <= HERO_W && p.y >= 0 && p.y < 40)).toBe(true);
	});

	it('gives a male dwarf a beard and long hair to a female hero', () => {
		const beard = (gender?: 'male' | 'female') => colours({ classKey: 'fighter', raceKey: 'dwarf', gender }).filter((c) => c === 'hair-red').length;
		expect(beard('male')).toBeGreaterThan(beard(undefined));
		expect(beard('female')).toBeGreaterThan(beard(undefined));
		expect(drawHero({ layers: [] }, heroLook({ classKey: 'fighter', gender: 'male' }))).not.toEqual(
			drawHero({ layers: [] }, heroLook({ classKey: 'fighter', gender: 'female' }))
		);
	});
});
