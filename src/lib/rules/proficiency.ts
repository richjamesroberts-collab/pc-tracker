import type { Character, ItemWeapon } from '$lib/types';
import { CLASS_MAP } from '$lib/data/classes';
import { RACE_MAP } from '$lib/data/races';

/** PHB weapons by category, lowercase as in `ItemWeapon.base`. */
export const WEAPONS: { category: 'simple' | 'martial'; names: string[] }[] = [
	{
		category: 'simple',
		names: ['club', 'dagger', 'greatclub', 'handaxe', 'javelin', 'light hammer', 'mace', 'quarterstaff', 'sickle', 'spear', 'light crossbow', 'dart', 'shortbow', 'sling']
	},
	{
		category: 'martial',
		names: [
			'battleaxe',
			'flail',
			'glaive',
			'greataxe',
			'greatsword',
			'halberd',
			'lance',
			'longsword',
			'maul',
			'morningstar',
			'pike',
			'rapier',
			'scimitar',
			'shortsword',
			'trident',
			'war pick',
			'warhammer',
			'whip',
			'blowgun',
			'hand crossbow',
			'heavy crossbow',
			'longbow',
			'net'
		]
	}
];

const SIMPLE_MARTIAL = ['simple', 'martial'];
const ROGUE_BARD = ['simple', 'hand crossbow', 'longsword', 'rapier', 'shortsword'];
const ARCANE = ['dagger', 'dart', 'sling', 'quarterstaff', 'light crossbow'];

/** Weapon proficiencies from each class (PHB, TCE artificer). */
const CLASS_WEAPONS: Record<string, string[]> = {
	artificer: ['simple'],
	barbarian: SIMPLE_MARTIAL,
	bard: ROGUE_BARD,
	cleric: ['simple'],
	druid: ['club', 'dagger', 'dart', 'javelin', 'mace', 'quarterstaff', 'scimitar', 'sickle', 'sling', 'spear'],
	fighter: SIMPLE_MARTIAL,
	monk: ['simple', 'shortsword'],
	paladin: SIMPLE_MARTIAL,
	ranger: SIMPLE_MARTIAL,
	rogue: ROGUE_BARD,
	sorcerer: ARCANE,
	warlock: ['simple'],
	wizard: ARCANE
};

/** Subclasses that add weapon proficiencies, keyed '<class>/<subclass>'. Kensei and Bladesinger picks are the player's. */
const SUBCLASS_WEAPONS: Record<string, string[]> = {
	'artificer/battle-smith': ['martial'],
	'bard/swords': ['scimitar'],
	'bard/valor': ['martial'],
	'cleric/tempest': ['martial'],
	'cleric/twilight': ['martial'],
	'cleric/war': ['martial'],
	'warlock/hexblade': ['martial']
};

/** Racial weapon training, keyed by race or '<race>/<subrace>'. */
const RACE_WEAPONS: Record<string, string[]> = {
	dwarf: ['battleaxe', 'handaxe', 'light hammer', 'warhammer'],
	'elf/high': ['longsword', 'shortsword', 'shortbow', 'longbow'],
	'elf/wood': ['longsword', 'shortsword', 'shortbow', 'longbow'],
	'elf/drow': ['rapier', 'shortsword', 'hand crossbow']
};

export interface ProficiencySource {
	/** Class, subclass or race name; "Your choice" for the player's own. */
	source: string;
	/** 'simple', 'martial' or weapon names. */
	weapons: string[];
}

type ProfInput = Pick<Character, 'classKey' | 'subclassKey' | 'raceKey' | 'subraceKey' | 'weaponProficiencies'>;

/** Where each weapon proficiency comes from, skipping sources that add nothing. */
export function weaponProficiencySources(c: ProfInput): ProficiencySource[] {
	const cls = CLASS_MAP.get(c.classKey);
	const race = c.raceKey ? RACE_MAP.get(c.raceKey) : undefined;
	const subrace = race?.subraces.find((s) => s.key === c.subraceKey);
	const out: ProficiencySource[] = [
		{ source: cls?.name ?? c.classKey, weapons: CLASS_WEAPONS[c.classKey] ?? [] },
		{
			source: cls?.subclasses.find((s) => s.key === c.subclassKey)?.name ?? '',
			weapons: SUBCLASS_WEAPONS[`${c.classKey}/${c.subclassKey}`] ?? []
		},
		{ source: race?.name ?? '', weapons: (c.raceKey && RACE_WEAPONS[c.raceKey]) || [] },
		{
			source: subrace ? `${subrace.name} ${race!.name}` : '',
			weapons: RACE_WEAPONS[`${c.raceKey}/${c.subraceKey}`] ?? []
		},
		{ source: 'Your choice', weapons: c.weaponProficiencies ?? [] }
	];
	return out.filter((s) => s.weapons.length);
}

/** Every weapon proficiency the character has: 'simple', 'martial' and weapon names. */
export function weaponProficiencies(c: ProfInput): Set<string> {
	return new Set(weaponProficiencySources(c).flatMap((s) => s.weapons));
}

export function isProficient(profs: Set<string>, w: Pick<ItemWeapon, 'base' | 'category'>): boolean {
	return profs.has(w.category) || profs.has(w.base);
}

/** "Simple weapons", "Martial weapons", "Longsword". */
export function proficiencyLabel(key: string): string {
	if (key === 'simple' || key === 'martial') return `${key[0].toUpperCase()}${key.slice(1)} weapons`;
	return key.replace(/\b\w/g, (ch) => ch.toUpperCase());
}

/** Proficiency names in reading order: categories first, then weapons alphabetically, without repeats. */
export function proficiencyList(keys: Iterable<string>): string[] {
	const all = [...new Set(keys)];
	const categories = SIMPLE_MARTIAL.filter((k) => all.includes(k));
	// Weapons covered by a category already are left out ("Simple weapons" covers daggers).
	const covered = new Set(WEAPONS.filter((w) => categories.includes(w.category)).flatMap((w) => w.names));
	const weapons = all.filter((k) => !SIMPLE_MARTIAL.includes(k) && !covered.has(k)).sort();
	return [...categories, ...weapons];
}
