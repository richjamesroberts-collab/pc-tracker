import type { Ability, AbilityScores, Character, CharacterFeat, ClassOption, ClassOptionKind, InventoryItem, ItemArmor, ItemEffects, ItemWeapon, Skill } from '$lib/types';
import { CLASS_MAP } from './classes';
import { specificName } from '$lib/rules/items';
import { armorClass, maxHp } from '$lib/rules/stats';
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
	weight?: number;
	charges?: number;
	/** What comes back at dawn: 'all', '3' or '1d6 + 1'. */
	regain?: string;
	effects?: ItemEffects;
	armor?: ItemArmor;
	/** Magic weapons of a set kind (Dagger of Venom); generic ones (+1 Weapon) have none until the player picks. */
	weapon?: ItemWeapon;
	/** Plain paragraphs joined by `\n`. */
	text: string;
}

export const RARITIES = ['common', 'uncommon', 'rare', 'very rare', 'legendary', 'artifact'] as const;

/** Types offered for custom items, matching the bundled items' own (items.json without the bracketed detail, gear.json). */
export const ITEM_TYPES: Record<InventoryItem['kind'], readonly string[]> = {
	magic: ['Wondrous item', 'Armor', 'Weapon', 'Ammunition', 'Potion', 'Ring', 'Rod', 'Scroll', 'Staff', 'Wand'],
	gear: [
		'Adventuring gear',
		'Ammunition',
		'Arcane focus',
		'Druidic focus',
		'Holy symbol',
		'Light armor',
		'Medium armor',
		'Heavy armor',
		'Shield',
		'Simple melee weapon',
		'Simple ranged weapon',
		'Martial melee weapon',
		'Martial ranged weapon',
		"Artisan's tools",
		'Tool',
		'Gaming set',
		'Musical instrument',
		'Food and drink',
		'Gemstone',
		'Art object',
		'Poison',
		'Tack and harness'
	]
};

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

/** A plain copy of an item's effects (the library may be a reactive proxy, which can't be structured-cloned). */
function copyEffects(e: ItemEffects | undefined): ItemEffects {
	if (!e) return {};
	return {
		...e,
		...(e.set ? { set: { ...e.set } } : {}),
		...(e.add ? { add: { ...e.add } } : {}),
		...(e.resist ? { resist: [...e.resist] } : {}),
		...(e.immune ? { immune: [...e.immune] } : {}),
		...(e.conditionImmune ? { conditionImmune: [...e.conditionImmune] } : {})
	};
}

/** A plain copy of a weapon's stats. */
export const copyWeapon = (w: ItemWeapon): ItemWeapon => ({
	...w,
	properties: [...w.properties],
	...(w.range ? { range: [w.range[0], w.range[1]] as [number, number] } : {})
});

/** A new inventory entry for a bundled magic item, with full charges. */
export function inventoryItem(m: MagicItem): InventoryItem {
	return {
		id: crypto.randomUUID(),
		kind: 'magic',
		ref: m.id,
		name: m.name,
		type: m.type,
		rarity: m.rarity,
		attunement: m.attunement !== undefined,
		attuned: false,
		quantity: 1,
		...(m.weight ? { weight: m.weight } : {}),
		...(m.armor ? { armor: { ...m.armor }, equipped: false } : {}),
		...(m.weapon ? { weapon: copyWeapon(m.weapon), equipped: false } : {}),
		effects: copyEffects(m.effects),
		...(m.charges ? { charges: { max: m.charges, used: 0, ...(m.regain ? { regain: m.regain } : {}) } } : {}),
		notes: ''
	};
}

export type GearCategory = 'weapon' | 'armor' | 'gear' | 'pack' | 'tool' | 'treasure';

export const GEAR_CATEGORIES: { key: GearCategory; label: string }[] = [
	{ key: 'weapon', label: 'Weapons' },
	{ key: 'armor', label: 'Armor' },
	{ key: 'gear', label: 'Gear' },
	{ key: 'pack', label: 'Packs' },
	{ key: 'tool', label: 'Tools' },
	{ key: 'treasure', label: 'Treasure' }
];

export interface GearItem {
	/** `name|source`, lowercased. */
	id: string;
	name: string;
	source: string;
	/** "Martial melee weapon", "Light armor", "Adventuring gear", "Gemstone". */
	type: string;
	category: GearCategory;
	/** Pounds each. */
	weight?: number;
	/** Price in copper. */
	value?: number;
	/** "1d8 slashing · Versatile (1d10)", "AC 12 + Dex". */
	stats?: string;
	armor?: ItemArmor;
	weapon?: ItemWeapon;
	/** Usually bought this many at a time (20 arrows). */
	bundle?: number;
	/** What an equipment pack holds: bundled gear by `ref`, or a plain name for things not on the list. */
	contents?: { ref?: string; name?: string; quantity: number }[];
	/** Plain paragraphs joined by `\n`; often empty for weapons. */
	text: string;
}

let gearCache: Promise<GearItem[]> | undefined;

/** Loads the bundled mundane gear as a separate chunk, once. */
export function loadGear(): Promise<GearItem[]> {
	gearCache ??= import('./gear.json').then(
		(m) => m.default as GearItem[],
		(err) => {
			gearCache = undefined;
			throw err;
		}
	);
	return gearCache;
}

/** A new inventory entry for bundled gear, `quantity` defaulting to how many are usually bought at once. */
export function gearInventoryItem(g: GearItem, quantity = g.bundle ?? 1): InventoryItem {
	return {
		id: crypto.randomUUID(),
		kind: 'gear',
		ref: g.id,
		name: g.name,
		type: g.type,
		rarity: '',
		attunement: false,
		attuned: false,
		quantity,
		...(g.weight ? { weight: g.weight } : {}),
		...(g.armor ? { armor: { ...g.armor }, equipped: false } : {}),
		...(g.weapon ? { weapon: copyWeapon(g.weapon), equipped: false } : {}),
		effects: {},
		notes: ''
	};
}

/** The items an equipment pack unpacks into. Contents missing from `byId` become plain named entries. */
export function unpack(pack: GearItem, byId: Map<string, GearItem>): InventoryItem[] {
	return (pack.contents ?? []).map((c) => {
		const g = c.ref ? byId.get(c.ref) : undefined;
		if (g) return gearInventoryItem(g, c.quantity);
		return {
			id: crypto.randomUUID(),
			kind: 'gear',
			name: c.name ?? c.ref ?? 'Item',
			type: '',
			rarity: '',
			attunement: false,
			attuned: false,
			quantity: c.quantity,
			effects: {},
			notes: ''
		};
	});
}

/**
 * Fill in armor and effects on bundled items added before they were tracked. Returns true if anything
 * changed. Custom items get empty effects so they aren't checked again.
 *
 * The player's AC and max HP already allowed for those items, so the base values shift to keep the
 * numbers shown the same; from then on, attuning or removing items changes them.
 */
export function fillItemDetails(c: Character, magic: Map<string, MagicItem>, gear: Map<string, GearItem>): boolean {
	if (!c.items.some((i) => i.effects === undefined)) return false;
	const before = { ac: armorClass(c).total, hp: maxHp(c).total };
	let changed = false;
	for (const i of c.items) {
		if (i.effects !== undefined) continue;
		const data = i.ref ? (i.kind === 'gear' ? gear : magic).get(i.ref) : undefined;
		i.effects = copyEffects(data && 'effects' in data ? data.effects : undefined);
		if (!i.armor && data?.armor) {
			i.armor = { ...data.armor };
			i.equipped = false;
		}
		changed = true;
	}
	if (!c.acAuto) c.acBase += before.ac - armorClass(c).total;
	c.hpBase = Math.max(1, c.hpBase + before.hp - maxHp(c).total);
	return changed;
}

/**
 * Bump when bundled items gain fields that inventory entries copy, and teach `fillItemData` to fill them.
 * 1: weapon stats, and magic weapons' attack and damage bonuses.
 * 2: Rod of Alertness loses its AC bonus (it only applies for 10 minutes after the rod is planted).
 * 3: damage resistances and immunities, and condition immunities.
 * 4: generic magic weapons already picked as a weapon are named for it ("+1 Weapon" becomes "+1 Longsword").
 */
export const ITEM_DATA_VERSION = 4;

/** Whether the character has bundled items whose copies may be missing fields added since. */
export const needsItemData = (c: Character) => (c.itemDataVersion ?? 0) < ITEM_DATA_VERSION && c.items.some((i) => i.ref);

/**
 * Fill in weapon stats, magic weapon bonuses and defenses on bundled items added before they were tracked,
 * and mark the character as up to date. Entries the player already changed are left alone.
 */
export function fillItemData(c: Character, magic: Map<string, MagicItem>, gear: Map<string, GearItem>): void {
	for (const i of c.items) {
		const data = i.ref ? (i.kind === 'gear' ? gear : magic).get(i.ref) : undefined;
		if (!data) continue;
		if (data.weapon && !i.weapon) {
			i.weapon = copyWeapon(data.weapon);
			i.equipped ??= false;
		}
		const e = 'effects' in data ? data.effects : undefined;
		if (i.effects && e?.attack && i.effects.attack === undefined) i.effects.attack = e.attack;
		if (i.effects && e?.damage && i.effects.damage === undefined) i.effects.damage = e.damage;
		if (i.ref === 'rod of alertness|dmg' && i.effects?.ac) delete i.effects.ac;
		for (const k of ['resist', 'immune', 'conditionImmune'] as const) {
			if (i.effects && e?.[k] && i.effects[k] === undefined) i.effects[k] = [...e[k]];
		}
		if (i.kind === 'magic' && i.weapon && !data.weapon && i.name === data.name && i.type.startsWith('Weapon (any')) {
			const base = gear.get(`${i.weapon.base}|phb`)?.name;
			if (base) i.name = specificName(data.name, base);
		}
	}
	c.itemDataVersion = ITEM_DATA_VERSION;
}

/** "15 gp", "5 cp" from copper. */
export function priceLabel(cp: number): string {
	if (cp % 100 === 0) return `${(cp / 100).toLocaleString('en')} gp`;
	if (cp % 10 === 0) return `${cp / 10} sp`;
	return `${cp} cp`;
}

/** A feat from feats.json, with the parts level up applies for the player. */
export interface FeatData {
	/** `name|source`, lowercased. */
	id: string;
	name: string;
	source: string;
	/** As the player reads it: "Dexterity 13 or higher", "Elf or Half-Elf". Not enforced. */
	prerequisite?: string;
	/** +1 to a fixed ability, or to one of `choose` (by `amount`). */
	ability?: { fixed?: Partial<AbilityScores>; choose?: Ability[]; amount?: number };
	/** Saving throw proficiency in the ability chosen for `ability` (Resilient). */
	save?: Ability[];
	/** Skill proficiencies to pick: from a list, or any skill. */
	skills?: { from: Skill[] | 'any'; count: number };
	/** Expertise in this many skills the character is proficient in. */
	expertise?: number;
	/** Extra max HP per level (Tough). */
	hpPerLevel?: number;
	/** Weapon proficiencies to pick (Weapon Master). */
	weapons?: number;
	/** Plain paragraphs joined by `\n`. */
	text: string;
}

/** An invocation, pact boon, maneuver, arcane shot, rune, infusion or elemental discipline from options.json. */
export interface ClassOptionData {
	/** `name|source`, lowercased. */
	id: string;
	name: string;
	source: string;
	kind: ClassOptionKind;
	prerequisite?: string;
	/** Class level needed. */
	level?: number;
	/** Pact boon needed ("blade", "chain", "tome", "talisman"). */
	pact?: string;
	text: string;
}

let featCache: Promise<FeatData[]> | undefined;
let optionCache: Promise<ClassOptionData[]> | undefined;

/** Loads the bundled feats as a separate chunk, once. */
export function loadFeats(): Promise<FeatData[]> {
	featCache ??= import('./feats.json').then(
		(m) => m.default as FeatData[],
		(err) => {
			featCache = undefined;
			throw err;
		}
	);
	return featCache;
}

/** Loads the bundled class options as a separate chunk, once. */
export function loadOptions(): Promise<ClassOptionData[]> {
	optionCache ??= import('./options.json').then(
		(m) => m.default as ClassOptionData[],
		(err) => {
			optionCache = undefined;
			throw err;
		}
	);
	return optionCache;
}

/** A new feat entry for the character, copying what the app needs without the bundled data. */
export function characterFeat(f: FeatData, level: number | undefined, abilities: Ability[] = []): CharacterFeat {
	return {
		id: crypto.randomUUID(),
		ref: f.id,
		name: f.name,
		...(level !== undefined ? { level } : {}),
		...(abilities.length ? { abilities: [...abilities] } : {}),
		...(f.hpPerLevel ? { hpPerLevel: f.hpPerLevel } : {})
	};
}

export const classOption = (o: ClassOptionData): ClassOption => ({ ref: o.id, name: o.name, kind: o.kind });
