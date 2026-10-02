import type { Character, InventoryItem } from '$lib/types';
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

export interface MagicItem {
	/** `name|source`, lowercased. */
	id: string;
	name: string;
	source: string;
	type: string;
	rarity: string;
	/** Present when the item needs attunement: '' for anyone, else who can ("by a wizard"). */
	attunement?: string;
	charges?: number;
	/** What comes back at dawn: 'all', '3' or '1d6 + 1'. */
	regain?: string;
	/** Plain paragraphs joined by `\n`. */
	text: string;
}

export const RARITIES = ['common', 'uncommon', 'rare', 'very rare', 'legendary', 'artifact'] as const;

export const rarityLabel = (r: string) => (r ? r[0].toUpperCase() + r.slice(1) : '');

let itemCache: Promise<MagicItem[]> | undefined;

/** Loads the bundled magic items as a separate chunk, once. */
export function loadItems(): Promise<MagicItem[]> {
	itemCache ??= import('./items.json').then(
		(m) => m.default as MagicItem[],
		(err) => {
			itemCache = undefined;
			throw err;
		}
	);
	return itemCache;
}

/** A new inventory entry for a bundled magic item, with full charges. */
export function inventoryItem(m: MagicItem): InventoryItem {
	return {
		id: crypto.randomUUID(),
		ref: m.id,
		name: m.name,
		type: m.type,
		rarity: m.rarity,
		attunement: m.attunement !== undefined,
		attuned: false,
		quantity: 1,
		...(m.charges ? { charges: { max: m.charges, used: 0, ...(m.regain ? { regain: m.regain } : {}) } } : {}),
		notes: ''
	};
}
