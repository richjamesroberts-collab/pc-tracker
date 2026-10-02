export interface Spell {
	/** `name|source`, lowercased (e.g. `fireball|phb`), or `custom-<uuid>` for player-entered spells. */
	id: string;
	name: string;
	source: string;
	level: number;
	school: string;
	time: string;
	range: string;
	components: string;
	duration: string;
	concentration: boolean;
	ritual: boolean;
	/** Lowercase class keys whose spell list includes this spell. */
	classes: string[];
	text: string;
	higher?: string;
	/** Where the spell was loaded from at runtime: 'builtin', a pack id, or 'custom'. Not saved. */
	pack?: string;
}

/** A set of spells imported from a .spellpack.json file and stored on this device. */
export interface SpellPack {
	id: string;
	name: string;
	version: string;
	description?: string;
	spells: Spell[];
	importedAt: string;
}

export interface CharacterSpell {
	id: string;
	/** Prepared casters choose which spells are ready each day; known casters always have them ready. */
	prepared: boolean;
}

export interface DeathSaves {
	successes: number;
	failures: number;
}

export interface CustomResource {
	id: string;
	name: string;
	max: number;
	reset: 'short' | 'long';
	used: number;
}

/** Charges on a wand or staff, or uses of anything else the player wants to count. */
export interface ItemCharges {
	max: number;
	used: number;
	/** What comes back at dawn: 'all', a number ('3') or dice ('1d6 + 1'). Nothing when absent. */
	regain?: string;
}

/** Something the character carries. Bundled items copy their name, type, rarity, weight and charges when added. */
export interface InventoryItem {
	/** Unique per entry, so two +1 Weapons can be a longsword and a dagger. */
	id: string;
	/** Magic items and mundane gear are listed separately. */
	kind: 'magic' | 'gear';
	/** Bundled item id (`name|source`, see items.json or gear.json by kind); absent for custom items. */
	ref?: string;
	/** Starts as the bundled name; the player can make it specific ("+1 Longsword"). */
	name: string;
	/** "Wand", "Wondrous item", "Weapon (any sword)"; empty when unknown. */
	type: string;
	/** common, uncommon, rare, very rare, legendary, artifact; empty when unknown. */
	rarity: string;
	/** Requires attunement. */
	attunement: boolean;
	attuned: boolean;
	quantity: number;
	/** Pounds each; absent when unknown or weightless. */
	weight?: number;
	charges?: ItemCharges;
	/** The description for custom items; the player's own notes for bundled ones. */
	notes: string;
}

export type Coin = 'cp' | 'sp' | 'ep' | 'gp' | 'pp';
export type Coins = Record<Coin, number>;

export interface Character {
	id: string;
	name: string;
	/** Portrait as a small data URL (256px square). */
	image?: string;
	classKey: string;
	subclassKey?: string;
	/** Race key from `RACES` in src/lib/data/races.ts. */
	raceKey?: string;
	/** Subrace (or dragon ancestry) key within the race. */
	subraceKey?: string;
	level: number;

	ac: number;
	hpMax: number;
	hpCurrent: number;
	tempHp: number;
	deathSaves: DeathSaves;
	stable: boolean;

	speed?: number;
	initiativeModifier?: number;
	passivePerception?: number;

	/** Spellcasting ability modifier (e.g. +4 for CHA 18). */
	spellMod: number;
	/** Spent slots per spell level, e.g. { 1: 2 } = two 1st-level slots used. */
	slotsUsed: Record<number, number>;
	/** Extra slots made with Font of Magic; they vanish on a long rest. */
	bonusSlots: Record<number, number>;
	pactSlotsUsed: number;
	/** Mystic Arcanum levels (6-9) already cast since the last long rest. */
	arcanumUsed: number[];
	sorceryPointsUsed: number;
	metamagic: string[];
	/** Uses spent per class/race feature counter, keyed by resource id (e.g. { rage: 2 }). */
	resourcesUsed: Record<string, number>;
	/** Player-defined counters. */
	customResources: CustomResource[];

	spells: CharacterSpell[];
	customSpells: Spell[];
	/**
	 * Copies of the pack spells this character uses, so a backup restored on a phone
	 * without the pack still shows them. An installed pack's version takes priority.
	 */
	spellCache: Spell[];
	concentration?: string;

	items: InventoryItem[];
	coins: Coins;

	notes: string;
	createdAt: string;
	updatedAt: string;
	lastBackupAt?: string;
}
