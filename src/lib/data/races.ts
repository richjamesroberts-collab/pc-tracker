import type { Character } from '$lib/types';

export interface RaceDef {
	key: string;
	name: string;
	/** Which book the race is from; the race picker groups by it. */
	book: RaceBook;
	subraces: { key: string; name: string }[];
}

export type RaceBook = 'PHB' | 'TCE' | 'VGM' | 'MPMM';

export const RACE_BOOKS: { key: RaceBook; name: string }[] = [
	{ key: 'PHB', name: "Player's Handbook" },
	{ key: 'TCE', name: "Tasha's Cauldron of Everything" },
	{ key: 'VGM', name: "Volo's Guide to Monsters" },
	{ key: 'MPMM', name: 'Monsters of the Multiverse' }
];

const sub = (...names: string[]) => names.map((name) => ({ key: name.toLowerCase(), name }));

/**
 * PHB races, Custom Lineage (TCE), Volo's Guide to Monsters and Monsters of the Multiverse. MPMM reprints
 * every VGM race, so its version has the plain key and the VGM one a -vgm suffix. Keys are stored on
 * characters, so never change them.
 */
export const RACES: RaceDef[] = [
	{
		key: 'dragonborn',
		name: 'Dragonborn',
		book: 'PHB',
		subraces: sub('Black', 'Blue', 'Brass', 'Bronze', 'Copper', 'Gold', 'Green', 'Red', 'Silver', 'White')
	},
	{ key: 'dwarf', name: 'Dwarf', book: 'PHB', subraces: sub('Hill', 'Mountain') },
	{ key: 'elf', name: 'Elf', book: 'PHB', subraces: sub('High', 'Wood', 'Drow') },
	{ key: 'gnome', name: 'Gnome', book: 'PHB', subraces: sub('Forest', 'Rock') },
	{ key: 'half-elf', name: 'Half-Elf', book: 'PHB', subraces: [] },
	{ key: 'half-orc', name: 'Half-Orc', book: 'PHB', subraces: [] },
	{ key: 'halfling', name: 'Halfling', book: 'PHB', subraces: sub('Lightfoot', 'Stout') },
	{ key: 'human', name: 'Human', book: 'PHB', subraces: sub('Variant') },
	{ key: 'tiefling', name: 'Tiefling', book: 'PHB', subraces: [] },
	{ key: 'custom-lineage', name: 'Custom Lineage', book: 'TCE', subraces: [] },
	{ key: 'aasimar-vgm', name: 'Aasimar', book: 'VGM', subraces: sub('Fallen', 'Protector', 'Scourge') },
	{ key: 'bugbear-vgm', name: 'Bugbear', book: 'VGM', subraces: [] },
	{ key: 'firbolg-vgm', name: 'Firbolg', book: 'VGM', subraces: [] },
	{ key: 'goblin-vgm', name: 'Goblin', book: 'VGM', subraces: [] },
	{ key: 'goliath-vgm', name: 'Goliath', book: 'VGM', subraces: [] },
	{ key: 'hobgoblin-vgm', name: 'Hobgoblin', book: 'VGM', subraces: [] },
	{ key: 'kenku-vgm', name: 'Kenku', book: 'VGM', subraces: [] },
	{ key: 'kobold-vgm', name: 'Kobold', book: 'VGM', subraces: [] },
	{ key: 'lizardfolk-vgm', name: 'Lizardfolk', book: 'VGM', subraces: [] },
	{ key: 'orc-vgm', name: 'Orc', book: 'VGM', subraces: [] },
	{ key: 'tabaxi-vgm', name: 'Tabaxi', book: 'VGM', subraces: [] },
	{ key: 'triton-vgm', name: 'Triton', book: 'VGM', subraces: [] },
	{ key: 'yuan-ti-pureblood-vgm', name: 'Yuan-ti Pureblood', book: 'VGM', subraces: [] },
	{ key: 'aarakocra', name: 'Aarakocra', book: 'MPMM', subraces: [] },
	{ key: 'aasimar', name: 'Aasimar', book: 'MPMM', subraces: [] },
	{ key: 'bugbear', name: 'Bugbear', book: 'MPMM', subraces: [] },
	{ key: 'centaur', name: 'Centaur', book: 'MPMM', subraces: [] },
	{ key: 'changeling', name: 'Changeling', book: 'MPMM', subraces: [] },
	{ key: 'deep-gnome', name: 'Deep Gnome', book: 'MPMM', subraces: [] },
	{ key: 'duergar', name: 'Duergar', book: 'MPMM', subraces: [] },
	{ key: 'eladrin', name: 'Eladrin', book: 'MPMM', subraces: [] },
	{ key: 'fairy', name: 'Fairy', book: 'MPMM', subraces: [] },
	{ key: 'firbolg', name: 'Firbolg', book: 'MPMM', subraces: [] },
	{ key: 'genasi', name: 'Genasi', book: 'MPMM', subraces: sub('Air', 'Earth', 'Fire', 'Water') },
	{ key: 'githyanki', name: 'Githyanki', book: 'MPMM', subraces: [] },
	{ key: 'githzerai', name: 'Githzerai', book: 'MPMM', subraces: [] },
	{ key: 'goblin', name: 'Goblin', book: 'MPMM', subraces: [] },
	{ key: 'goliath', name: 'Goliath', book: 'MPMM', subraces: [] },
	{ key: 'harengon', name: 'Harengon', book: 'MPMM', subraces: [] },
	{ key: 'hobgoblin', name: 'Hobgoblin', book: 'MPMM', subraces: [] },
	{ key: 'kenku', name: 'Kenku', book: 'MPMM', subraces: [] },
	{ key: 'kobold', name: 'Kobold', book: 'MPMM', subraces: [] },
	{ key: 'lizardfolk', name: 'Lizardfolk', book: 'MPMM', subraces: [] },
	{ key: 'minotaur', name: 'Minotaur', book: 'MPMM', subraces: [] },
	{ key: 'orc', name: 'Orc', book: 'MPMM', subraces: [] },
	{ key: 'satyr', name: 'Satyr', book: 'MPMM', subraces: [] },
	{ key: 'sea-elf', name: 'Sea Elf', book: 'MPMM', subraces: [] },
	{ key: 'shadar-kai', name: 'Shadar-Kai', book: 'MPMM', subraces: [] },
	{ key: 'shifter', name: 'Shifter', book: 'MPMM', subraces: [] },
	{ key: 'tabaxi', name: 'Tabaxi', book: 'MPMM', subraces: [] },
	{ key: 'tortle', name: 'Tortle', book: 'MPMM', subraces: [] },
	{ key: 'triton', name: 'Triton', book: 'MPMM', subraces: [] },
	{ key: 'yuan-ti', name: 'Yuan-Ti', book: 'MPMM', subraces: [] }
];

export const RACE_MAP = new Map(RACES.map((r) => [r.key, r]));

/** "High Elf", "Red Dragonborn", "Tiefling", or '' when no race is set. */
export function raceLabel(c: Pick<Character, 'raceKey' | 'subraceKey'>): string {
	const race = c.raceKey ? RACE_MAP.get(c.raceKey) : undefined;
	if (!race) return '';
	const subrace = race.subraces.find((s) => s.key === c.subraceKey);
	return subrace ? `${subrace.name} ${race.name}` : race.name;
}
