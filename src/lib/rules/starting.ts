import type { Character, Coin, InventoryItem } from '$lib/types';
import { gearInventoryItem, plainItem, unpack, type GearItem } from '$lib/data/content';
import { COIN_CONTAINERS, gainCoinsAt, packPlan, placed } from './carry';
import { addItem, setEquipped } from './items';

/** One thing in a class's or background's starting equipment. */
export interface KitEntry {
	/** Bundled gear; `name` then replaces its name, as the book calls it ("Prayer book"). */
	ref?: string;
	/** A thing that isn't on the gear list, or the book's name for one that is. */
	name?: string;
	quantity: number;
	/** The book's full wording, for the item's notes. */
	note?: string;
	/** A key of `KIT_PICKS`: the player picks the gear. */
	pick?: string;
	/** Coins in copper, held by this entry when it's a pouch. */
	coins?: number;
}

export interface KitOption {
	label: string;
	items: KitEntry[];
}

/** One line of a book's equipment list; several options mean the player chooses. */
export interface KitRow {
	options: KitOption[];
}

export interface ClassKit {
	/** The dice to roll for starting gold instead of equipment: 5d4 × 10 gp. */
	gold: { count: number; sides: number; times: number };
	rows: KitRow[];
}

const weapon = (category: 'simple' | 'martial', melee = false) => (g: GearItem) => g.weapon?.category === category && !(melee && g.weapon.ranged);
const ofType = (type: string) => (g: GearItem) => g.type === type;

/** What each `KitEntry.pick` offers. */
export const KIT_PICKS: Record<string, { label: string; fits: (g: GearItem) => boolean }> = {
	weaponSimple: { label: 'Simple weapon', fits: weapon('simple') },
	weaponSimpleMelee: { label: 'Simple melee weapon', fits: weapon('simple', true) },
	weaponMartial: { label: 'Martial weapon', fits: weapon('martial') },
	weaponMartialMelee: { label: 'Martial melee weapon', fits: weapon('martial', true) },
	instrumentMusical: { label: 'Musical instrument', fits: ofType('Musical instrument') },
	focusSpellcastingArcane: { label: 'Arcane focus', fits: ofType('Arcane focus') },
	focusSpellcastingDruidic: { label: 'Druidic focus', fits: ofType('Druidic focus') },
	focusSpellcastingHoly: { label: 'Holy symbol', fits: ofType('Holy symbol') },
	toolArtisan: { label: "Artisan's tools", fits: ofType("Artisan's tools") },
	setGaming: { label: 'Gaming set', fits: ofType('Gaming set') }
};

/** How a new character gets their things: the books' equipment, or rolled gold instead of all of it, or neither for now. */
export interface KitChoices {
	mode: 'kit' | 'gold' | 'later';
	/** The option taken in each row with a choice, by row key (`class:0`); the first when absent. */
	options: Record<string, number>;
	/** The gear picked for entries with a `pick`, by entry key (`class:0:1:0`). */
	picks: Record<string, string | undefined>;
	gold: number | null;
	/** The background whose equipment a Custom Background takes. */
	borrow?: string;
}

export const newKitChoices = (): KitChoices => ({ mode: 'kit', options: {}, picks: {}, gold: null });

/** The entries the choices come to, each with its key. */
export function chosenEntries(rows: KitRow[], prefix: string, choices: KitChoices): (KitEntry & { key: string })[] {
	return rows.flatMap((row, r) => {
		const at = row.options[choices.options[`${prefix}:${r}`] ?? 0] ? (choices.options[`${prefix}:${r}`] ?? 0) : 0;
		return row.options[at].items.map((e, i) => ({ ...e, key: `${prefix}:${r}:${at}:${i}` }));
	});
}

/** Roll starting gold. */
export function rollGold({ count, sides, times }: ClassKit['gold'], random = Math.random): number {
	let total = 0;
	for (let i = 0; i < count; i++) total += Math.floor(random() * sides) + 1;
	return total * times;
}

/** Things kept in a backpack when there's room; the rest stays at hand (focuses, instruments, ammunition) or is worn. */
const STOWED = new Set(['', 'Adventuring gear', "Artisan's tools", 'Tool', 'Gaming set']);

/**
 * Hand a new character their starting equipment. Armor goes on and weapons are at hand, so AC and Attacks are ready; a pack
 * goes in its own backpack, other gear joins it while there's room, and coins go in a pouch when there is one.
 */
export function giveKit(c: Character, entries: (KitEntry & { key: string })[], choices: KitChoices, byId: Map<string, GearItem>): void {
	let copper = 0;
	const singles: InventoryItem[] = [];
	for (const e of entries) {
		copper += e.coins ?? 0;
		const g = byId.get((e.pick ? choices.picks[e.key] : e.ref) ?? '');
		if (g?.contents) {
			const items = unpack(g, byId);
			const plan = packPlan(items);
			const inside = new Set(plan?.inside);
			for (const i of items) if (!inside.has(i.id)) addItem(c, placed(c, i, {}));
			for (const i of items) if (inside.has(i.id)) addItem(c, placed(c, i, { inside: plan?.box }));
		} else if (g || e.name) {
			const item = g ? gearInventoryItem(g, e.quantity) : plainItem(e.name!, e.quantity);
			singles.push({ ...item, name: e.name ?? item.name, notes: e.note ?? '' });
		}
	}

	const bag = c.items.find((i) => i.ref === 'backpack|phb' && i.equipped);
	const weightOf = (i: InventoryItem) => (i.weight ?? 0) * i.quantity;
	let room = (bag?.container?.lb ?? 0) - c.items.filter((i) => i.inside === bag?.id).reduce((n, i) => n + weightOf(i), 0);
	for (const i of singles) {
		if (i.armor || i.weapon) setEquipped(c, addItem(c, placed(c, i, {})), true);
		else if (bag && !i.container && STOWED.has(i.type) && weightOf(i) <= room) {
			room -= weightOf(i);
			addItem(c, placed(c, i, { inside: bag.id }));
		} else addItem(c, placed(c, i, {}));
	}

	const purse = c.items.find((i) => i.ref && COIN_CONTAINERS.includes(i.ref) && i.equipped);
	const amounts: [Coin, number][] = [
		['gp', Math.floor(copper / 100)],
		['sp', Math.floor((copper % 100) / 10)],
		['cp', copper % 10]
	];
	for (const [coin, n] of amounts) {
		if (!n) continue;
		if (purse) gainCoinsAt(c, coin, n, { inside: purse.id });
		else c.coins[coin] += n;
	}
}
