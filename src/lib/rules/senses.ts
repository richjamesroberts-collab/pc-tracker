import type { Character } from '$lib/types';

export interface Sense {
	/** "Darkvision", "Blindsight", "Blindsense". */
	name: string;
	/** Feet. */
	range: number;
	/** Where it comes from: race, feature or "Your choice". */
	sources: string[];
}

/** Racial darkvision, keyed by race or '<race>/<subrace>' (Superior Darkvision). */
const RACE_DARKVISION: Record<string, number> = {
	dwarf: 60,
	elf: 60,
	'elf/drow': 120,
	gnome: 60,
	'half-elf': 60,
	'half-orc': 60,
	tiefling: 60
};

type SenseInput = Pick<Character, 'raceKey' | 'subraceKey' | 'classKey' | 'subclassKey' | 'level' | 'fightingStyles' | 'senses'>;

/** The darkvision a character's race gives, or 0. */
export function raceDarkvision(c: Pick<Character, 'raceKey' | 'subraceKey'>): number {
	if (!c.raceKey) return 0;
	return RACE_DARKVISION[`${c.raceKey}/${c.subraceKey}`] ?? RACE_DARKVISION[c.raceKey] ?? 0;
}

/**
 * Senses from race, class features, fighting styles and the player's own list. When two sources give
 * the same sense, the longer range wins (Gloom Stalker adds to racial darkvision instead).
 */
export function senses(c: SenseInput): Sense[] {
	const found = new Map<string, Sense>();
	const add = (name: string, range: number, source: string) => {
		const key = name.trim().toLowerCase();
		if (!key || !(range > 0)) return;
		const have = found.get(key);
		if (!have) found.set(key, { name: name.trim(), range, sources: [source] });
		else {
			have.range = Math.max(have.range, range);
			have.sources.push(source);
		}
	};

	const race = raceDarkvision(c);
	if (race) add('Darkvision', race, c.subraceKey === 'drow' ? 'Superior Darkvision' : 'Race');

	const sub = `${c.classKey}/${c.subclassKey}`;
	if (sub === 'sorcerer/shadow') add('Darkvision', 120, 'Eyes of the Dark');
	if (sub === 'cleric/twilight') add('Darkvision', 300, 'Eyes of Night');
	// Umbral Sight: darkvision 60 ft, or 30 ft more if the race already gives it.
	if (sub === 'ranger/gloom-stalker' && c.level >= 3) add('Darkvision', race ? race + 30 : 60, 'Umbral Sight');
	if (c.classKey === 'rogue' && c.level >= 14) add('Blindsense', 10, 'Blindsense');
	if (c.fightingStyles?.includes('blind-fighting')) add('Blindsight', 10, 'Blind Fighting');

	for (const s of c.senses ?? []) add(s.name, s.range, 'Your choice');
	return [...found.values()];
}
