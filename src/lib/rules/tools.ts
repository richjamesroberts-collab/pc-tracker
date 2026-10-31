import type { Character, ToolLanguages } from '$lib/types';
import { CLASS_MAP } from '$lib/data/classes';
import { raceLabel } from '$lib/data/races';
import { backgroundSkills, fillChoices, subclassSkills } from './skills';
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

export type ToolInput = Pick<Character, 'classKey' | 'subclassKey' | 'raceKey' | 'subraceKey' | 'level' | 'feats'> & Partial<Pick<Character, 'background' | 'grantVariants'>>;

/** What `grantVariants` holds for a subclass whose skill pick was taken as a language (Cavalier, Samurai). */
export const LANGUAGE_INSTEAD = 'language';

/** What each thing about the character gives, named as the player knows it. */
function givers(c: ToolInput): { source: string; gives: ToolLanguages }[] {
	const cls = CLASS_MAP.get(c.classKey);
	const out: { source: string; gives: ToolLanguages | undefined }[] = [
		{ source: raceLabel(c), gives: mergeGives(c.raceKey ? RACE_ABILITIES[c.raceKey] : undefined, c.subraceKey ? RACE_ABILITIES[c.raceKey ?? '']?.subraces[c.subraceKey] : undefined) },
		{ source: cls?.name ?? c.classKey, gives: c.classKey === 'ranger' ? { pickLanguages: favoredEnemies(c.level) } : CLASS_GIVES[c.classKey] },
		{ source: cls?.subclasses.find((s) => s.key === c.subclassKey)?.name ?? '', gives: subclassGives(c) },
		{ source: backgroundSkills(c).source, gives: c.background },
		...c.feats.map((f) => ({ source: f.name, gives: f.ref ? FEAT_GIVES[f.ref] : undefined }))
	];
	return out.filter((x): x is { source: string; gives: ToolLanguages } => !!x.gives);
}

function subclassGives(c: ToolInput): ToolLanguages | undefined {
	const key = `${c.classKey}/${c.subclassKey}`;
	return subclassSkills(c).orLanguage && c.grantVariants?.[key] === LANGUAGE_INSTEAD ? { pickLanguages: 1 } : SUBCLASS_GIVES[key];
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
	const sources = toolSources(c);
	const repeats = (list: string[]) => list.length - new Set(list).size;
	// The PHB: a proficiency from two sources lets the player take another of the same kind.
	const twiceTools = repeats(sources.flatMap((s) => s.tools));
	const twiceLanguages = repeats(sources.flatMap((s) => s.languages));
	return [
		...givers(c).flatMap(({ source, gives }) => [
			...(gives.pickTools ?? []).map((p): ToolChoice => ({ source, kind: 'tool', count: p.count, ...(p.from ? { from: toolsIn(p.from) } : {}) })),
			...(gives.pickLanguages ? [{ source, kind: 'language' as const, count: gives.pickLanguages }] : []),
			...(gives.pickEither ? [{ source, kind: 'either' as const, count: gives.pickEither }] : [])
		]),
		...(twiceTools ? [{ source: 'From two places', kind: 'tool' as const, count: twiceTools }] : []),
		...(twiceLanguages ? [{ source: 'From two places', kind: 'language' as const, count: twiceLanguages }] : [])
	];
}

type ToolPick = { kind: 'tool' | 'language'; key: string };

const fits = (ch: ToolChoice, p: ToolPick) => ch.kind === 'either' || (ch.kind === p.kind && (!ch.from || ch.from.includes(p.key)));
const asPicks = (tools: string[], languages: string[]): ToolPick[] => [
	...tools.map((key) => ({ kind: 'tool' as const, key })),
	...languages.map((key) => ({ kind: 'language' as const, key }))
];

/** How the player's picks fill the choices, each counting once; they should leave out what the character has anyway. */
export const picksMade = (choices: ToolChoice[], tools: string[], languages: string[]) => fillChoices(choices, asPicks(tools, languages), fits).made;

/** Only the picks that fit a choice. */
export function fittingPicks(choices: ToolChoice[], tools: string[], languages: string[]): { tools: string[]; languages: string[] } {
	const { fitted } = fillChoices(choices, asPicks(tools, languages), fits);
	const of = (kind: ToolPick['kind']) => fitted.filter((p) => p.kind === kind).map((p) => p.key);
	return { tools: of('tool'), languages: of('language') };
}

/** Whether a choice still has room for this tool or language; `key` can be one no list names, which only "any" choices take. */
export function canPick(choices: ToolChoice[], tools: string[], languages: string[], kind: ToolPick['kind'], key: string): boolean {
	const now = asPicks(tools, languages);
	return fillChoices(choices, [...now, { kind, key }], fits).fitted.length > fillChoices(choices, now, fits).fitted.length;
}

/** How many picks the character is owed, to tell when a level brings more. */
export const toolPickCount = (c: ToolInput) => toolChoices(c).reduce((n, ch) => n + ch.count, 0);

const sorted = (list: string[]) => [...new Set(list)].sort((a, b) => a.localeCompare(b));

/** Every tool the character is proficient with, given and picked. */
export const toolList = (c: ToolInput & Pick<Character, 'toolProficiencies'>) => sorted([...toolSources(c).flatMap((s) => s.tools), ...c.toolProficiencies]);

/** Every language the character knows, given and picked. */
export const languageList = (c: ToolInput & Pick<Character, 'languages'>) => sorted([...toolSources(c).flatMap((s) => s.languages), ...c.languages]);
