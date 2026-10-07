import type { Character, InventoryItem, ItemUse, UseTime } from '$lib/types';
import { changeQuantity, chargesLeft, spendCharges } from './items';
import { isPotion } from './potions';

/** "As an action", "use a bonus action", "use your reaction", "requires an action", "takes an action". */
const TIMES: [UseTime, RegExp][] = [
	['action', /\b(?:an|your|its) action\b/i],
	['bonus', /\b(?:a|your) bonus action\b/i],
	['reaction', /\b(?:a|your) reaction\b/i]
];

/** Descriptions that say the item is used up: spell scrolls, dust, feather tokens, beads of force. */
const USED_UP =
	/\b(?:(?:dust|scroll|book|vial|flask) is consumed|token disappears|explodes on impact and is destroyed|crumbles to dust|key disappears|vanishes from your skin|single[- ]use|one[- ]use|used up)\b/i;

/** Mundane gear used up in one go. Poisons count too. */
const GEAR_USED_UP = new Set(['acid (vial)|phb', "alchemist's fire (flask)|phb", 'antitoxin (vial)|phb', 'holy water (flask)|phb', 'oil (flask)|phb']);

/** Gear whose description doesn't name an action but is used with one (drinking antitoxin is an action, PHB p.151). */
const GEAR_ACTION = new Set(['antitoxin (vial)|phb']);

/** Gear with a set number of uses, tracked as charges that don't come back. */
export const GEAR_USES: Record<string, number> = { "healer's kit|phb": 10 };

/**
 * How an item is used in play, read from its description: the kinds of action it names and whether using it
 * uses one up. Undefined when nothing says it's used (a Cloak of Protection just works). Weapons and armor
 * that are only gear are attacks and AC, not used; potions have their own section.
 */
export function readItemUse(i: Pick<InventoryItem, 'kind' | 'type' | 'ref'>, text: string): ItemUse | undefined {
	if (isPotion(i)) return undefined;
	if (i.kind === 'gear' && /weapon|armor|shield/i.test(i.type)) return undefined;
	const times = TIMES.filter(([, re]) => re.test(text)).map(([t]) => t);
	const poison = i.kind === 'gear' && i.type === 'Poison';
	if (poison || (i.ref && GEAR_ACTION.has(i.ref))) times.includes('action') || times.unshift('action');
	const consumed = /^Scroll/.test(i.type) || poison || (i.kind === 'gear' ? !!i.ref && GEAR_USED_UP.has(i.ref) : USED_UP.test(text));
	if (!times.length && !consumed) return undefined;
	return { times, ...(consumed ? { consumed: true } : {}) };
}

/** What an item's use is: copied from the bundled item, or read from a custom item's own description. */
export const itemUse = (i: InventoryItem): ItemUse | undefined => (i.ref ? i.use : readItemUse(i, i.notes));

/**
 * Items the character can use now: ones whose description says they're used, plus anything with charges.
 * Items that need attunement count only while attuned, and armor only while worn.
 */
export function isUsable(i: InventoryItem): boolean {
	if (isPotion(i)) return false;
	if (i.attunement && !i.attuned) return false;
	if (i.armor && !i.equipped) return false;
	return !!i.charges?.max || !!itemUse(i);
}

/** What using it costs: charges (or a gear item's uses), one of a stack, or nothing tracked. */
export function useCost(i: InventoryItem): 'charges' | 'consumed' | 'free' {
	if (i.charges?.max) return 'charges';
	return itemUse(i)?.consumed ? 'consumed' : 'free';
}

const TIME_LABEL: Record<UseTime, string> = { action: 'Action', bonus: 'Bonus action', reaction: 'Reaction' };

/** "Action · Bonus action", or empty when the description doesn't say. */
export const useTimes = (i: InventoryItem) => (itemUse(i)?.times ?? []).map((t) => TIME_LABEL[t]).join(' · ');

/**
 * Use an item: spend `charges` of its charges, or one of it when it's used up (the entry goes at none). Returns
 * false when it hasn't enough charges left. Items whose use isn't tracked are left as they are.
 */
export function useItem(c: Character, id: string, charges = 1): boolean {
	const item = c.items.find((i) => i.id === id);
	if (!item) return false;
	const cost = useCost(item);
	if (cost === 'charges') return chargesLeft(item) >= charges && spendCharges(c, id, charges);
	if (cost === 'consumed') changeQuantity(c, id, -1);
	return true;
}
