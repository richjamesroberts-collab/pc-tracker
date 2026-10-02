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

	spells: CharacterSpell[];
	customSpells: Spell[];
	/**
	 * Copies of the pack spells this character uses, so a backup restored on a phone
	 * without the pack still shows them. An installed pack's version takes priority.
	 */
	spellCache: Spell[];
	concentration?: string;

	notes: string;
	createdAt: string;
	updatedAt: string;
	lastBackupAt?: string;
}
