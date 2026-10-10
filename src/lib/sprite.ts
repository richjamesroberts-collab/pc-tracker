import { slotOf } from '$lib/rules/slots';
import type { ArmorType, Character } from '$lib/types';

/**
 * The pixel hero on PC Equipped: a generic adventurer on a 32 x 40 grid, drawn in layers for what the character has
 * equipped and worn. It doesn't try to be accurate, just to show at a glance that there's a cloak, a sword, a sack.
 */
export const HERO_W = 32;
export const HERO_H = 40;

/** One piece drawn on the hero. */
export type Layer =
	| 'armor'
	| 'sword'
	| 'bow'
	| 'shield'
	| 'head'
	| 'eyes'
	| 'neck'
	| 'cloak'
	| 'robe'
	| 'hands'
	| 'bracers'
	| 'belt'
	| 'feet'
	| 'ring'
	| 'back'
	| 'pouch'
	| 'sack';

export interface HeroGear {
	layers: Layer[];
	/** The armor worn, for how it's drawn. */
	armor?: Exclude<ArmorType, 'shield'>;
}

/** A colour of the hero's palette: `--color-px-<key>` in app.css. */
export type Pixel =
	| 'outline' | 'skin' | 'skin-dk' | 'hair' | 'hair-dk' | 'eye' | 'white' | 'blush'
	| 'tunic' | 'tunic-dk' | 'pants' | 'pants-dk' | 'shoe' | 'belt' | 'gold'
	| 'steel' | 'steel-dk' | 'shine' | 'leather' | 'leather-dk' | 'stud'
	| 'cloak' | 'cloak-dk' | 'robe' | 'robe-dk' | 'roll' | 'roll-dk' | 'strap' | 'sack' | 'sack-dk'
	| 'gem' | 'gem-lt' | 'ruby' | 'ring' | 'boot' | 'boot-lt' | 'boot-dk' | 'gaunt' | 'gaunt-dk'
	| 'grip' | 'wood' | 'wood-dk' | 'string' | 'lens';

/** Equipped containers by what they're called: a backpack on the back, a pouch on the belt, a sack over the shoulder. */
const CONTAINERS: [Layer, RegExp][] = [
	['back', /backpack|haversack|bag of holding|explorer/i],
	['pouch', /pouch|purse/i],
	['sack', /\bsack\b|\bbag\b/i]
];

/** What to draw for what the character has equipped and worn (not what's in a stash). */
export function heroGear(c: Pick<Character, 'items'>): HeroGear {
	const on = (c.items ?? []).filter((i) => i.equipped && !i.stash);
	const layers = new Set<Layer>();
	const armor = on.find((i) => i.armor && i.armor.type !== 'shield')?.armor?.type as HeroGear['armor'];
	if (armor) layers.add('armor');
	if (on.some((i) => i.armor?.type === 'shield')) layers.add('shield');
	if (on.some((i) => i.weapon && !i.weapon.ranged)) layers.add('sword');
	if (on.some((i) => i.weapon?.ranged)) layers.add('bow');
	for (const i of on) {
		const slot = slotOf(i);
		if (slot) layers.add(slot);
		if (i.container) {
			const kind = CONTAINERS.find(([, re]) => re.test(i.name))?.[0];
			if (kind) layers.add(kind);
		}
	}
	return { layers: [...layers], ...(armor ? { armor } : {}) };
}

/** The pixels of the hero (`"x,y"` to colour), or with `only`, just those layers (for the flash when they go on). */
export function drawHero(gear: HeroGear, only?: Layer[]): Map<string, Pixel> {
	const g = new Map<string, Pixel>();
	const set = (x: number, y: number, c: Pixel) => {
		if (x >= 0 && x < HERO_W && y >= 0 && y < HERO_H) g.set(`${x},${y}`, c);
	};
	const rect = (x: number, y: number, w: number, h: number, c: Pixel) => {
		for (let i = x; i < x + w; i++) for (let j = y; j < y + h; j++) set(i, j, c);
	};
	const round = (x: number, y: number, w: number, h: number, c: Pixel) => {
		rect(x + 1, y, w - 2, h, c);
		rect(x, y + 1, w, h - 2, c);
	};
	const has = new Set(gear.layers);
	const want = (k: Layer) => (only ? only.includes(k) : has.has(k));
	const base = !only;
	// A bow goes in the hand, unless there's a sword there: then it's slung on the back.
	const bowInHand = !has.has('sword');

	// Behind the body
	if (want('cloak')) {
		for (let y = 17; y <= 35; y++) {
			const sp = Math.floor((y - 17) / 5);
			rect(8 - sp, y, 16 + 2 * sp, 1, 'cloak');
			rect(21 + sp, y, 3, 1, 'cloak-dk');
		}
	}
	if (want('bow') && !bowInHand) {
		for (let k = 0; k < 20; k++) set(5 + k, 9 + k, 'wood');
		for (let k = 0; k < 20; k++) set(6 + k, 9 + k, 'wood-dk');
	}
	if (want('back')) {
		round(7, 13, 18, 4, 'roll');
		rect(7, 15, 18, 1, 'roll-dk');
		rect(10, 13, 1, 4, 'strap');
		rect(21, 13, 1, 4, 'strap');
	}
	if (want('sack')) {
		round(22, 6, 7, 9, 'sack');
		rect(27, 7, 1, 7, 'sack-dk');
		rect(24, 5, 3, 1, 'strap');
	}

	// The body
	if (base) {
		rect(12, 29, 8, 3, 'pants');
		rect(12, 32, 3, 5, 'pants');
		rect(17, 32, 3, 5, 'pants');
		rect(14, 32, 1, 5, 'pants-dk');
		rect(19, 29, 1, 8, 'pants-dk');
		rect(11, 37, 4, 2, 'shoe');
		rect(17, 37, 4, 2, 'shoe');
		rect(11, 18, 10, 11, 'tunic');
		rect(19, 18, 2, 11, 'tunic-dk');
		rect(7, 18, 3, 5, 'tunic');
		rect(22, 18, 3, 5, 'tunic');
		rect(24, 18, 1, 5, 'tunic-dk');
		rect(7, 23, 3, 5, 'skin');
		rect(22, 23, 3, 5, 'skin');
		rect(9, 23, 1, 5, 'skin-dk');
		rect(24, 23, 1, 5, 'skin-dk');
		rect(14, 16, 4, 2, 'skin-dk');
		round(10, 4, 12, 12, 'skin');
		rect(20, 12, 1, 3, 'skin-dk');
		round(10, 2, 12, 6, 'hair');
		rect(10, 6, 2, 6, 'hair');
		rect(20, 6, 2, 6, 'hair');
		rect(20, 3, 2, 9, 'hair-dk');
		rect(12, 8, 3, 1, 'hair');
		rect(13, 10, 2, 2, 'eye');
		set(13, 10, 'white');
		rect(17, 10, 2, 2, 'eye');
		set(17, 10, 'white');
		set(12, 12, 'blush');
		set(19, 12, 'blush');
		rect(15, 13, 2, 1, 'skin-dk');
	}

	// Robe, then armor over it
	if (want('robe')) {
		rect(11, 18, 10, 11, 'robe');
		for (let y = 29; y <= 36; y++) {
			const sp = Math.floor((y - 29) / 3);
			rect(11 - sp, y, 10 + 2 * sp, 1, 'robe');
			rect(19 + sp, y, 2, 1, 'robe-dk');
		}
		rect(7, 18, 3, 5, 'robe');
		rect(22, 18, 3, 5, 'robe-dk');
		rect(15, 18, 2, 11, 'gold');
	}
	if (want('armor')) {
		const t = gear.armor ?? 'heavy';
		if (t === 'light') {
			rect(11, 18, 10, 9, 'leather');
			rect(19, 18, 2, 9, 'leather-dk');
			rect(7, 18, 3, 4, 'leather');
			rect(22, 18, 3, 4, 'leather-dk');
			for (let y = 20; y < 27; y += 3) for (let x = 12; x < 20; x += 3) set(x, y, 'stud');
		} else {
			rect(11, 18, 10, 9, 'steel');
			for (let y = 18; y < 27; y++) for (let x = 11; x < 21; x++) if ((x + y) % 2) set(x, y, 'steel-dk');
			rect(12, 19, 1, 7, 'shine');
			rect(13, 17, 6, 1, 'steel-dk');
			rect(7, 18, 3, 5, 'steel');
			rect(22, 18, 3, 5, 'steel');
			rect(9, 18, 1, 5, 'steel-dk');
			rect(24, 18, 1, 5, 'steel-dk');
			if (t === 'heavy') {
				round(6, 17, 5, 3, 'steel');
				round(21, 17, 5, 3, 'steel');
				rect(7, 17, 3, 1, 'shine');
				rect(22, 17, 3, 1, 'shine');
				rect(12, 29, 8, 2, 'steel');
				for (let x = 12; x < 20; x++) if (x % 2) set(x, 30, 'steel-dk');
			}
		}
	}
	if (base) {
		rect(11, 27, 10, 2, 'belt');
		rect(15, 27, 2, 2, 'gold');
	}

	// Worn over the top
	if (want('belt')) {
		rect(11, 27, 10, 2, 'gold');
		rect(15, 27, 2, 2, 'ruby');
	}
	if (want('cloak')) {
		rect(6, 17, 16, 2, 'cloak');
		rect(22, 17, 4, 2, 'cloak-dk');
		rect(15, 18, 2, 1, 'gold');
	}
	if (want('neck')) {
		set(13, 18, 'gold');
		set(14, 19, 'gold');
		set(17, 19, 'gold');
		set(18, 18, 'gold');
		rect(15, 20, 2, 2, 'gem');
		set(15, 20, 'gem-lt');
	}
	if (want('back')) {
		rect(12, 19, 1, 8, 'strap');
		rect(19, 19, 1, 8, 'strap');
	}
	if (want('pouch')) {
		rect(17, 27, 5, 5, 'outline');
		rect(18, 28, 3, 3, 'leather');
		rect(18, 28, 3, 1, 'leather-dk');
		set(19, 29, 'gold');
	}
	if (want('feet')) {
		rect(11, 33, 4, 6, 'boot');
		rect(17, 33, 4, 6, 'boot');
		rect(11, 33, 4, 1, 'boot-lt');
		rect(17, 33, 4, 1, 'boot-lt');
		rect(14, 34, 1, 5, 'boot-dk');
		rect(20, 34, 1, 5, 'boot-dk');
	}
	if (want('bracers')) {
		rect(7, 22, 3, 2, 'gold');
		rect(22, 22, 3, 2, 'gold');
	}
	if (want('hands')) {
		rect(7, 24, 3, 4, 'gaunt');
		rect(22, 24, 3, 4, 'gaunt');
		rect(7, 24, 3, 1, 'gold');
		rect(22, 24, 3, 1, 'gold');
		rect(9, 25, 1, 3, 'gaunt-dk');
		rect(24, 25, 1, 3, 'gaunt-dk');
	}
	if (want('eyes')) {
		rect(12, 10, 8, 1, 'outline');
		rect(13, 10, 2, 2, 'lens');
		rect(17, 10, 2, 2, 'lens');
	}
	if (want('head')) {
		rect(10, 7, 12, 1, 'gold');
		rect(15, 6, 2, 2, 'ruby');
	}
	if (want('ring')) {
		set(9, 27, 'ring');
		set(10, 26, 'white');
	}

	// Held
	if (want('sword')) {
		set(8, 23, 'gold');
		rect(8, 24, 1, 4, 'grip');
		rect(6, 28, 5, 1, 'gold');
		rect(7, 29, 3, 8, 'steel');
		rect(8, 29, 1, 8, 'shine');
		set(8, 37, 'steel');
	}
	if (want('bow') && bowInHand) {
		set(6, 15, 'wood');
		set(5, 16, 'wood');
		rect(4, 17, 1, 3, 'wood');
		rect(3, 20, 1, 13, 'wood-dk');
		rect(4, 33, 1, 3, 'wood');
		set(5, 36, 'wood');
		set(6, 37, 'wood');
		rect(6, 16, 1, 21, 'string');
	}
	if (want('shield')) {
		round(20, 20, 10, 12, 'outline');
		rect(22, 32, 6, 1, 'outline');
		rect(23, 33, 4, 1, 'outline');
		round(21, 21, 8, 10, 'steel');
		rect(22, 31, 6, 1, 'steel');
		rect(23, 32, 4, 1, 'steel');
		round(22, 22, 6, 8, 'wood');
		rect(23, 30, 4, 1, 'wood');
		rect(24, 31, 2, 1, 'wood');
		rect(26, 22, 2, 9, 'wood-dk');
		round(23, 24, 4, 4, 'steel');
		rect(24, 25, 2, 2, 'shine');
	}

	// Outline everything that touches empty space
	const edge = new Set<string>();
	for (const k of g.keys()) {
		const [x, y] = k.split(',').map(Number);
		for (const [dx, dy] of [
			[1, 0],
			[-1, 0],
			[0, 1],
			[0, -1]
		]) {
			const n = `${x + dx},${y + dy}`;
			if (!g.has(n)) edge.add(n);
		}
	}
	for (const n of edge) {
		const [x, y] = n.split(',').map(Number);
		set(x, y, 'outline');
	}
	return g;
}

/** Pixels as rows of runs of one colour, so the SVG has a rect a run instead of one a pixel. */
export function runs(g: Map<string, Pixel>): { x: number; y: number; w: number; c: Pixel }[] {
	const out: { x: number; y: number; w: number; c: Pixel }[] = [];
	for (let y = 0; y < HERO_H; y++) {
		let x = 0;
		while (x < HERO_W) {
			const c = g.get(`${x},${y}`);
			if (!c) {
				x++;
				continue;
			}
			let w = 1;
			while (g.get(`${x + w},${y}`) === c) w++;
			out.push({ x, y, w, c });
			x += w;
		}
	}
	return out;
}
