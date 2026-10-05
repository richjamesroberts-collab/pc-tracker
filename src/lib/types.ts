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
	/** 'none': spent uses only come back when the player restores them. */
	reset: 'short' | 'long' | 'none';
	used: number;
}

/** Charges on a wand or staff, or uses of anything else the player wants to count. */
export interface ItemCharges {
	max: number;
	used: number;
	/** What comes back at dawn: 'all', a number ('3') or dice ('1d6 + 1'). Nothing when absent. */
	regain?: string;
}

export type ArmorType = 'light' | 'medium' | 'heavy' | 'shield';

/** Base AC of a suit of armor, or a shield's bonus (normally 2). */
export interface ItemArmor {
	type: ArmorType;
	ac: number;
}

/** What an item does to the character's numbers while in use (attuned if it needs it, worn if it's armor). */
export interface ItemEffects {
	/** Scores that become this value unless already higher (Headband of Intellect: INT 19). */
	set?: Partial<AbilityScores>;
	/** Scores raised by this much, up to `addMax` (Ioun Stone of Agility: DEX +2, max 20). */
	add?: Partial<AbilityScores>;
	addMax?: number;
	ac?: number;
	spellAttack?: number;
	spellDc?: number;
	/** The AC bonus only counts without armor or a shield (Bracers of Defense). */
	unarmoredOnly?: boolean;
	/** Magic weapons: bonus to attack and damage rolls (+1 Weapon). */
	attack?: number;
	damage?: number;
	/** Damage types resisted (lowercase: "fire"). */
	resist?: string[];
	/** Damage types the wearer is immune to. */
	immune?: string[];
	/** Conditions the wearer can't have ("poisoned"). */
	conditionImmune?: string[];
}

export type WeaponProperty =
	| 'ammunition'
	| 'finesse'
	| 'heavy'
	| 'light'
	| 'loading'
	| 'reach'
	| 'special'
	| 'thrown'
	| 'two-handed'
	| 'versatile';

/** What a weapon does when it hits, copied from the PHB weapon it is (a +1 Weapon becomes a longsword when the player picks). */
export interface ItemWeapon {
	/** The PHB weapon, lowercase ("longsword"): what proficiency is checked against. */
	base: string;
	category: 'simple' | 'martial';
	/** Ranged weapon (bows, crossbows, darts, slings, nets); thrown melee weapons are melee. */
	ranged: boolean;
	/** "1d8", or "1" for a blowgun; empty for a net. */
	damage: string;
	/** slashing, piercing or bludgeoning; empty for a net. */
	damageType: string;
	properties: WeaponProperty[];
	/** Damage when used two-handed. */
	versatile?: string;
	/** Normal and long range in feet, for ranged and thrown weapons. */
	range?: [number, number];
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
	/** Armor or a shield; its AC counts while `equipped`. */
	armor?: ItemArmor;
	/** A weapon; it's listed under Attacks while `equipped`. */
	weapon?: ItemWeapon;
	/** Armor being worn, or a weapon at hand. */
	equipped?: boolean;
	/** Copied from the bundled item. Absent on entries added before effects were tracked, until filled in. */
	effects?: ItemEffects;
	charges?: ItemCharges;
	/** The description for custom items; the player's own notes for bundled ones. */
	notes: string;
}

export type Ability = 'str' | 'dex' | 'con' | 'int' | 'wis' | 'cha';
export type Skill =
	| 'acrobatics'
	| 'animal-handling'
	| 'arcana'
	| 'athletics'
	| 'deception'
	| 'history'
	| 'insight'
	| 'intimidation'
	| 'investigation'
	| 'medicine'
	| 'nature'
	| 'perception'
	| 'performance'
	| 'persuasion'
	| 'religion'
	| 'sleight-of-hand'
	| 'stealth'
	| 'survival';
export type AbilityScores = Record<Ability, number>;

/** A sense the player adds themselves (Devil's Sight, Goggles of Night, a Custom Lineage's darkvision). */
export interface CustomSense {
	id: string;
	/** "Darkvision", "Blindsight", "Tremorsense", "Truesight", or anything else. */
	name: string;
	/** Feet. */
	range: number;
}

/** A resistance or immunity the player adds themselves (Infernal Constitution, a boon, a DM ruling). */
export interface CustomDefense {
	id: string;
	kind: 'resistance' | 'immunity';
	/** Damage type or condition, lowercase: "cold", "charmed". */
	name: string;
	/** Where it comes from, shown in the breakdown: "Infernal Constitution". */
	source?: string;
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
	/** Experience points. */
	xp: number;
	/** The group levels up at story milestones, so XP isn't tracked. */
	milestone: boolean;
	/**
	 * Base ability scores (1-30): before racial increases and magic items, including Ability Score
	 * Improvements from levelling. See `abilityScores` in rules/stats.ts for the totals.
	 */
	abilities: AbilityScores;
	/** Picks for a race's free increases (Half-Elf, Variant Human, Custom Lineage). */
	raceAbilityChoices: Ability[];

	/** AC as worked out by rules/stats.ts `recompute`; don't set directly. */
	ac: number;
	/** Work AC out from equipped armor, DEX and features; otherwise `acBase` is the AC. */
	acAuto: boolean;
	/** AC the player entered, used when `acAuto` is off (magic item bonuses go on top). */
	acBase: number;
	/** Temporary change from the AC sheet (Shield spell, cover); added in either mode. */
	acAdjust: number;
	/** Max HP as worked out (`hpBase` plus Constitution changes from magic items); don't set directly. */
	hpMax: number;
	/** Max HP the player entered, without magic items. */
	hpBase: number;
	hpCurrent: number;
	tempHp: number;
	deathSaves: DeathSaves;
	stable: boolean;
	/** Hit dice spent (one per level in total, the class's hit die); half come back on a long rest. */
	hitDiceUsed: number;

	/**
	 * Weapon proficiencies beyond class, subclass and race (feats, multiclassing, a Kensei's or Bladesinger's pick):
	 * 'simple', 'martial', or a PHB weapon's lowercase name.
	 */
	weaponProficiencies: string[];
	/** Skill proficiencies the player picked (class, background, feats, racial choices); fixed racial ones are added in rules/skills.ts. */
	skillProficiencies: Skill[];
	/** Skills with expertise (double proficiency): Rogue, Bard, feats. */
	skillExpertise: Skill[];
	/** Saving throw proficiencies beyond the class's (Resilient feat); see rules/saves.ts. */
	saveProficiencies: Ability[];
	/** Fighting style keys from `FIGHTING_STYLES` in rules/attacks.ts. */
	fightingStyles: string[];
	/** Senses beyond race and class. */
	senses: CustomSense[];
	/** Resistances and immunities beyond race, class and items. */
	defenses: CustomDefense[];

	speed?: number;
	/** Initiative as worked out (DEX plus features), or `initiativeOverride`; don't set directly. */
	initiativeModifier?: number;
	/** Player-set initiative that replaces the worked-out one (Alert feat, a DM ruling). */
	initiativeOverride?: number;
	passivePerception?: number;

	/** Spellcasting ability modifier as worked out from ability scores, or `spellModOverride`; don't set directly. */
	spellMod: number;
	/** Player-set spellcasting modifier that replaces the worked-out one. */
	spellModOverride?: number;
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
	/** Which `ITEM_DATA_VERSION` the bundled-item copies on `items` were last filled in from (see data/content.ts). */
	itemDataVersion?: number;
	coins: Coins;

	notes: string;
	createdAt: string;
	updatedAt: string;
	lastBackupAt?: string;
}
