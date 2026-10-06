import type { Character, InventoryItem } from '$lib/types';
import { applyHealing } from './hp';
import { changeQuantity, parseRegain } from './items';

/** What the DMG healing potions restore, by name (renamed entries are matched by `ref`). */
const HEALING: Record<string, string> = {
	'potion of healing': '2d4 + 2',
	'potion of greater healing': '4d4 + 4',
	'potion of superior healing': '8d4 + 8',
	'potion of supreme healing': '10d4 + 20'
};

/** Magic items of the Potion type (oils and philters included); mundane gear never counts. */
export const isPotion = (i: Pick<InventoryItem, 'kind' | 'type'>) => i.kind === 'magic' && /^Potion/.test(i.type);

/**
 * The hit points a potion restores ("2d4 + 2"), or null if it doesn't heal. Bundled healing potions by `ref` or
 * name; custom potions when their description says "regain 2d4 + 2 hit points".
 */
export function healingDice(i: Pick<InventoryItem, 'kind' | 'type' | 'ref' | 'name' | 'notes'>): string | null {
	if (!isPotion(i)) return null;
	const known = HEALING[i.ref?.split('|')[0] ?? ''] ?? HEALING[i.name.trim().toLowerCase()];
	if (known) return known;
	const m = /regains?\s+(\d*d\d+(?:\s*[+-]\s*\d+)?)\s+hit points/i.exec(i.notes ?? '');
	return m && parseRegain(m[1]) ? m[1].replace(/\s*([+-])\s*/, ' $1 ') : null;
}

/** Lowest and highest a healing roll can be: 2d4 + 2 is 4 to 10. */
export function healingRange(dice: string): { min: number; max: number } | null {
	const r = parseRegain(dice);
	if (!r || 'all' in r) return null;
	return { min: Math.max(0, r.count + r.bonus), max: Math.max(0, r.count * r.die + r.bonus) };
}

/** Drink one of a potion: one fewer (the entry goes at none), and any healing applied. Returns the hit points regained. */
export function drinkPotion(c: Character, id: string, heal = 0): number {
	if (!c.items.some((i) => i.id === id)) return 0;
	changeQuantity(c, id, -1);
	const before = Math.max(0, c.hpCurrent);
	applyHealing(c, heal);
	return c.hpCurrent - before;
}
