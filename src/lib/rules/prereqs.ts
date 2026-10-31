import type { AbilityScores, Character } from '$lib/types';
import type { ClassOptionData, FeatData } from '$lib/data/content';
import { armorProficiencies, weaponProficiencies } from './proficiency';
import { RACE_ABILITIES } from './stats';

/** Monsters of the Multiverse races that count as another race for prerequisites. */
const COUNTS_AS: Record<string, string> = { 'deep-gnome': 'gnome', duergar: 'dwarf', eladrin: 'elf', 'sea-elf': 'elf', 'shadar-kai': 'elf' };

type Input = Pick<Character, 'classKey' | 'subclassKey' | 'raceKey' | 'subraceKey' | 'weaponProficiencies' | 'feats'>;

function isRace(c: Input, want: { name: string; subrace?: string }): boolean {
	const key = c.raceKey ?? '';
	if (want.name === 'small race') return !!RACE_ABILITIES[key]?.small;
	if (key !== want.name && COUNTS_AS[key] !== want.name) return false;
	return !want.subrace || c.subraceKey === want.subrace;
}

/**
 * Whether the character can take a feat. `scores` are their ability scores now, and `canCast` whether
 * they can cast a spell at the level they're taking it.
 */
export function meetsFeat(f: Pick<FeatData, 'requires'>, c: Input, scores: AbilityScores, canCast: boolean): boolean {
	const r = f.requires;
	if (!r) return true;
	if (r.race && !r.race.some((x) => isRace(c, x))) return false;
	if (r.ability && !r.ability.some((a) => Object.entries(a).every(([k, n]) => scores[k as keyof AbilityScores] >= (n ?? 0)))) return false;
	if (r.armor && !armorProficiencies(c).has(r.armor)) return false;
	if (r.weapon && !weaponProficiencies(c).has(r.weapon)) return false;
	return !r.spellcasting || canCast;
}

/** Whether the character has the spell an invocation asks for; `known` is every spell they have. */
export function meetsOptionSpells(o: Pick<ClassOptionData, 'spells'>, c: Pick<Character, 'subclassKey'>, known: Set<string>): boolean {
	return (o.spells ?? []).every((id) => (id === 'hex/curse' ? known.has('hex|phb') || c.subclassKey === 'hexblade' : known.has(id)));
}
