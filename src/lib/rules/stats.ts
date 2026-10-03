import raceAbilitiesJson from '$lib/data/race-abilities.json';
import type { Ability, AbilityScores, Character, InventoryItem } from '$lib/types';
import { ABILITIES, ABILITY_SHORT, abilityMod, signedMod } from './abilities';
import { isActive } from './items';
import { proficiencyBonus, spellAbility } from './spellcasting';

/**
 * Worked-out numbers. The player enters base values (ability scores before race and items, max HP
 * without items, AC or "work it out"); `recompute` turns them into the `ac`, `hpMax`, `spellMod` and
 * `initiativeModifier` the rest of the app reads. Everything here is synchronous: items carry copies
 * of their effects, and racial increases are bundled.
 */

export interface RaceAsi {
	fixed: Partial<AbilityScores>;
	choose?: { from: Ability[]; count: number; amount: number };
}

interface RaceAbilities {
	asi?: RaceAsi;
	subraces: Record<string, { asi?: RaceAsi; replaces?: true }>;
}

const RACE_ABILITIES = raceAbilitiesJson as Record<string, RaceAbilities>;

/** One line in a breakdown: where a change to a number came from. */
export interface StatSource {
	label: string;
	/** "+2", "becomes 19", "16". */
	value: string;
}

export interface AbilityBreakdown {
	/** Totals with everything applied. */
	scores: AbilityScores;
	/** Totals without magic items, which is what the player's max HP was worked out with. */
	withoutItems: AbilityScores;
	/** What changed each score, beyond the base. */
	sources: Record<Ability, StatSource[]>;
}

/** The racial increases that apply, after subrace replacement. Free choices come from `raceAbilityChoices`. */
export function raceAsi(c: Pick<Character, 'raceKey' | 'subraceKey'>): RaceAsi[] {
	const race = c.raceKey ? RACE_ABILITIES[c.raceKey] : undefined;
	if (!race) return [];
	const sub = c.subraceKey ? race.subraces[c.subraceKey] : undefined;
	if (sub?.replaces) return sub.asi ? [sub.asi] : [];
	return [race.asi, sub?.asi].filter((x): x is RaceAsi => !!x);
}

/** The free racial picks the race allows: how many, how much each, and from which abilities. */
export function raceChoice(c: Pick<Character, 'raceKey' | 'subraceKey'>): RaceAsi['choose'] {
	return raceAsi(c).find((a) => a.choose)?.choose;
}

export function abilityBreakdown(
	c: Pick<Character, 'abilities' | 'raceKey' | 'subraceKey' | 'raceAbilityChoices' | 'classKey' | 'level' | 'items'>
): AbilityBreakdown {
	const scores = { ...c.abilities };
	const sources = Object.fromEntries(ABILITIES.map((a) => [a.key, [] as StatSource[]])) as Record<Ability, StatSource[]>;
	const add = (k: Ability, n: number, label: string) => {
		if (!n) return;
		scores[k] += n;
		sources[k].push({ label, value: signedMod(n) });
	};

	// Race: fixed increases, then the player's free picks (only valid, distinct ones).
	for (const asi of raceAsi(c)) {
		for (const [k, n] of Object.entries(asi.fixed) as [Ability, number][]) add(k, n, 'Race');
		if (asi.choose) {
			const picks = [...new Set(c.raceAbilityChoices ?? [])].filter((k) => asi.choose!.from.includes(k)).slice(0, asi.choose.count);
			for (const k of picks) add(k, asi.choose.amount, 'Race (your pick)');
		}
	}

	// Primal Champion: +4 Strength and Constitution, to a maximum of 24.
	if (c.classKey === 'barbarian' && c.level >= 20) {
		for (const k of ['str', 'con'] as const) {
			const before = scores[k];
			scores[k] = Math.max(before, Math.min(24, before + 4));
			if (scores[k] !== before) sources[k].push({ label: 'Primal Champion', value: signedMod(scores[k] - before) });
		}
	}

	const withoutItems = { ...scores };

	// Items: increases first (each up to its own maximum), then "becomes X" items, which win if higher.
	const active = (c.items ?? []).filter((i) => i.effects && isActive(i));
	for (const i of active) {
		const max = i.effects!.addMax ?? 20;
		for (const [k, n] of Object.entries(i.effects!.add ?? {}) as [Ability, number][]) {
			const before = scores[k];
			scores[k] = before >= max ? before : Math.min(max, before + n);
			if (scores[k] !== before) sources[k].push({ label: i.name, value: signedMod(scores[k] - before) });
		}
	}
	for (const i of active) {
		for (const [k, n] of Object.entries(i.effects!.set ?? {}) as [Ability, number][]) {
			if (n > scores[k]) {
				scores[k] = n;
				sources[k].push({ label: i.name, value: `becomes ${n}` });
			}
		}
	}

	return { scores, withoutItems, sources };
}

export const abilityScores = (c: Parameters<typeof abilityBreakdown>[0]) => abilityBreakdown(c).scores;

type StatInput = Pick<
	Character,
	| 'abilities'
	| 'raceKey'
	| 'subraceKey'
	| 'raceAbilityChoices'
	| 'classKey'
	| 'subclassKey'
	| 'level'
	| 'items'
	| 'acAuto'
	| 'acBase'
	| 'acAdjust'
	| 'hpBase'
	| 'initiativeOverride'
	| 'spellModOverride'
>;

export interface Breakdown {
	total: number;
	parts: StatSource[];
}

// Worn armor gives its base AC even unattuned; only its magic bonus needs attunement.
const equippedArmor = (items: InventoryItem[]) => items.filter((i) => i.armor && i.equipped);
const magicAc = (i: InventoryItem) => (isActive(i) ? (i.effects?.ac ?? 0) : 0);

/** AC worked out from armor, shield, DEX, features and items, or from the player's own AC. */
export function armorClass(c: StatInput, scores = abilityScores(c)): Breakdown {
	const parts: StatSource[] = [];
	const dex = abilityMod(scores.dex);
	const worn = equippedArmor(c.items ?? []);
	const body = worn
		.filter((i) => i.armor!.type !== 'shield')
		.sort((a, b) => b.armor!.ac + magicAc(b) - (a.armor!.ac + magicAc(a)))[0];
	const shield = worn.find((i) => i.armor!.type === 'shield');
	let total: number;

	if (!c.acAuto) {
		total = c.acBase;
		parts.push({ label: 'Your AC', value: `${c.acBase}` });
	} else if (body) {
		const { type, ac } = body.armor!;
		const dexPart = type === 'light' ? dex : type === 'medium' ? Math.min(dex, 2) : 0;
		total = ac + dexPart;
		parts.push({ label: body.name, value: `${ac}` });
		if (dexPart) parts.push({ label: type === 'medium' ? 'DEX (max 2)' : 'DEX', value: signedMod(dexPart) });
	} else {
		const options: { total: number; parts: StatSource[] }[] = [
			{ total: 10 + dex, parts: [{ label: 'Unarmored', value: '10' }, { label: 'DEX', value: signedMod(dex) }] }
		];
		if (c.classKey === 'barbarian') {
			const con = abilityMod(scores.con);
			options.push({
				total: 10 + dex + con,
				parts: [
					{ label: 'Unarmored Defense', value: '10' },
					{ label: 'DEX', value: signedMod(dex) },
					{ label: 'CON', value: signedMod(con) }
				]
			});
		}
		if (c.classKey === 'monk' && !shield) {
			const wis = abilityMod(scores.wis);
			options.push({
				total: 10 + dex + wis,
				parts: [
					{ label: 'Unarmored Defense', value: '10' },
					{ label: 'DEX', value: signedMod(dex) },
					{ label: 'WIS', value: signedMod(wis) }
				]
			});
		}
		if (c.classKey === 'sorcerer' && c.subclassKey === 'draconic') {
			options.push({
				total: 13 + dex,
				parts: [
					{ label: 'Draconic Resilience', value: '13' },
					{ label: 'DEX', value: signedMod(dex) }
				]
			});
		}
		const best = options.sort((a, b) => b.total - a.total)[0];
		total = best.total;
		parts.push(...best.parts);
	}

	if (c.acAuto && shield) {
		total += shield.armor!.ac;
		parts.push({ label: shield.name, value: signedMod(shield.armor!.ac) });
	}

	// Magic bonuses: armor and shields only while worn (and only in auto mode, where they're modelled),
	// everything else while attuned.
	// Worn armor and shields first, so their bonus reads next to them in the breakdown.
	const bonusItems = (c.items ?? []).filter((i) => i.effects?.ac && isActive(i)).sort((a, b) => Number(!!b.armor) - Number(!!a.armor));
	for (const i of bonusItems) {
		if (i.armor && !c.acAuto) continue;
		if (i.effects!.unarmoredOnly && c.acAuto && (body || shield)) continue;
		total += i.effects!.ac!;
		parts.push({ label: i.name, value: signedMod(i.effects!.ac!) });
	}

	if (c.acAdjust) {
		total += c.acAdjust;
		parts.push({ label: 'Adjustment', value: signedMod(c.acAdjust) });
	}
	return { total: Math.max(0, total), parts };
}

/** Initiative: DEX plus Jack of All Trades or Remarkable Athlete, unless the player set their own. */
export function initiative(c: StatInput, scores = abilityScores(c)): Breakdown {
	if (c.initiativeOverride != null) return { total: c.initiativeOverride, parts: [{ label: 'Your initiative', value: signedMod(c.initiativeOverride) }] };
	const dex = abilityMod(scores.dex);
	const parts: StatSource[] = [{ label: 'DEX', value: signedMod(dex) }];
	let total = dex;
	const prof = proficiencyBonus(c.level);
	if (c.classKey === 'bard' && c.level >= 2) {
		const n = Math.floor(prof / 2);
		total += n;
		parts.push({ label: 'Jack of All Trades', value: signedMod(n) });
	} else if (c.classKey === 'fighter' && c.subclassKey === 'champion' && c.level >= 7) {
		const n = Math.ceil(prof / 2);
		total += n;
		parts.push({ label: 'Remarkable Athlete', value: signedMod(n) });
	}
	return { total, parts };
}

/** The spellcasting ability modifier, unless the player set their own. */
export function spellcastingMod(c: StatInput, scores = abilityScores(c)): number {
	if (c.spellModOverride != null) return c.spellModOverride;
	const ability = spellAbility(c.classKey);
	return ability ? abilityMod(scores[ability]) : 0;
}

/** Max HP: what the player entered, plus a level's worth of any Constitution modifier change from items. */
export function maxHp(c: StatInput, breakdown = abilityBreakdown(c)): Breakdown {
	const diff = abilityMod(breakdown.scores.con) - abilityMod(breakdown.withoutItems.con);
	const parts: StatSource[] = [{ label: 'Your max HP', value: `${c.hpBase}` }];
	if (diff) parts.push({ label: `CON ${signedMod(diff)} × level ${c.level} (items)`, value: signedMod(diff * c.level) });
	return { total: Math.max(1, c.hpBase + diff * c.level), parts };
}

/** Refresh the worked-out numbers on a character, in place. Current HP drops if the max fell below it. */
export function recompute<T extends Character>(c: T): T {
	const breakdown = abilityBreakdown(c);
	c.ac = armorClass(c, breakdown.scores).total;
	c.hpMax = maxHp(c, breakdown).total;
	c.hpCurrent = Math.min(c.hpCurrent, c.hpMax);
	c.spellMod = spellcastingMod(c, breakdown.scores);
	c.initiativeModifier = initiative(c, breakdown.scores).total;
	return c;
}

/** "INT 19 (Headband of Intellect)" style summary of an item's effects, for the inventory. */
export function describeEffects(i: InventoryItem): string {
	const e = i.effects;
	if (!e) return '';
	const out: string[] = [];
	for (const [k, n] of Object.entries(e.set ?? {}) as [Ability, number][]) out.push(`${ABILITY_SHORT[k]} becomes ${n}`);
	for (const [k, n] of Object.entries(e.add ?? {}) as [Ability, number][]) out.push(`${ABILITY_SHORT[k]} ${signedMod(n)} (max ${e.addMax ?? 20})`);
	if (e.ac) out.push(`AC ${signedMod(e.ac)}${e.unarmoredOnly ? ' without armor or shield' : ''}`);
	if (e.spellAttack) out.push(`Spell attack ${signedMod(e.spellAttack)}`);
	if (e.spellDc) out.push(`Spell save DC ${signedMod(e.spellDc)}`);
	return out.join(' · ');
}

/**
 * Set the AC shown to `total`: in auto mode by changing the temporary adjustment, otherwise by changing
 * the player's own AC. Run `recompute` afterwards (session.mutate does).
 */
export function setAcTotal(c: Character, total: number): void {
	const diff = total - armorClass(c).total;
	if (c.acAuto) c.acAdjust += diff;
	else c.acBase += diff;
}
