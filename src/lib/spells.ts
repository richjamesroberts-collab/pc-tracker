import data from '$lib/data/spells.json';
import type { Character, Spell } from '$lib/types';

export const ALL_SPELLS = data as Spell[];

const byId = new Map(ALL_SPELLS.map((s) => [s.id, s]));

export function findSpell(c: Pick<Character, 'customSpells'>, id: string): Spell | undefined {
	return byId.get(id) ?? c.customSpells.find((s) => s.id === id);
}

/** The character's spells resolved to full data, sorted by level then name. */
export function characterSpells(c: Character): { spell: Spell; prepared: boolean }[] {
	return c.spells
		.map((cs) => ({ spell: findSpell(c, cs.id), prepared: cs.prepared }))
		.filter((x): x is { spell: Spell; prepared: boolean } => !!x.spell)
		.sort((a, b) => a.spell.level - b.spell.level || a.spell.name.localeCompare(b.spell.name));
}

/** Short combat-relevant summary line, e.g. "1 action · 150 ft". */
export function spellMeta(s: Spell): string {
	return [s.time, s.range].filter(Boolean).join(' · ');
}

/** Spell list a class can pick from; Eldritch Knights and Arcane Tricksters use the wizard list. */
export function spellListClass(c: Pick<Character, 'classKey'>): string {
	return c.classKey === 'fighter' || c.classKey === 'rogue' ? 'wizard' : c.classKey;
}
