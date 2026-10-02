import type { Character } from '$lib/types';
import { CLASS_MAP } from './classes';
import { RACE_MAP, raceLabel } from './races';

export interface Feature {
	name: string;
	level: number;
	/** Plain paragraphs joined by `\n`. */
	text: string;
	/** TCE optional class feature. */
	optional?: true;
}

export interface ClassContent {
	name: string;
	features: Feature[];
	/** Keyed by our subclass key (see classes.ts). */
	subclasses: Record<string, Feature[]>;
}

export interface Trait {
	name: string;
	text: string;
}

export interface RaceContent {
	key: string;
	name: string;
	source: string;
	traits: Trait[];
	subraces: { key: string; name: string; traits: Trait[] }[];
}

export interface Content {
	/** Keyed by class key. */
	classes: Record<string, ClassContent>;
	races: RaceContent[];
}

let cache: Promise<Content> | undefined;

/** Loads the generated class and race JSON as separate chunks, once. */
export function loadContent(): Promise<Content> {
	cache ??= Promise.all([import('./classes.json'), import('./races.json')]).then(
		([classes, races]) => ({
			classes: classes.default as Record<string, ClassContent>,
			races: races.default as RaceContent[]
		}),
		(err) => {
			cache = undefined;
			throw err;
		}
	);
	return cache;
}

export interface FeatureGroup {
	/** One group of each kind at most, so it doubles as a unique key. */
	kind: 'race' | 'subrace' | 'class' | 'subclass';
	title: string;
	features: (Feature | (Trait & { level: 0 }))[];
}

/** Race, subrace, class and subclass features the character has at their level, skipping empty groups. */
export function featureGroups(
	content: Content,
	c: Pick<Character, 'raceKey' | 'subraceKey' | 'classKey' | 'subclassKey' | 'level'>
): FeatureGroup[] {
	const groups: FeatureGroup[] = [];
	const traits = (list: Trait[]) => list.map((t) => ({ ...t, level: 0 as const }));

	const race = content.races.find((r) => r.key === c.raceKey);
	if (race) {
		groups.push({
			kind: 'race',
			title: RACE_MAP.get(race.key)?.name ?? race.name,
			features: traits(race.traits)
		});
		const sub = race.subraces.find((s) => s.key === c.subraceKey);
		if (sub) groups.push({ kind: 'subrace', title: raceLabel(c), features: traits(sub.traits) });
	}

	const cls = content.classes[c.classKey];
	if (cls) {
		groups.push({
			kind: 'class',
			title: cls.name,
			features: cls.features.filter((f) => f.level <= c.level)
		});
		const subFeatures = c.subclassKey ? cls.subclasses[c.subclassKey] : undefined;
		if (subFeatures) {
			const title = CLASS_MAP.get(c.classKey)?.subclasses.find((s) => s.key === c.subclassKey)?.name ?? c.subclassKey!;
			groups.push({
				kind: 'subclass',
				title,
				features: subFeatures.filter((f) => f.level <= c.level)
			});
		}
	}

	return groups.filter((g) => g.features.length > 0);
}
