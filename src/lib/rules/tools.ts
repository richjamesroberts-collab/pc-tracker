import type { Character, ToolLanguages } from '$lib/types';
import { CLASS_MAP } from '$lib/data/classes';
import { raceLabel } from '$lib/data/races';
import { backgroundSkills } from './skills';
import { RACE_ABILITIES } from './stats';

/** Tools by group, lowercase as stored on the character; a pick's `from` can name a group. */
export const TOOL_GROUPS: { key: string; name: string; tools: string[] }[] = [
	{
		key: 'artisan',
		name: "Artisan's tools",
		tools: [
			"alchemist's supplies",
			"brewer's supplies",
			"calligrapher's supplies",
			"carpenter's tools",
			"cartographer's tools",
			"cobbler's tools",
			"cook's utensils",
			"glassblower's tools",
			"jeweler's tools",
			"leatherworker's tools",
			"mason's tools",
			"painter's supplies",
			"potter's tools",
			"smith's tools",
			"tinker's tools",
			"weaver's tools",
			"woodcarver's tools"
		]
	},
	{ key: 'gaming', name: 'Gaming sets', tools: ['dice set', 'dragonchess set', 'playing card set', 'three-dragon ante set'] },
	{ key: 'instrument', name: 'Musical instruments', tools: ['bagpipes', 'drum', 'dulcimer', 'flute', 'horn', 'lute', 'lyre', 'pan flute', 'shawm', 'viol'] },
	{
		key: 'other',
		name: 'Other tools',
		tools: ['disguise kit', 'forgery kit', 'herbalism kit', "navigator's tools", "poisoner's kit", "thieves' tools", 'vehicles (land)', 'vehicles (water)']
	}
];

/** The PHB's languages; druids, rogues and some races have others of their own. */
export const LANGUAGES = {
	standard: ['Common', 'Dwarvish', 'Elvish', 'Giant', 'Gnomish', 'Goblin', 'Halfling', 'Orc'],
	exotic: ['Abyssal', 'Celestial', 'Deep Speech', 'Draconic', 'Infernal', 'Primordial', 'Sylvan', 'Undercommon']
};

export const toolLabel = (tool: string) => tool[0].toUpperCase() + tool.slice(1);

/** Tools and languages from each class (PHB, TCE artificer). Rangers' favored enemy languages go up with level. */
const CLASS_GIVES: Record<string, ToolLanguages> = {
	artificer: { tools: ["thieves' tools", "tinker's tools"], pickTools: [{ count: 1, from: ['artisan'] }] },
	bard: { pickTools: [{ count: 3, from: ['instrument'] }] },
	druid: { tools: ['herbalism kit'], languages: ['Druidic'] },
	monk: { pickTools: [{ count: 1, from: ['artisan', 'instrument'] }] },
	rogue: { tools: ["thieves' tools"], languages: ["Thieves' Cant"] }
};

/** Tools and languages from subclasses, by `class/subclass`. Artificer specialists, Forge and Rune Knight's come with the subclass. */
const SUBCLASS_GIVES: Record<string, ToolLanguages> = {
	'artificer/alchemist': { tools: ["alchemist's supplies"] },
	'artificer/armorer': { tools: ["smith's tools"] },
	'artificer/artillerist': { tools: ["woodcarver's tools"] },
	'artificer/battle-smith': { tools: ["smith's tools"] },
	'cleric/forge': { tools: ["smith's tools"] },
	'cleric/knowledge': { pickLanguages: 2 },
	'fighter/battle-master': { pickTools: [{ count: 1, from: ['artisan'] }] },
	// Both are "one skill, or one language": the skill is picked on the character's skills instead.
	'fighter/cavalier': { pickLanguages: 1 },
	'fighter/samurai': { pickLanguages: 1 },
	'fighter/rune-knight': { tools: ["smith's tools"], languages: ['Giant'] },
	'monk/drunken-master': { tools: ["brewer's supplies"] },
	'monk/kensei': { pickTools: [{ count: 1, from: ["calligrapher's supplies", "painter's supplies"] }] },
	'monk/mercy': { tools: ['herbalism kit'] },
	'rogue/assassin': { tools: ['disguise kit', "poisoner's kit"] },
	'rogue/mastermind': { tools: ['disguise kit', 'forgery kit'], pickTools: [{ count: 1, from: ['gaming'] }], pickLanguages: 2 }
};

/** Tools and languages from feats, by the bundled feat's id. Skilled is taken as skills at level up. */
const FEAT_GIVES: Record<string, ToolLanguages> = {
	'artificer initiate|tce': { pickTools: [{ count: 1, from: ['artisan'] }] },
	'chef|tce': { tools: ["cook's utensils"] },
	'fey teleportation|xge': { languages: ['Sylvan'] },
	'linguist|phb': { pickLanguages: 3 },
	'poisoner|tce': { tools: ["poisoner's kit"] },
	'prodigy|xge': { pickTools: [{ count: 1 }], pickLanguages: 1 }
};

export type ToolInput = Pick<Character, 'classKey' | 'subclassKey' | 'raceKey' | 'subraceKey' | 'level' | 'feats'> & Partial<Pick<Character, 'background'>>;

/** What each thing about the character gives, named as the player knows it. */
function givers(c: ToolInput): { source: string; gives: ToolLanguages }[] {
	const cls = CLASS_MAP.get(c.classKey);
	const out: { source: string; gives: ToolLanguages | undefined }[] = [
		{ source: raceLabel(c), gives: mergeGives(c.raceKey ? RACE_ABILITIES[c.raceKey] : undefined, c.subraceKey ? RACE_ABILITIES[c.raceKey ?? '']?.subraces[c.subraceKey] : undefined) },
		{ source: cls?.name ?? c.classKey, gives: c.classKey === 'ranger' ? { pickLanguages: favoredEnemies(c.level) } : CLASS_GIVES[c.classKey] },
		{ source: cls?.subclasses.find((s) => s.key === c.subclassKey)?.name ?? '', gives: SUBCLASS_GIVES[`${c.classKey}/${c.subclassKey}`] },
		{ source: backgroundSkills(c).source, gives: c.background },
		...c.feats.map((f) => ({ source: f.name, gives: f.ref ? FEAT_GIVES[f.ref] : undefined }))
	];
	return out.filter((x): x is { source: string; gives: ToolLanguages } => !!x.gives);
}

/** Favored Enemy: one language at 1st level, and another at 6th and 14th. */
const favoredEnemies = (level: number) => (level >= 14 ? 3 : level >= 6 ? 2 : 1);

/** A race's and its subrace's together; a subrace (High Elf) can list the race's languages again. */
function mergeGives(race: ToolLanguages | undefined, sub: ToolLanguages | undefined): ToolLanguages | undefined {
	if (!race || !sub) return race ?? sub;
	return {
		tools: [...new Set([...(race.tools ?? []), ...(sub.tools ?? [])])],
		languages: [...new Set([...(race.languages ?? []), ...(sub.languages ?? [])])],
		pickTools: [...(race.pickTools ?? []), ...(sub.pickTools ?? [])],
		pickLanguages: Math.max(race.pickLanguages ?? 0, sub.pickLanguages ?? 0)
	};
}

export interface ToolSource {
	source: string;
	tools: string[];
	languages: string[];
}

/** The tools and languages the character has without picking them, by where they come from. */
export function toolSources(c: ToolInput): ToolSource[] {
	return givers(c)
		.map(({ source, gives }) => ({ source, tools: gives.tools ?? [], languages: gives.languages ?? [] }))
		.filter((s) => s.tools.length || s.languages.length);
}

export interface ToolChoice {
	source: string;
	kind: 'tool' | 'language' | 'either';
	count: number;
	/** Tools to pick from; any when left out. */
	from?: string[];
}

/** A pick's list with groups opened up. */
const toolsIn = (from: string[]) => from.flatMap((k) => TOOL_GROUPS.find((g) => g.key === k)?.tools ?? [k]);

/** The tool and language picks the character is owed, for the form to point out; none of them are enforced. */
export function toolChoices(c: ToolInput): ToolChoice[] {
	return givers(c).flatMap(({ source, gives }) => [
		...(gives.pickTools ?? []).map((p): ToolChoice => ({ source, kind: 'tool', count: p.count, ...(p.from ? { from: toolsIn(p.from) } : {}) })),
		...(gives.pickLanguages ? [{ source, kind: 'language' as const, count: gives.pickLanguages }] : []),
		...(gives.pickEither ? [{ source, kind: 'either' as const, count: gives.pickEither }] : [])
	]);
}

/**
 * How many of each choice's picks are made, each pick counting once: two "choose a language" with one picked are
 * one made and one open. Lists go first, so a tool on one isn't used up on an "any tool".
 */
export function picksMade(choices: ToolChoice[], tools: string[], languages: string[]): Map<ToolChoice, number> {
	const made = new Map<ToolChoice, number>();
	const freeTools = [...tools];
	let freeLanguages = languages.length;
	for (const ch of choices.filter((x) => x.from)) {
		const fits = freeTools.filter((t) => ch.from!.includes(t)).slice(0, ch.count);
		for (const t of fits) freeTools.splice(freeTools.indexOf(t), 1);
		made.set(ch, fits.length);
	}
	for (const ch of choices.filter((x) => !x.from)) {
		const fromLanguages = ch.kind === 'tool' ? 0 : Math.min(ch.count, freeLanguages);
		const fromTools = ch.kind === 'language' ? 0 : Math.min(ch.count - fromLanguages, freeTools.length);
		freeLanguages -= fromLanguages;
		freeTools.splice(0, fromTools);
		made.set(ch, fromLanguages + fromTools);
	}
	return made;
}

/** How many picks the character is owed, to tell when a level brings more. */
export const toolPickCount = (c: ToolInput) => toolChoices(c).reduce((n, ch) => n + ch.count, 0);

const sorted = (list: string[]) => [...new Set(list)].sort((a, b) => a.localeCompare(b));

/** Every tool the character is proficient with, given and picked. */
export const toolList = (c: ToolInput & Pick<Character, 'toolProficiencies'>) => sorted([...toolSources(c).flatMap((s) => s.tools), ...c.toolProficiencies]);

/** Every language the character knows, given and picked. */
export const languageList = (c: ToolInput & Pick<Character, 'languages'>) => sorted([...toolSources(c).flatMap((s) => s.languages), ...c.languages]);
