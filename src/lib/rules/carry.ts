import type { Character, Coin, Coins, InventoryItem, Stash } from '$lib/types';
import { COINS, coinCount, gainCoins, pay, purseOf } from './coins';
import { sameStack } from './items';
import { RACE_ABILITIES, abilityBreakdown } from './stats';

/**
 * Carrying things: what the character carries and where it all is. Items are carried on the character (worn, held,
 * strapped on), in a container (a pouch, a backpack), or kept in a stash: a mount, the party's Bag of Holding
 * (carried by someone else), or a place like a guild hall or a bank. Containers the character uses are equipped;
 * only those take things on the character. Coins go in a container or a stash, never loose.
 */

/** Coins weigh a pound per 50 (PHB), so a pouch's 6 lb holds 300 coins and a sack's 30 lb holds 1,500. */
export const COINS_PER_LB = 50;
/** What a Bag of Holding holds. */
export const BAG_OF_HOLDING_LB = 500;
/** Containers loose coins go in before any other (any container holds coins, as far as it has room). */
export const COIN_CONTAINERS = ['pouch|phb', 'sack|phb'];
export const PARTY_BAG_NAME = 'Party Bag of Holding';
/** Offered when adding a place. */
export const PLACE_IDEAS = ['Guild hall', 'Safe house', 'Bank', 'Inn room', 'Home', 'Ship'];
/** PHB mounts and pack animals, with their carrying capacity. */
export const MOUNTS: { name: string; lb: number }[] = [
	{ name: 'Riding horse', lb: 480 },
	{ name: 'Warhorse', lb: 540 },
	{ name: 'Draft horse', lb: 540 },
	{ name: 'Pony', lb: 225 },
	{ name: 'Donkey or mule', lb: 420 },
	{ name: 'Camel', lb: 480 },
	{ name: 'Elephant', lb: 1320 },
	{ name: 'Mastiff', lb: 195 }
];

const empty = (): Coins => ({ cp: 0, sp: 0, ep: 0, gp: 0, pp: 0 });

type CarryInput = Pick<Character, 'items' | 'coins' | 'stashes'>;

const round = (n: number) => Math.round(n * 100) / 100;

/** Where something is: on the character (both absent), in a container (wherever that is) or in a stash. */
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

/** Containers the character has equipped: the ways they carry things on themselves (a pouch, a sack, a backpack). */
export const wornContainers = (c: Pick<Character, 'items'>) => c.items.filter((i) => i.container && i.equipped && !i.stash);

export interface CarryState {
	/** Pounds the character carries, coins included. */
	carried: number;
	/** Pounds of things on the character outside any container: worn, held or strapped on (and loose coins). */
	onPerson: number;
	/** Pounds of items in each container (by item id), however deep, without coins. */
	itemLoads: Map<string, number>;
	/** Pounds in each container: items and coins. */
	loads: Map<string, number>;
	/** Coins on the character that aren't in a container. */
	looseCoins: number;
	/** Pounds in each stash, its coins included. */
	stashLoads: Map<string, number>;
	parents: Map<string, InventoryItem>;
}

/**
 * Weights, everywhere. A container adds its own weight and, unless it's weightless inside (Bag of Holding), what's
 * in it, coins included.
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
	const loads = loadsWith((box) => (box.coins ? coinCount(box.coins) : 0) / COINS_PER_LB);
	const weigh = (i: InventoryItem) => own(i) + (i.container && !i.container.weightless ? (loads.get(i.id) ?? 0) : 0);

	const looseCoins = coinCount(c.coins);
	let carried = looseCoins / COINS_PER_LB;
	let onPerson = carried;
	const stashLoads = new Map<string, number>((c.stashes ?? []).map((s) => [s.id, coinCount(s.coins) / COINS_PER_LB]));
	for (const i of c.items) {
		if (parents.has(i.id)) continue;
		if (!i.stash) {
			carried += weigh(i);
			// A container's own weight is on the character; what's in it shows against the container.
			onPerson += i.container && i.equipped ? own(i) : weigh(i);
		} else if (stashLoads.has(i.stash)) stashLoads.set(i.stash, stashLoads.get(i.stash)! + weigh(i));
	}
	for (const [k, v] of stashLoads) stashLoads.set(k, round(v));

	return { carried: round(carried), onPerson: round(onPerson), itemLoads, loads, looseCoins, stashLoads, parents };
}

/** How many more coins a container has room for; Infinity when it has no limit. */
export function coinRoom(state: CarryState, box: InventoryItem): number {
	const lb = box.container?.lb;
	if (!box.container) return 0;
	return lb === undefined ? Infinity : Math.max(0, Math.floor(round((lb - (state.loads.get(box.id) ?? 0)) * COINS_PER_LB)));
}

/** Pounds a stash can hold: a mount's carrying capacity, the party bag's 500 lb, or no limit for a place. */
export const stashCapacity = (s: Stash) => (s.kind === 'bag' ? BAG_OF_HOLDING_LB : s.kind === 'mount' ? s.lb : undefined);

export const samePlace = (a: Place, b: Place) => (a.stash ?? '') === (b.stash ?? '') && (a.inside ?? '') === (b.inside ?? '');

/**
 * Why something can't end up where it is in `after`: a container or stash over its limit, or the character carrying
 * more than their capacity (when that's more than they carried before). Empty when it's fine.
 */
export function overLimit(before: EncumbranceInput, after: EncumbranceInput, to: Place): string {
	const state = carryState(after);
	const box = to.inside ? after.items.find((i) => i.id === to.inside) : undefined;
	if (box?.container?.lb !== undefined && (state.loads.get(box.id) ?? 0) > box.container.lb) return `${box.name} holds ${box.container.lb} lb`;
	const stashId = box ? box.stash : to.stash;
	const stash = stashId ? after.stashes.find((s) => s.id === stashId) : undefined;
	const cap = stash && stashCapacity(stash);
	if (stash && cap !== undefined && (state.stashLoads.get(stash.id) ?? 0) > cap) return `${stash.name} can carry ${cap} lb`;
	if (stash) return '';
	const now = encumbrance(after, state.carried);
	if (now.carried > now.capacity && now.carried > carryState(before).carried) return `you'd carry ${now.carried} of ${now.capacity} lb`;
	return '';
}

/**
 * Why an edited item can't be saved: more of it, or a heavier one, that won't fit where it is, or a container made
 * too small (or no longer weightless) for what's in it. Edits that add no weight and don't shrink a container always
 * save, so an entry that was already over a limit can still be renamed. Empty when it's fine.
 */
export function editProblem(c: EncumbranceInput, item: InventoryItem): string {
	const was = c.items.find((i) => i.id === item.id);
	if (!was) return '';
	const heavier = item.quantity * (item.weight ?? 0) > was.quantity * (was.weight ?? 0);
	const shrunk = (item.container?.lb ?? Infinity) < (was.container?.lb ?? Infinity) || (!!was.container?.weightless && !item.container?.weightless);
	if (!heavier && !shrunk) return '';
	const next = { ...c, items: c.items.map((i) => (i.id === item.id ? item : i)) };
	const problem = overLimit(c, next, { stash: was.stash, inside: containersOf(c).get(was.id)?.id });
	if (problem) return `${item.name} won't fit: ${problem}.`;
	const load = carryState(next).loads.get(item.id) ?? 0;
	const lb = item.container?.lb;
	if (lb !== undefined && load > lb) return `${item.name} has ${load} lb in it, more than its ${lb} lb.`;
	return '';
}

/**
 * Move an item, or `count` of a stack, to a place. A container takes everything in it along; nothing goes inside
 * itself. Things put in a stash are unequipped; a container put in another is unequipped, and one taken out onto the
 * character is equipped. A moved stack piles onto a matching one already there. Returns the id of the entry it ended
 * up in, or null if it can't go there.
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
		delete moving.coins;
		c.items.push(moving);
	}
	if (box) moving.inside = box.id;
	else delete moving.inside;
	for (const i of withContents(c, moving.id)) {
		if (stash) i.stash = stash;
		else delete i.stash;
		if (stash && i.equipped) i.equipped = false;
	}
	if (moving.container) moving.equipped = !box && !stash;
	const same = moving.container ? undefined : sameStack(c, moving);
	if (!same) return moving.id;
	same.quantity = Math.min(9999, same.quantity + moving.quantity);
	c.items = c.items.filter((i) => i !== moving);
	return same.id;
}

/**
 * A new item set to go in a place: on the character, in a container (and wherever that is) or a stash. Things in a
 * stash or container aren't equipped; a container put on the character is.
 */
export function placed(c: Pick<Character, 'items'>, item: InventoryItem, to: Place): InventoryItem {
	const box = to.inside ? c.items.find((i) => i.id === to.inside && i.container) : undefined;
	const stash = box ? box.stash : to.stash;
	const { inside: _inside, stash: _stash, ...rest } = item;
	const out: InventoryItem = { ...rest, ...(box ? { inside: box.id } : {}), ...(stash ? { stash } : {}) };
	if (out.container) out.equipped = !box && !stash;
	else if ((box || stash) && out.equipped) out.equipped = false;
	return out;
}

export const partyBag = (c: Pick<Character, 'stashes'>) => c.stashes.find((s) => s.kind === 'bag');

/** Add a place, a mount (with its carrying capacity) or the party's Bag of Holding (only one). Returns its id. */
export function addStash(c: Character, kind: Stash['kind'], name = kind === 'bag' ? PARTY_BAG_NAME : 'Stash', lb?: number): string {
	const bag = kind === 'bag' ? partyBag(c) : undefined;
	if (bag) return bag.id;
	const id = crypto.randomUUID();
	c.stashes.push({ id, name: name.trim() || 'Stash', kind, ...(kind === 'mount' && lb ? { lb } : {}), coins: empty() });
	return id;
}

/** Stop keeping things in a stash: everything in it comes back to the character, coins loose until put away. */
export function removeStash(c: Character, id: string): void {
	const stash = c.stashes.find((s) => s.id === id);
	if (!stash) return;
	for (const i of c.items) if (i.stash === id) delete i.stash;
	for (const k of COINS) c.coins[k] += stash.coins[k];
	c.stashes = c.stashes.filter((s) => s.id !== id);
}

// Coins ---------------------------------------------------------------------------------------------------------

/** The purses coins with the character are in: loose coins first, then each container on them, in list order. */
function carriedPurses(c: Character): Coins[] {
	return [c.coins, ...c.items.filter((i) => !i.stash && i.container && i.coins).map((i) => i.coins!)];
}

/** Every coin the character has with them, loose or in containers. */
export function carriedCoins(c: CarryInput): Coins {
	const out = { ...c.coins };
	for (const i of c.items) if (!i.stash && i.container && i.coins) for (const k of COINS) out[k] += i.coins[k];
	return out;
}

/** Coins in a container, or a stash's, or the loose ones. */
function purseAt(c: Character, to: Place, create = false): Coins | undefined {
	if (to.inside) {
		const box = c.items.find((i) => i.id === to.inside && i.container);
		if (box && create) box.coins ??= empty();
		return box?.coins;
	}
	return purseOf(c, to.stash);
}

/** Gain coins in a container or a stash (or loose on the character, which the app doesn't offer). */
export function gainCoinsAt(c: Character, coin: Coin, n: number, to: Place): boolean {
	if (!to.inside) return gainCoins(c, coin, n, to.stash);
	const purse = purseAt(c, to, true);
	if (!purse || !Number.isInteger(n) || n <= 0) return false;
	purse[coin] += n;
	return true;
}

/**
 * Pay `n` coins of a kind from what the character has with them, the way `pay` makes change. Loose coins go first,
 * then containers in order; change goes back in the first purse paid from.
 */
export function spendCarried(c: Character, coin: Coin, n: number): boolean {
	const purses = carriedPurses(c);
	const total = carriedCoins(c);
	const after = pay(total, coin, n);
	if (!after) return false;
	let payer: Coins | undefined;
	for (const k of COINS) {
		let take = total[k] - after[k];
		for (const p of purses) {
			if (take <= 0) break;
			const x = Math.min(p[k], take);
			if (x > 0) payer ??= p;
			p[k] -= x;
			take -= x;
		}
	}
	for (const k of COINS) if (after[k] > total[k]) (payer ?? c.coins)[k] += after[k] - total[k];
	return true;
}

/** Take `n` coins of one kind, as they are: from a stash, or from the character (loose first, then containers). */
function takeCoins(c: Character, coin: Coin, n: number, from: string | undefined, keep?: Coins): boolean {
	const purses = from ? [purseOf(c, from)].filter((p): p is Coins => !!p) : carriedPurses(c).filter((p) => p !== keep);
	if (!Number.isInteger(n) || n <= 0 || purses.reduce((t, p) => t + p[coin], 0) < n) return false;
	let left = n;
	for (const p of purses) {
		const x = Math.min(p[coin], left);
		p[coin] -= x;
		left -= x;
	}
	return true;
}

/** Move coins from the character (`from` absent) or a stash to a container or stash. */
export function moveCoinsTo(c: Character, coin: Coin, n: number, from: string | undefined, to: Place): boolean {
	if (!to.inside && (to.stash ?? '') === (from ?? '')) return false;
	const target = purseAt(c, to, true);
	if (!target || !takeCoins(c, coin, n, from, target)) return false;
	target[coin] += n;
	return true;
}

/**
 * Put loose coins in the character's equipped containers, pouches and sacks first, biggest coins first, as many as
 * fit. Returns how many went in.
 */
export function putCoinsAway(c: Character): number {
	let moved = 0;
	const purse = (i: InventoryItem) => (i.ref && COIN_CONTAINERS.includes(i.ref) ? 0 : 1);
	for (const box of [...wornContainers(c)].sort((a, b) => purse(a) - purse(b))) {
		let room = coinRoom(carryState(c), box);
		for (const k of COINS) {
			const x = Math.min(room, c.coins[k]);
			if (x <= 0) continue;
			box.coins ??= empty();
			box.coins[k] += x;
			c.coins[k] -= x;
			room -= x;
			moved += x;
		}
	}
	return moved;
}

// Encumbrance ---------------------------------------------------------------------------------------------------

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
