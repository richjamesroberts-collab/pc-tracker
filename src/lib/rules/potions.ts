import type { Character, InventoryItem } from '$lib/types';
import { applyHealing, applyTempHp } from './hp';
import { changeQuantity, parseRegain } from './items';

/** What the DMG healing potions restore, by name (renamed entries are matched by `ref`). */
const HEALING: Record<string, string> = {
	'potion of healing': '2d4 + 2',
	'potion of greater healing': '4d4 + 4',
	'potion of superior healing': '8d4 + 8',
	'potion of supreme healing': '10d4 + 20'
};

/** Temporary hit points a potion gives, by name (renamed entries are matched by `ref`). */
const TEMP_HP: Record<string, number> = {
	'potion of heroism': 10
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

/**
 * Temporary hit points a potion gives (Potion of Heroism: 10), or 0. Custom potions when their description says
 * "gain 10 temporary hit points".
 */
export function potionTempHp(i: Pick<InventoryItem, 'kind' | 'type' | 'ref' | 'name' | 'notes'>): number {
	if (!isPotion(i)) return 0;
	const known = TEMP_HP[i.ref?.split('|')[0] ?? ''] ?? TEMP_HP[i.name.trim().toLowerCase()];
	if (known) return known;
	const m = /(\d+)\s+temporary hit points/i.exec(i.notes ?? '');
	return m ? Number(m[1]) : 0;
}

/** Lowest and highest a healing roll can be: 2d4 + 2 is 4 to 10. */
export function healingRange(dice: string): { min: number; max: number } | null {
	const r = parseRegain(dice);
	if (!r || 'all' in r) return null;
	return { min: Math.max(0, r.count + r.bonus), max: Math.max(0, r.count * r.die + r.bonus) };
}

export interface Drunk {
	/** Hit points regained. */
	healed: number;
	/** Temporary hit points gained: the new total less the old, so 0 when the character already had as many. */
	temp: number;
}

/**
 * Drink one of a potion: one fewer (the entry goes at none), `heal` hit points regained and the potion's own
 * temporary hit points, which don't stack with ones the character already has (PHB p.198).
 */
export function drinkPotion(c: Character, id: string, heal = 0): Drunk {
	const item = c.items.find((i) => i.id === id);
	if (!item) return { healed: 0, temp: 0 };
	const temp = potionTempHp(item);
	changeQuantity(c, id, -1);
	const before = Math.max(0, c.hpCurrent);
	applyHealing(c, heal);
	const tempBefore = c.tempHp;
	applyTempHp(c, temp);
	return { healed: c.hpCurrent - before, temp: c.tempHp - tempBefore };
}
