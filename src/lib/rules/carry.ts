import type { Character, InventoryItem, Stash } from '$lib/types';
import { coinCount } from './coins';
import { sameStack } from './items';
import { RACE_ABILITIES, abilityBreakdown } from './stats';

/**
 * Carrying things: what the character carries and where it all is. Items are carried loose (worn, held, strapped
 * on), in a container (a pouch in a backpack), or kept in a stash: the party's Bag of Holding, carried by someone
 * else, or a place like a guild hall or a bank. Coins on the character are kept in containers marked for coins.
 */

/** Coins weigh a pound per 50 (PHB), so a pouch's 6 lb holds 300 coins and a sack's 30 lb holds 1,500. */
export const COINS_PER_LB = 50;
/** What a Bag of Holding holds. */
export const BAG_OF_HOLDING_LB = 500;
/** Containers that keep the character's coins as soon as they're added. */
export const COIN_CONTAINERS = ['pouch|phb', 'sack|phb'];
export const PARTY_BAG_NAME = 'Party Bag of Holding';
/** Offered when adding a place. */
export const PLACE_IDEAS = ['Guild hall', 'Safe house', 'Bank', 'Inn room', 'Home', 'Ship'];

type CarryInput = Pick<Character, 'items' | 'coins' | 'stashes'>;

const round = (n: number) => Math.round(n * 100) / 100;

/** Where something is: loose on the character (both absent), in a container (wherever that is) or in a stash. */
export interface Place {
	stash?: string;
	inside?: string;
}

/**
 * Each item's container, for items in one that still exists in the same place. A loop (a bag inside itself, from
 * an old backup) is cut, leaving the items in it loose.
 */
export function containersOf(c: Pick<Character, 'items'>): Map<string, InventoryItem> {
	const byId = new Map(c.items.map((i) => [i.id, i]));
	const box = (i: InventoryItem) => {
		const b = i.inside ? byId.get(i.inside) : undefined;
		return b?.container && b !== i && b.stash === i.stash ? b : undefined;
	};
	const out = new Map<string, InventoryItem>();
	for (const i of c.items) {
		const first = box(i);
		if (!first) continue;
		const seen = new Set([i.id]);
		let up: InventoryItem | undefined = first;
		while (up && !seen.has(up.id)) {
			seen.add(up.id);
			up = box(up);
		}
		if (!up) out.set(i.id, first);
	}
	return out;
}

/** An item and everything inside it, however deep. */
export function withContents(c: Pick<Character, 'items'>, id: string, parents = containersOf(c)): InventoryItem[] {
	const out = c.items.filter((i) => i.id === id);
	for (let n = 0; n < out.length; n++) {
		for (const i of c.items) if (parents.get(i.id) === out[n]) out.push(i);
	}
	return out;
}

export interface CarryState {
	/** Pounds the character carries, coins included. */
	carried: number;
	/** Pounds of items in each container (by item id), however deep, without coins. */
	itemLoads: Map<string, number>;
	/** Pounds in each container: items and the coins kept there. */
	loads: Map<string, number>;
	/** Coins kept in each container on the character. */
	purses: Map<string, number>;
	/** Coins on the character with no room in a coin container. */
	looseCoins: number;
	/** How many coins the character's coin containers have room for, all told. */
	coinRoom: number;
	/** Pounds in each stash, its coins included. */
	stashLoads: Map<string, number>;
	parents: Map<string, InventoryItem>;
}

/**
 * Weights, everywhere. A container adds its own weight and, unless it's weightless inside (Bag of Holding), what's
 * in it. Coins on the character go into coin containers in list order, as many as the room left after items allows;
 * the rest are loose but still weigh what they weigh.
 */
export function carryState(c: CarryInput): CarryState {
	const parents = containersOf(c);
	const kids = new Map<string, InventoryItem[]>();
	for (const i of c.items) {
		const box = parents.get(i.id);
		if (box) kids.set(box.id, [...(kids.get(box.id) ?? []), i]);
	}
	const own = (i: InventoryItem) => i.quantity * (i.weight ?? 0);

	function loadsWith(extra: (box: InventoryItem) => number): Map<string, number> {
		const memo = new Map<string, number>();
		const load = (box: InventoryItem): number => {
			const known = memo.get(box.id);
			if (known !== undefined) return known;
			let n = extra(box);
			for (const k of kids.get(box.id) ?? []) n += own(k) + (k.container && !k.container.weightless ? load(k) : 0);
			memo.set(box.id, round(n));
			return round(n);
		};
		for (const i of c.items) if (i.container) load(i);
		return memo;
	}

	const itemLoads = loadsWith(() => 0);
	const purses = new Map<string, number>();
	let left = coinCount(c.coins);
	let coinRoom = 0;
	for (const box of c.items) {
		if (box.stash || !box.container?.coins) continue;
		const lb = box.container.lb;
		const room = lb === undefined ? Infinity : Math.max(0, Math.floor(round((lb - (itemLoads.get(box.id) ?? 0)) * COINS_PER_LB)));
		coinRoom += room;
		const here = Math.min(left, room);
		if (here > 0) purses.set(box.id, here);
		left -= here;
	}
	const loads = loadsWith((box) => (purses.get(box.id) ?? 0) / COINS_PER_LB);
	const weigh = (i: InventoryItem) => own(i) + (i.container && !i.container.weightless ? (loads.get(i.id) ?? 0) : 0);

	let carried = left / COINS_PER_LB;
	const stashLoads = new Map<string, number>((c.stashes ?? []).map((s) => [s.id, coinCount(s.coins) / COINS_PER_LB]));
	for (const i of c.items) {
		if (parents.has(i.id)) continue;
		if (!i.stash) carried += weigh(i);
		else if (stashLoads.has(i.stash)) stashLoads.set(i.stash, stashLoads.get(i.stash)! + weigh(i));
	}
	for (const [k, v] of stashLoads) stashLoads.set(k, round(v));

	return { carried: round(carried), itemLoads, loads, purses, looseCoins: left, coinRoom, stashLoads, parents };
}

/** Pounds an item, or `count` of a stack, weighs where it's put: its own weight and its contents, coins left out. */
export function movingWeight(state: CarryState, i: InventoryItem, count = i.quantity): number {
	const inside = i.container && !i.container.weightless ? (state.itemLoads.get(i.id) ?? 0) : 0;
	return round(count * (i.weight ?? 0) + inside);
}

/** Pounds of room left in a container or the party's Bag of Holding; Infinity for a place, the character or no limit. */
export function roomAt(c: Pick<Character, 'items' | 'stashes'>, state: CarryState, to: Place): number {
	if (to.inside) {
		const box = c.items.find((i) => i.id === to.inside);
		if (!box?.container) return 0;
		return box.container.lb === undefined ? Infinity : round(box.container.lb - (state.itemLoads.get(box.id) ?? 0));
	}
	const stash = to.stash ? c.stashes.find((s) => s.id === to.stash) : undefined;
	if (stash?.kind === 'bag') return round(BAG_OF_HOLDING_LB - (state.stashLoads.get(stash.id) ?? 0));
	return Infinity;
}

export const samePlace = (a: Place, b: Place) => (a.stash ?? '') === (b.stash ?? '') && (a.inside ?? '') === (b.inside ?? '');

/**
 * Move an item, or `count` of a stack, to a place. A container takes everything in it along; nothing goes inside
 * itself. Things put in a stash are unequipped. A moved stack piles onto a matching one already there. Returns the
 * id of the entry it ended up in, or null if it can't go there.
 */
export function moveItem(c: Character, id: string, to: Place, count?: number): string | null {
	const item = c.items.find((i) => i.id === id);
	if (!item) return null;
	const box = to.inside ? c.items.find((i) => i.id === to.inside) : undefined;
	if (to.inside && !box?.container) return null;
	const stash = box ? box.stash : to.stash;
	if (stash && !c.stashes.some((s) => s.id === stash)) return null;
	const parents = containersOf(c);
	if (box && withContents(c, id, parents).includes(box)) return null;
	const n = count ?? item.quantity;
	if (!Number.isInteger(n) || n < 1 || n > item.quantity) return null;
	if (samePlace({ stash: item.stash, inside: parents.get(item.id)?.id }, { stash, inside: box?.id })) return null;

	let moving = item;
	if (n < item.quantity) {
		if (c.items.some((i) => parents.get(i.id) === item)) return null;
		item.quantity -= n;
		moving = { ...structuredClone(item), id: crypto.randomUUID(), quantity: n };
		c.items.push(moving);
	}
	if (box) moving.inside = box.id;
	else delete moving.inside;
	for (const i of withContents(c, moving.id)) {
		if (stash) i.stash = stash;
		else delete i.stash;
		if (stash && i.equipped) i.equipped = false;
	}
	const same = moving.container ? undefined : sameStack(c, moving);
	if (!same) return moving.id;
	same.quantity = Math.min(9999, same.quantity + moving.quantity);
	c.items = c.items.filter((i) => i !== moving);
	return same.id;
}

/** A new item set to go in a place: loose on the character, in a container (and wherever that is) or a stash. */
export function placed(c: Pick<Character, 'items'>, item: InventoryItem, to: Place): InventoryItem {
	const box = to.inside ? c.items.find((i) => i.id === to.inside && i.container) : undefined;
	const stash = box ? box.stash : to.stash;
	const { inside: _inside, stash: _stash, ...rest } = item;
	return { ...rest, ...(box ? { inside: box.id } : {}), ...(stash ? { stash } : {}), ...(stash && item.equipped ? { equipped: false } : {}) };
}

export const partyBag = (c: Pick<Character, 'stashes'>) => c.stashes.find((s) => s.kind === 'bag');

/** Add a place to keep things, or the party's Bag of Holding (only one). Returns its id. */
export function addStash(c: Character, kind: Stash['kind'], name = kind === 'bag' ? PARTY_BAG_NAME : 'Stash'): string {
	const bag = kind === 'bag' ? partyBag(c) : undefined;
	if (bag) return bag.id;
	const id = crypto.randomUUID();
	c.stashes.push({ id, name: name.trim() || 'Stash', kind, coins: { cp: 0, sp: 0, ep: 0, gp: 0, pp: 0 } });
	return id;
}

/** Stop keeping things in a stash: everything in it, coins too, comes back to the character. */
export function removeStash(c: Character, id: string): void {
	const stash = c.stashes.find((s) => s.id === id);
	if (!stash) return;
	for (const i of c.items) if (i.stash === id) delete i.stash;
	for (const k of Object.keys(stash.coins) as (keyof typeof stash.coins)[]) c.coins[k] += stash.coins[k];
	c.stashes = c.stashes.filter((s) => s.id !== id);
}

export type CarryStatus = 'light' | 'encumbered' | 'heavy' | 'over' | 'stuck';

const RANK: Record<CarryStatus, number> = { light: 0, encumbered: 1, heavy: 2, over: 3, stuck: 4 };
export const worse = (a: CarryStatus, b: CarryStatus) => RANK[a] > RANK[b];

export const CARRY_STATUS: Record<CarryStatus, { label: string; speed: (feet: number) => number; note?: string }> = {
	light: { label: 'Unencumbered', speed: (s) => s },
	encumbered: { label: 'Encumbered', speed: (s) => Math.max(0, s - 10), note: 'Speed drops by 10 feet.' },
	heavy: {
		label: 'Heavily encumbered',
		speed: (s) => Math.max(0, s - 20),
		note: 'Speed drops by 20 feet, and you have disadvantage on attack rolls and on Strength, Dexterity and Constitution ability checks and saving throws.'
	},
	over: { label: 'Over capacity', speed: (s) => Math.min(s, 5), note: 'More than you can carry: you can only push or drag it, at a speed of 5 feet.' },
	stuck: { label: "Can't move", speed: () => 0, note: 'More than twice your carrying capacity: too much to push, drag or lift.' }
};

/** Powerful Build and the like: one size larger for carrying capacity. */
export const powerfulBuild = (c: Pick<Character, 'raceKey'>) => !!RACE_ABILITIES[c.raceKey ?? '']?.powerfulBuild;

export interface Encumbrance {
	carried: number;
	str: number;
	/** STR × 15, doubled by Powerful Build. */
	capacity: number;
	/** Twice capacity: what the character can push, drag or lift. */
	pushDrag: number;
	/** Variant rule only: speed −10 ft above this (STR × 5), −20 ft above `heavyAt` (STR × 10). */
	encumberedAt?: number;
	heavyAt?: number;
	status: CarryStatus;
	powerfulBuild: boolean;
}

type EncumbranceInput = CarryInput & Parameters<typeof abilityBreakdown>[0] & Pick<Character, 'encumbranceRule'>;

/** How much the character can carry and how what they carry slows them. */
export function encumbrance(c: EncumbranceInput, carried = carryState(c).carried): Encumbrance {
	const str = abilityBreakdown(c).scores.str;
	const big = powerfulBuild(c);
	const size = big ? 2 : 1;
	const capacity = str * 15 * size;
	const variant = c.encumbranceRule === 'variant';
	const encumberedAt = variant ? str * 5 * size : undefined;
	const heavyAt = variant ? str * 10 * size : undefined;
	const status: CarryStatus =
		carried > capacity * 2
			? 'stuck'
			: carried > capacity
				? 'over'
				: heavyAt !== undefined && carried > heavyAt
					? 'heavy'
					: encumberedAt !== undefined && carried > encumberedAt
						? 'encumbered'
						: 'light';
	return { carried, str, capacity, pushDrag: capacity * 2, encumberedAt, heavyAt, status, powerfulBuild: big };
}

/**
 * Under the variant rule, more than STR × 10 means disadvantage on attack rolls and on STR, DEX and CON checks and
 * saves. Undefined when it doesn't apply.
 */
export function heavyLoadNote(c: Parameters<typeof abilityBreakdown>[0] & Partial<EncumbranceInput>): string | undefined {
	if (c.encumbranceRule !== 'variant' || !c.coins) return undefined;
	const { status } = encumbrance({ ...c, coins: c.coins, stashes: c.stashes ?? [], items: c.items ?? [] });
	return RANK[status] >= RANK.heavy ? 'Heavily encumbered: disadvantage' : undefined;
}

/** Walking speed after encumbrance. */
export const carrySpeed = (speed: number, status: CarryStatus) => CARRY_STATUS[status].speed(speed);
