import type { Character } from '$lib/types';

export interface RaceDef {
	key: string;
	name: string;
	subraces: { key: string; name: string }[];
}

const sub = (...names: string[]) => names.map((name) => ({ key: name.toLowerCase(), name }));

/** PHB races plus Custom Lineage (TCE). Keys are stored on characters, so never change them. */
export const RACES: RaceDef[] = [
	{
		key: 'dragonborn',
		name: 'Dragonborn',
		subraces: sub('Black', 'Blue', 'Brass', 'Bronze', 'Copper', 'Gold', 'Green', 'Red', 'Silver', 'White')
	},
	{ key: 'dwarf', name: 'Dwarf', subraces: sub('Hill', 'Mountain') },
	{ key: 'elf', name: 'Elf', subraces: sub('High', 'Wood', 'Drow') },
	{ key: 'gnome', name: 'Gnome', subraces: sub('Forest', 'Rock') },
	{ key: 'half-elf', name: 'Half-Elf', subraces: [] },
	{ key: 'half-orc', name: 'Half-Orc', subraces: [] },
	{ key: 'halfling', name: 'Halfling', subraces: sub('Lightfoot', 'Stout') },
	{ key: 'human', name: 'Human', subraces: sub('Variant') },
	{ key: 'tiefling', name: 'Tiefling', subraces: [] },
	{ key: 'custom-lineage', name: 'Custom Lineage', subraces: [] }
];

export const RACE_MAP = new Map(RACES.map((r) => [r.key, r]));

const LINE = '5 by 30 ft. line';
const CONE = '15 ft. cone';

/** Dragonborn breath weapon and resistance by ancestry (PHB p.34). */
export const DRAGON_ANCESTRY: Record<string, { damage: string; area: string; save: 'DEX' | 'CON' }> = {
	black: { damage: 'acid', area: LINE, save: 'DEX' },
	blue: { damage: 'lightning', area: LINE, save: 'DEX' },
	brass: { damage: 'fire', area: LINE, save: 'DEX' },
	bronze: { damage: 'lightning', area: LINE, save: 'DEX' },
	copper: { damage: 'acid', area: LINE, save: 'DEX' },
	gold: { damage: 'fire', area: CONE, save: 'DEX' },
	green: { damage: 'poison', area: CONE, save: 'CON' },
	red: { damage: 'fire', area: CONE, save: 'DEX' },
	silver: { damage: 'cold', area: CONE, save: 'CON' },
	white: { damage: 'cold', area: CONE, save: 'CON' }
};

/** "High Elf", "Red Dragonborn", "Tiefling", or '' when no race is set. */
export function raceLabel(c: Pick<Character, 'raceKey' | 'subraceKey'>): string {
	const race = c.raceKey ? RACE_MAP.get(c.raceKey) : undefined;
	if (!race) return '';
	const subrace = race.subraces.find((s) => s.key === c.subraceKey);
	return subrace ? `${subrace.name} ${race.name}` : race.name;
}
