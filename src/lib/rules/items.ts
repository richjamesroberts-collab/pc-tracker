import type { Character, InventoryItem, ItemArmor, ItemWeapon } from '$lib/types';
import { coinCount } from './coins';

/** Three items, or more for artificers (Magic Item Adept, Savant and Master). */
export function attunementLimit(c: Pick<Character, 'classKey' | 'level'>): number {
	if (c.classKey !== 'artificer') return 3;
	return c.level >= 18 ? 6 : c.level >= 14 ? 5 : c.level >= 10 ? 4 : 3;
}

export function attunedCount(c: Character): number {
	return c.items.filter((i) => i.attuned).length;
}

/** Attune or end attunement. Fails for items that don't need it, or when already at the limit. */
export function setAttuned(c: Character, id: string, on: boolean): boolean {
	const item = c.items.find((i) => i.id === id);
	if (!item || (on && !item.attunement)) return false;
	if (on && !item.attuned && attunedCount(c) >= attunementLimit(c)) return false;
	item.attuned = on;
	return true;
}

export function chargesLeft(item: InventoryItem): number {
	if (!item.charges) return 0;
	const { max, used } = item.charges;
	return Math.min(max, Math.max(0, max - used));
}

export function spendCharges(c: Character, id: string, n = 1): boolean {
	const item = c.items.find((i) => i.id === id);
	if (!item?.charges || !Number.isInteger(n) || n <= 0 || n > chargesLeft(item)) return false;
	item.charges.used = item.charges.max - chargesLeft(item) + n;
	return true;
}

export function restoreCharges(c: Character, id: string, n = 1): void {
	const item = c.items.find((i) => i.id === id);
	if (!item?.charges || n <= 0) return;
	item.charges.used = Math.max(0, item.charges.max - chargesLeft(item) - n);
}

/** Parses a regain amount: 'all', '3', '1d6 + 1', 'd3'. Null when it can't be read. */
export function parseRegain(text: string): { all: true } | { count: number; die: number; bonus: number } | null {
	const t = text.trim().toLowerCase().replace(/\s+/g, '');
	if (t === 'all') return { all: true };
	if (/^\d+$/.test(t)) return { count: 0, die: 0, bonus: Number(t) };
	const m = /^(\d*)d(\d+)([+-]\d+)?$/.exec(t);
	if (!m) return null;
	const count = m[1] ? Number(m[1]) : 1;
	const die = Number(m[2]);
	if (count < 1 || die < 1) return null;
	return { count, die, bonus: m[3] ? Number(m[3]) : 0 };
}

/** Roll a regain amount. `random` returns [0, 1) like Math.random. */
export function rollRegain(text: string, random: () => number = Math.random): number {
	const r = parseRegain(text);
	if (!r) return 0;
	if ('all' in r) return Infinity;
	let total = r.bonus;
	for (let i = 0; i < r.count; i++) total += 1 + Math.floor(random() * r.die);
	return Math.max(0, total);
}

export interface Regained {
	name: string;
	/** Charges actually restored (never more than were spent). */
	amount: number;
}

/** Items with a dawn recharge regain charges. Returns what came back, skipping items already full. */
export function dawn(c: Character, random: () => number = Math.random): Regained[] {
	const out: Regained[] = [];
	for (const item of c.items) {
		const ch = item.charges;
		if (!ch?.regain) continue;
		const spent = ch.max - chargesLeft(item);
		if (spent <= 0) continue;
		const amount = Math.min(spent, rollRegain(ch.regain, random));
		ch.used = spent - amount;
		if (amount > 0) out.push({ name: item.name, amount });
	}
	return out;
}

/** Gear, potions, scrolls and ammunition pile up; other magic items are each their own entry. */
export function stacks(item: Pick<InventoryItem, 'kind' | 'type'>): boolean {
	return item.kind === 'gear' || /^(Potion|Scroll|Ammunition)/.test(item.type);
}

/** Add an item, or more of a matching unrenamed stack. Returns the entry's id. */
export function addItem(c: Character, item: InventoryItem): string {
	const same = stacks(item)
		? c.items.find((i) => i.kind === item.kind && i.ref === item.ref && i.name === item.name)
		: undefined;
	if (same) {
		same.quantity = Math.min(9999, same.quantity + item.quantity);
		return same.id;
	}
	c.items.push(item);
	return item.id;
}

/** Change how many the character has. Going below one removes the item. */
export function changeQuantity(c: Character, id: string, delta: number): void {
	const index = c.items.findIndex((i) => i.id === id);
	if (index < 0) return;
	const item = c.items[index];
	const next = item.quantity + delta;
	if (next < 1) c.items.splice(index, 1);
	else item.quantity = Math.min(9999, next);
}

/** Pounds carried, coins included (50 to the pound). `weightOf` can fill in weights missing from older entries. */
export function carriedWeight(c: Character, weightOf: (i: InventoryItem) => number = (i) => i.weight ?? 0): number {
	const items = c.items.reduce((n, i) => n + i.quantity * weightOf(i), 0);
	return Math.round((items + coinCount(c.coins) / 50) * 100) / 100;
}

/** An item's effects count while it's attuned (if it needs attunement) and worn (if it's armor or a shield). */
export function isActive(item: InventoryItem): boolean {
	if (item.attunement && !item.attuned) return false;
	if (item.armor && !item.equipped) return false;
	return true;
}

/** Bonuses to spell attacks and save DC from items in use (Rod of the Pact Keeper, Arcane Grimoire). */
export function itemSpellBonus(c: Pick<Character, 'items'>): { attack: number; dc: number } {
	let attack = 0;
	let dc = 0;
	for (const i of c.items ?? []) {
		if (!i.effects || !isActive(i)) continue;
		attack += i.effects.spellAttack ?? 0;
		dc += i.effects.spellDc ?? 0;
	}
	return { attack, dc };
}

/**
 * Put armor or a shield on or take it off, or ready a weapon or put it away. Wearing one suit of armor
 * (or shield) takes off any other; any number of weapons can be at hand.
 */
export function setEquipped(c: Character, id: string, on: boolean): boolean {
	const item = c.items.find((i) => i.id === id);
	if (!item?.armor && !item?.weapon) return false;
	if (on && item.armor) {
		const shield = item.armor.type === 'shield';
		for (const other of c.items) if (other.armor && other.equipped && (other.armor.type === 'shield') === shield) other.equipped = false;
	}
	item.equipped = on;
	return true;
}

/**
 * The name of a magic weapon or armor once the player picks what it is: "+1 Weapon" becomes "+1 Longsword",
 * "Armor of Fire Resistance" becomes "Chain Mail of Fire Resistance", and named ones keep their name ("Flame Tongue (Scimitar)").
 */
export function specificName(generic: string, base: string): string {
	const placeholder = /\b(Weapon|Armor)\b/;
	return placeholder.test(generic) ? generic.replace(placeholder, base) : `${generic} (${base})`;
}

/** Whether a PHB weapon can be the magic weapon of this type: "Weapon (any)", "Weapon (any axe or sword)". */
export function weaponFits(type: string, w: Pick<ItemWeapon, 'base' | 'damageType'>): boolean {
	const kind = /^Weapon \(any (.+)\)/.exec(type)?.[1];
	if (!kind) return true;
	const sword = /\bsword\b/.test(kind) && /sword|scimitar|rapier/.test(w.base);
	const axe = /\baxe\b/.test(kind) && /axe$/.test(w.base);
	return (sword || axe) && (!/slashing/.test(kind) || w.damageType === 'slashing');
}

/** Whether PHB armor can be the magic armor of this type: "Armor (any)" is any but a shield, "Armor (medium or heavy)". */
export function armorFits(type: string, a: Pick<ItemArmor, 'type'>): boolean {
	if (a.type === 'shield') return false;
	return !/medium or heavy/.test(type) || a.type !== 'light';
}

/** Magic armor the player says the kind of ("+1 Armor", "Mithral Armor"); the rest are a set armor or a shield already. */
export const picksArmor = (type: string) => type.startsWith('Armor (any') || type.startsWith('Armor (medium or heavy');
