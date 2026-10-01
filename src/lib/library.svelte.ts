import srdData from '$lib/data/srd-spells.json';
import { db } from '$lib/db';
import type { Character, Spell, SpellPack } from '$lib/types';

const bySort = (a: Spell, b: Spell) => a.level - b.level || a.name.localeCompare(b.name);

/** SRD 5.1 spells bundled with the app (CC-BY-4.0). */
export const SRD_SPELLS: Spell[] = (srdData as Spell[]).map((s) => ({ ...s, pack: 'srd' }));

/**
 * Every spell available on this device: the bundled SRD plus imported spell packs.
 * A pack spell with the same id as an SRD spell replaces it (e.g. the PHB "Bigby's Hand" over SRD "Arcane Hand").
 */
class Library {
	packs = $state.raw<SpellPack[]>([]);
	loaded = $state(false);

	spells = $derived.by(() => {
		const map = new Map<string, Spell>();
		for (const s of SRD_SPELLS) map.set(s.id, s);
		for (const p of this.packs) for (const s of p.spells) map.set(s.id, { ...s, pack: p.id });
		return [...map.values()].sort(bySort);
	});

	byId = $derived(new Map(this.spells.map((s) => [s.id, s])));

	async load(): Promise<void> {
		this.packs = await db.spellPacks.toArray();
		this.loaded = true;
	}

	async install(pack: SpellPack): Promise<void> {
		await db.spellPacks.put(pack);
		await this.load();
	}

	async remove(id: string): Promise<void> {
		await db.spellPacks.delete(id);
		await this.load();
	}

	packName(id: string | undefined): string {
		if (id === 'srd') return 'SRD';
		if (id === 'custom') return 'Custom';
		return this.packs.find((p) => p.id === id)?.name ?? 'Saved copy';
	}
}

export const library = new Library();

/** Resolve a spell for a character: installed library first, then their custom spells, then their saved copies. */
export function findSpell(c: Pick<Character, 'customSpells' | 'spellCache'>, id: string): Spell | undefined {
	return (
		library.byId.get(id) ??
		withPack(c.customSpells.find((s) => s.id === id), 'custom') ??
		withPack(c.spellCache.find((s) => s.id === id), 'cache')
	);
}

function withPack(s: Spell | undefined, pack: string): Spell | undefined {
	return s && { ...s, pack };
}

/** The character's spells resolved to full data, sorted by level then name. */
export function characterSpells(c: Character): { spell: Spell; prepared: boolean }[] {
	return c.spells
		.map((cs) => ({ spell: findSpell(c, cs.id), prepared: cs.prepared }))
		.filter((x): x is { spell: Spell; prepared: boolean } => !!x.spell)
		.sort((a, b) => bySort(a.spell, b.spell));
}

/** Spell ids the character has but this device can't show (pack not installed and no saved copy). */
export function missingSpellIds(c: Character): string[] {
	return c.spells.map((s) => s.id).filter((id) => !findSpell(c, id));
}

/** A readable name for a missing spell id like `toll the dead|xge`. */
export function nameFromId(id: string): string {
	const name = id.split('|')[0];
	return name.replace(/\b\w/g, (ch) => ch.toUpperCase());
}

/** Spells shown in the spellbook: the library plus this character's custom spells and saved copies. */
export function spellPool(c: Character): Spell[] {
	const map = new Map(library.spells.map((s) => [s.id, s]));
	for (const s of c.spellCache) if (!map.has(s.id)) map.set(s.id, { ...s, pack: 'cache' });
	for (const s of c.customSpells) map.set(s.id, { ...s, pack: 'custom' });
	return [...map.values()].sort(bySort);
}

/** Keep a stored copy of a pack spell on the character so their backups are self-contained. SRD and custom spells don't need one. */
export function cacheSpell(c: Character, spell: Spell): void {
	if (spell.pack === 'srd' || spell.pack === 'custom' || spell.pack === 'cache') return;
	const { pack: _pack, ...copy } = spell;
	c.spellCache = [...c.spellCache.filter((s) => s.id !== spell.id), copy];
}

export function uncacheSpell(c: Character, id: string): void {
	c.spellCache = c.spellCache.filter((s) => s.id !== id);
}

export function spellMeta(s: Spell): string {
	return [s.time, s.range].filter(Boolean).join(' · ');
}

/** Spell list a class can pick from; Eldritch Knights and Arcane Tricksters use the wizard list. */
export function spellListClass(c: Pick<Character, 'classKey'>): string {
	return c.classKey === 'fighter' || c.classKey === 'rogue' ? 'wizard' : c.classKey;
}
