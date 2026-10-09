import type {
	Ability,
	AbilityScores,
	Character,
	CharacterFeat,
	ClassOption,
	ClassOptionKind,
	InventoryItem,
	ItemArmor,
	ItemContainer,
	ItemEffects,
	ItemUse,
	ItemWeapon,
	Skill
} from '$lib/types';
import { GEAR_USES, readItemUse } from '$lib/rules/usable';
import { CLASS_MAP } from './classes';
import { specificName } from '$lib/rules/items';
import { putCoinsAway } from '$lib/rules/carry';
import { armorClass, maxHp } from '$lib/rules/stats';
import { RACE_MAP, raceLabel } from './races';
import type { ResourceDef } from '$lib/rules/features';

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
	/** Bag of Holding, Handy Haversack, Portable Hole. */
	container?: Omit<ItemContainer, 'coins'>;
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

/** `{ container }` for spreading onto an entry: what it holds. */
function containerOf(data: { container?: ItemContainer }): { container?: ItemContainer } {
	return data.container ? { container: { ...data.container } } : {};
}

/** `{ use }` for spreading onto an entry, or nothing when the description doesn't say it's used. */
function useOf(i: Pick<InventoryItem, 'kind' | 'type' | 'ref'>, text: string): { use?: ItemUse } {
	const use = readItemUse(i, text);
	return use ? { use } : {};
}

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
		...useOf({ kind: 'magic', type: m.type, ref: m.id }, m.text),
		...containerOf(m),
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
	/** Pouch, sack, backpack, basket, chest. */
	container?: Omit<ItemContainer, 'coins'>;
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
		...(GEAR_USES[g.id] ? { charges: { max: GEAR_USES[g.id], used: 0 } } : {}),
		...useOf({ kind: 'gear', type: g.type, ref: g.id }, g.text),
		...containerOf(g),
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
 * 5: armor and shields of a set kind get their bundled AC back (the item sheet let a +1 Shield's 2 be typed over as 1).
 * 6: how an item is used (the actions its description names, and whether it's used up), and a healer's kit's ten uses.
 * 7: containers (what a pouch, sack or Bag of Holding holds), and weights on entries saved without one.
 * 8: containers on the character are equipped (only equipped ones take things), and coin containers keep their coins.
 */
export const ITEM_DATA_VERSION = 8;

/** Whether the character has bundled items whose copies may be missing fields added since. */
export const needsItemData = (c: Character) => (c.itemDataVersion ?? 0) < ITEM_DATA_VERSION && c.items.some((i) => i.ref);

/**
 * Fill in weapon stats, magic weapon bonuses, defenses, containers and weights on bundled items added before they were tracked,
 * and mark the character as up to date. Entries the player already changed are left alone.
 */
export function fillItemData(c: Character, magic: Map<string, MagicItem>, gear: Map<string, GearItem>): void {
	const first = (c.itemDataVersion ?? 0) < 8;
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
		if (data.armor && i.armor && (i.armor.type !== data.armor.type || i.armor.ac !== data.armor.ac)) i.armor = { ...data.armor };
		if (i.kind === 'magic' && i.weapon && !data.weapon && i.name === data.name && i.type.startsWith('Weapon (any')) {
			const base = gear.get(`${i.weapon.base}|phb`)?.name;
			if (base) i.name = specificName(data.name, base);
		}
		if (!i.use) Object.assign(i, useOf(i, data.text));
		if (i.kind === 'gear' && !i.charges && GEAR_USES[data.id]) i.charges = { max: GEAR_USES[data.id], used: 0 };
		if (!i.container) Object.assign(i, containerOf(data));
		if (i.weight === undefined && data.weight) i.weight = data.weight;
	}
	// Containers on the character from before equipping: they were all in use, and only loose ones can be worn.
	for (const i of c.items) if (first && i.container && !i.stash && !i.inside && i.equipped === undefined) i.equipped = true;
	// Coins used to fill pouches and sacks by themselves; now they're kept in them.
	if (first) putCoinsAway(c);
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

/** Lowercase words only, and without a "(d8)" or "Channel Divinity: " around the name, for matching names. */
const bareName = (s: string) =>
	s
		.replace(/\s*\(.*\)$/, '')
		.replace(/^Channel Divinity:\s*/i, '')
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, ' ')
		.trim();

const SMALL = 'of|the|and|at|to|a|an|in|on|from|with|for|or|by';
/** A run-in heading starting a paragraph: "Superiority Dice. You have four…", "Channel Divinity: Harness Divine Power. 3rd-level…". */
const RUN_IN = new RegExp(`^((?:[A-Z][\\w'’/-]*)(?:[ :]+(?:[A-Z][\\w'’/-]*|${SMALL}))*)\\. (.*)$`);
/** The line TCE puts under a heading: "3rd-level Rune Knight feature". */
const LEVEL_LINE = /^\d+(?:st|nd|rd|th)-level .* feature$/;

/** The paragraphs under the run-in heading `want` in a feature's text, up to the next heading. */
function section(text: string, want: string): string | undefined {
	const paras = text.split('\n');
	const at = paras.findIndex((p) => {
		const m = RUN_IN.exec(p);
		return !!m && bareName(m[1]) === want;
	});
	if (at < 0) return undefined;
	const rest = RUN_IN.exec(paras[at])![2];
	// In text written the TCE way (every feature heading has a level line), a feature can have headings of its
	// own under it (Psionic Power's Psionic Strike), so it ends at the next heading with a level line. PHB text
	// with an optional feature added (Sacred Oath's Harness Divine Power) ends at any heading.
	const first = paras.map((p) => RUN_IN.exec(p)).find((m) => !!m);
	const top = LEVEL_LINE.test(rest) && !!first && LEVEL_LINE.test(first[2]);
	const body = LEVEL_LINE.test(rest) ? [] : [rest];
	for (const p of paras.slice(at + 1)) {
		const m = RUN_IN.exec(p);
		if (m && (!top || LEVEL_LINE.test(m[2]))) break;
		body.push(p);
	}
	return body.join('\n');
}

/**
 * Where a limited-use counter's rules are written: the class or subclass feature, racial trait or class option
 * named by its `feature` (else its own name), in what its owner gives. A feature that goes up with level
 * ("Bardic Inspiration (d8)") matches its first entry; one written under a run-in heading inside another
 * (Battle Master's "Superiority Dice.") is cut out of it.
 */
export function resourceFeature(content: Content, options: ClassOptionData[], def: ResourceDef): { name: string; text: string } | undefined {
	const { kind, key } = def.owner;
	if (kind === 'option') return options.find((o) => o.id === key);
	const [owner, sub] = key.split('/');
	let list: { name: string; text: string }[] | undefined;
	if (kind === 'class') list = content.classes[owner]?.features;
	else if (kind === 'subclass') list = content.classes[owner]?.subclasses[sub];
	else {
		const race = content.races.find((r) => r.key === owner);
		list = kind === 'race' ? race?.traits : race?.subraces.find((s) => s.key === sub)?.traits;
	}
	if (!list) return undefined;
	const name = def.feature ?? def.name;
	const want = bareName(name);
	const whole = list.find((f) => bareName(f.name) === want);
	if (whole) return whole;
	for (const f of list) {
		const text = section(f.text, want);
		if (text) return { name, text };
	}
	return undefined;
}
