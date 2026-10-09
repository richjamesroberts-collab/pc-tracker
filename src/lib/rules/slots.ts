import type { Character, InventoryItem } from '$lib/types';

/**
 * Where a magic item is worn. The DMG (Wearing and Wielding Items) allows one pair of footwear, one pair of gloves or
 * gauntlets, one pair of bracers, one suit of armor, one item of headwear and one cloak at a time; rings are kept to
 * two, one a hand, and the rest (amulets, belts, robes, goggles) to one each.
 */
export type Slot = 'head' | 'eyes' | 'neck' | 'cloak' | 'robe' | 'hands' | 'bracers' | 'belt' | 'feet' | 'ring';

export const SLOTS: Record<Slot, { label: string; max: number }> = {
	head: { label: 'Head', max: 1 },
	eyes: { label: 'Eyes', max: 1 },
	neck: { label: 'Neck', max: 1 },
	cloak: { label: 'Cloak', max: 1 },
	robe: { label: 'Robe', max: 1 },
	hands: { label: 'Hands', max: 1 },
	bracers: { label: 'Bracers', max: 1 },
	belt: { label: 'Belt', max: 1 },
	feet: { label: 'Feet', max: 1 },
	ring: { label: 'Ring', max: 2 }
};

/** Wondrous items by what their name calls them, first match wins (a "Cap of Water Breathing" is headwear). */
const BY_NAME: [Slot, RegExp][] = [
	['head', /\b(helm|hat|circlet|crown|headband|cap|diadem|tiara|hood)\b/i],
	['eyes', /\b(goggles|lenses|spectacles|monocle)\b|\beyes of\b/i],
	['neck', /\b(amulet|necklace|periapt|medallion|brooch|scarab|talisman|torc|pendant|choker|locket)\b/i],
	['cloak', /\b(cloak|cape|mantle)\b|\bwings of flying\b/i],
	['robe', /\b(robe|vestments)\b/i],
	['hands', /\b(gloves|gauntlets)\b/i],
	['bracers', /\b(bracers|bracer|bracelets?)\b/i],
	['belt', /\b(belt|girdle)\b/i],
	['feet', /\b(boots|slippers|sandals|shoes)\b/i]
];

/** The slot a magic item is worn in: rings, and wondrous items named for something worn. Armor, shields and weapons equip their own way. */
export function slotOf(i: Pick<InventoryItem, 'kind' | 'type' | 'name'>): Slot | undefined {
	if (i.kind !== 'magic') return undefined;
	if (i.type === 'Ring') return 'ring';
	if (!i.type.startsWith('Wondrous item') || i.type.includes('tattoo')) return undefined;
	return BY_NAME.find(([, re]) => re.test(i.name))?.[0];
}

/** What the character is wearing in a slot. */
export const wornIn = (c: Pick<Character, 'items'>, slot: Slot) => c.items.filter((i) => i.equipped && !i.stash && slotOf(i) === slot);

/** What putting this on would take off: the first worn in its slot once the slot is full. */
export function displaced(c: Pick<Character, 'items'>, item: InventoryItem): InventoryItem[] {
	const slot = slotOf(item);
	if (!slot || item.equipped) return [];
	const worn = wornIn(c, slot).filter((i) => i.id !== item.id);
	return worn.slice(0, Math.max(0, worn.length - SLOTS[slot].max + 1));
}

/**
 * Wear a magic item or take it off. Putting it on takes it out of any container and takes off what it replaces.
 * Returns false for something not worn in a slot, or kept in a stash.
 */
export function setWorn(c: Character, id: string, on: boolean): boolean {
	const item = c.items.find((i) => i.id === id);
	if (!item || !slotOf(item)) return false;
	if (on && item.stash) return false;
	if (on) {
		for (const off of displaced(c, item)) off.equipped = false;
		delete item.inside;
	}
	item.equipped = on;
	return true;
}

/**
 * Characters from before magic items were worn: everything they carried counted, so whatever they have on them
 * (not in a stash or a container) is put on, as far as each slot holds. Items already marked stay as they are.
 */
export function fillWorn(c: Pick<Character, 'items'>): void {
	for (const i of c.items ?? []) {
		if (i.equipped !== undefined || !slotOf(i)) continue;
		const slot = slotOf(i)!;
		i.equipped = !i.stash && !i.inside && wornIn(c, slot).length < SLOTS[slot].max;
	}
}
