import grantsJson from '$lib/data/spell-grants.json';
import type { Character } from '$lib/types';

/**
 * Spells a class or subclass gives on top of the ones the player picks: domain, oath and circle spells
 * (always prepared) and subclass spells learned for free (Aberrant Mind's psionic spells, ranger subclass
 * magic, Primal Awareness). None of them count against cantrips known, spells known or spells prepared.
 * They're worked out from class, subclass and level, never stored, so they follow level ups and subclass changes.
 */
export interface SpellGrant {
	/** "Psionic Spells", "Domain Spells". */
	name: string;
	/** Short label shown on the spell: "Psionic", "Domain". */
	tag: string;
	/** 'prepared': always prepared. 'known': always known. */
	mode: 'prepared' | 'known';
	/** One of several lists the player picks from (Land terrain, Divine Soul affinity). */
	variant?: string;
	/** Class level each spell arrives at. */
	spells: { level: number; id: string; name: string }[];
}

export interface GrantedSpell {
	id: string;
	name: string;
	/** Class level it arrives at. */
	level: number;
	grant: SpellGrant;
}

/** By owner: `class` or `class/subclass`. */
const GRANTS = grantsJson as Record<string, SpellGrant[]>;

/**
 * Grant lists this character's class and subclass give, whatever their level. Lists with a variant
 * (Land terrain, Divine Soul affinity) wait for the player's pick, so they aren't included yet.
 */
export function grantsFor(c: Pick<Character, 'classKey' | 'subclassKey'>): SpellGrant[] {
	const owners = [c.classKey, ...(c.subclassKey ? [`${c.classKey}/${c.subclassKey}`] : [])];
	return owners.flatMap((o) => GRANTS[o] ?? []).filter((g) => !g.variant);
}

/** Spells the character has from grants at their level, one per spell (the first grant wins). */
export function grantedSpells(c: Pick<Character, 'classKey' | 'subclassKey' | 'level'>): GrantedSpell[] {
	const out = new Map<string, GrantedSpell>();
	for (const grant of grantsFor(c)) {
		for (const s of grant.spells) if (s.level <= c.level && !out.has(s.id)) out.set(s.id, { ...s, grant });
	}
	return [...out.values()];
}

/** Ids of granted spells, for leaving them out of counts and pick lists. */
export function grantedIds(c: Pick<Character, 'classKey' | 'subclassKey' | 'level'>): Set<string> {
	return new Set(grantedSpells(c).map((s) => s.id));
}

/** Spells the player picked that count against their limits: everything except granted spells. */
export function pickedSpells<T extends { id: string }>(c: Pick<Character, 'classKey' | 'subclassKey' | 'level'>, spells: T[]): T[] {
	const granted = grantedIds(c);
	return spells.filter((s) => !granted.has(s.id));
}

/** Granted spells new at `next` compared with `prev`, by grant: { name: 'Psionic Spells', spells: ['Calm Emotions', 'Detect Thoughts'] }. */
export function newGrants(
	prev: Pick<Character, 'classKey' | 'subclassKey' | 'level'>,
	next: Pick<Character, 'classKey' | 'subclassKey' | 'level'>
): { name: string; spells: string[] }[] {
	const had = grantedIds(prev);
	const groups = new Map<string, string[]>();
	for (const s of grantedSpells(next)) {
		if (had.has(s.id)) continue;
		groups.set(s.grant.name, [...(groups.get(s.grant.name) ?? []), s.name]);
	}
	return [...groups.entries()].map(([name, spells]) => ({ name, spells }));
}
