import type { Ability, Character } from '$lib/types';
import { abilityMod } from './abilities';
import { proficiencyBonus } from './spellcasting';
import { abilityScores } from './stats';
import type { UseFx } from './usable';

export { proficiencyBonus };

export interface ResourceDef {
	key: string;
	name: string;
	/**
	 * Subclass owners use '<classKey>/<subclassKey>', subrace owners '<raceKey>/<subraceKey>', class option
	 * owners the option's ref (a Rune Knight's rune).
	 */
	owner: { kind: 'class' | 'subclass' | 'race' | 'subrace' | 'option'; key: string };
	/** 0 = hidden. */
	max(c: Character): number;
	/** 'none': not on a rest; the player gives uses back (Divine Intervention's 7 days, Limited Wish). */
	reset(c: Character): 'short' | 'long' | 'none';
	die?(c: Character): string;
	/** Spent in amounts and shown as a number (Lay on Hands). */
	pool?: true;
	/** The feature, trait or class option its rules are under, when not its own name (Psionic Energy: Psionic Power). */
	feature?: string;
}

type Steps = [level: number, value: number][];

/** Value of the highest breakpoint at or below `level`; 0 below the first. */
function byLevel(level: number, steps: Steps): number {
	let value = 0;
	for (const [from, v] of steps) if (level >= from) value = v;
	return value;
}

function dieByLevel(level: number, steps: [number, string][]): string {
	let die = steps[0][1];
	for (const [from, d] of steps) if (level >= from) die = d;
	return die;
}

const prof = (c: Character) => proficiencyBonus(c.level);
const mod1 = (c: Character) => Math.max(1, c.spellMod);
const long = () => 'long' as const;
const short = () => 'short' as const;
const one = () => 1;
const at3 = (c: Character) => byLevel(c.level, [[3, 1]]);
const at5 = (c: Character) => byLevel(c.level, [[5, 1]]);
const psiDie = (c: Character) => dieByLevel(c.level, [[1, 'd6'], [5, 'd8'], [11, 'd10'], [17, 'd12']]);
const never = () => 'none' as const;
/** An ability modifier, at least 1 ("a number of times equal to your Strength modifier (minimum of once)"). */
const abilityMod1 = (a: Ability) => (c: Character) => Math.max(1, abilityMod(abilityScores(c)[a]));
/** One use from `level`. */
const oneAt = (level: number) => (c: Character) => byLevel(c.level, [[level, 1]]);
/** Proficiency bonus uses from `level`. */
const profAt = (level: number) => (c: Character) => (c.level >= level ? prof(c) : 0);
/** Ability modifier uses (minimum 1) from `level`. */
const modAt = (level: number, a: Ability) => (c: Character) => (c.level >= level ? abilityMod1(a)(c) : 0);

type Def = Omit<ResourceDef, 'owner'>;
const cls = (key: string, d: Def): ResourceDef => ({ ...d, owner: { kind: 'class', key } });
const sub = (key: string, d: Def): ResourceDef => ({ ...d, owner: { kind: 'subclass', key } });
const race = (key: string, d: Def): ResourceDef => ({ ...d, owner: { kind: 'race', key } });
const subrace = (key: string, d: Def): ResourceDef => ({ ...d, owner: { kind: 'subrace', key } });
const option = (key: string, d: Def): ResourceDef => ({ ...d, owner: { kind: 'option', key } });

/** Each rune a Rune Knight knows: once per short rest, twice from 15th level (Master of Runes). */
const rune = (name: string) =>
	option(`${name.toLowerCase()}|tce`, {
		key: `${name.toLowerCase().replace(' ', '-')}`,
		name,
		max: (c) => (c.subclassKey === 'rune-knight' ? byLevel(c.level, [[3, 1], [15, 2]]) : 0),
		reset: short
	});

export const RESOURCES: ResourceDef[] = [
	cls('barbarian', { key: 'rage', name: 'Rage', max: (c) => byLevel(c.level, [[1, 2], [3, 3], [6, 4], [12, 5], [17, 6], [20, 0]]), reset: long }),
	cls('bard', {
		key: 'bardic-inspiration',
		name: 'Bardic Inspiration',
		max: mod1,
		reset: (c) => (c.level >= 5 ? 'short' : 'long'),
		die: (c) => dieByLevel(c.level, [[1, 'd6'], [5, 'd8'], [10, 'd10'], [15, 'd12']])
	}),
	cls('cleric', { key: 'channel-divinity', name: 'Channel Divinity', max: (c) => byLevel(c.level, [[2, 1], [6, 2], [18, 3]]), reset: short }),
	cls('druid', { key: 'wild-shape', name: 'Wild Shape', max: (c) => byLevel(c.level, [[2, 2], [20, 0]]), reset: short }),
	cls('fighter', { key: 'second-wind', name: 'Second Wind', max: () => 1, reset: short }),
	cls('fighter', { key: 'action-surge', name: 'Action Surge', max: (c) => byLevel(c.level, [[2, 1], [17, 2]]), reset: short }),
	cls('fighter', { key: 'indomitable', name: 'Indomitable', max: (c) => byLevel(c.level, [[9, 1], [13, 2], [17, 3]]), reset: long }),
	cls('monk', { key: 'ki', name: 'Ki', max: (c) => (c.level >= 2 ? c.level : 0), reset: short }),
	cls('paladin', { key: 'divine-sense', name: 'Divine Sense', max: (c) => Math.max(1, 1 + c.spellMod), reset: long }),
	cls('paladin', { key: 'lay-on-hands', name: 'Lay on Hands', max: (c) => 5 * c.level, reset: long, pool: true }),
	cls('paladin', { key: 'paladin-channel-divinity', name: 'Channel Divinity', max: (c) => byLevel(c.level, [[3, 1]]), reset: short }),
	// TCE optional feature replacing Favored Enemy; shown for every ranger since most tables allow it.
	cls('ranger', {
		key: 'favored-foe',
		name: 'Favored Foe',
		max: prof,
		reset: long,
		die: (c) => dieByLevel(c.level, [[1, 'd4'], [6, 'd6'], [14, 'd8']])
	}),
	cls('wizard', { key: 'arcane-recovery', name: 'Arcane Recovery', max: () => 1, reset: long }),
	cls('artificer', { key: 'flash-of-genius', name: 'Flash of Genius', max: (c) => (c.level >= 7 ? mod1(c) : 0), reset: long }),
	// Twice the INT modifier (minimum twice), for the item's holder.
	cls('artificer', { key: 'spell-storing-item', name: 'Spell-Storing Item', max: (c) => (c.level >= 11 ? 2 * abilityMod1('int')(c) : 0), reset: long }),
	// 7 days before it can be tried again after it works; the player gives the use back.
	cls('cleric', { key: 'divine-intervention', name: 'Divine Intervention', max: oneAt(10), reset: never }),
	// TCE: spend Channel Divinity to regain a slot (up to half the proficiency bonus, rounded up, in level).
	cls('cleric', { key: 'harness-divine-power', name: 'Harness Divine Power', max: (c) => byLevel(c.level, [[2, 1], [6, 2], [18, 3]]), reset: long }),
	cls('paladin', { key: 'cleansing-touch', name: 'Cleansing Touch', max: modAt(14, 'cha'), reset: long }),
	cls('paladin', { key: 'paladin-harness-divine-power', name: 'Harness Divine Power', max: oneAt(3), reset: long }),
	cls('ranger', { key: 'natures-veil', name: "Nature's Veil", max: profAt(10), reset: long }),
	cls('rogue', { key: 'stroke-of-luck', name: 'Stroke of Luck', max: oneAt(20), reset: short }),
	cls('warlock', { key: 'eldritch-master', name: 'Eldritch Master', max: oneAt(20), reset: long }),

	sub('fighter/battle-master', {
		key: 'superiority-dice',
		name: 'Superiority Dice',
		max: (c) => byLevel(c.level, [[3, 4], [7, 5], [15, 6]]),
		reset: short,
		die: (c) => dieByLevel(c.level, [[1, 'd8'], [10, 'd10'], [18, 'd12']])
	}),
	sub('fighter/arcane-archer', { key: 'arcane-shot', name: 'Arcane Shot', max: (c) => byLevel(c.level, [[3, 2]]), reset: short }),
	sub('fighter/rune-knight', { key: 'giants-might', name: "Giant's Might", max: (c) => (c.level >= 3 ? prof(c) : 0), reset: long }),
	sub('fighter/psi-warrior', { key: 'psionic-energy', name: 'Psionic Energy', feature: 'Psionic Power', max: (c) => (c.level >= 3 ? 2 * prof(c) : 0), reset: long, die: psiDie }),
	sub('rogue/soulknife', { key: 'soulknife-psionic-energy', name: 'Psionic Energy', feature: 'Psionic Power', max: (c) => (c.level >= 3 ? 2 * prof(c) : 0), reset: long, die: psiDie }),
	sub('barbarian/wild-magic', { key: 'bolstering-magic', name: 'Bolstering Magic', max: (c) => (c.level >= 6 ? prof(c) : 0), reset: long }),
	sub('sorcerer/wild-magic', { key: 'tides-of-chaos', name: 'Tides of Chaos', max: () => 1, reset: long }),
	sub('sorcerer/divine-soul', { key: 'favored-by-the-gods', name: 'Favored by the Gods', max: () => 1, reset: short }),
	sub('wizard/divination', { key: 'portent', name: 'Portent', max: (c) => byLevel(c.level, [[2, 2], [14, 3]]), reset: long }),
	sub('wizard/bladesinging', { key: 'bladesong', name: 'Bladesong', max: (c) => (c.level >= 2 ? prof(c) : 0), reset: long }),
	sub('cleric/light', { key: 'warding-flare', name: 'Warding Flare', max: mod1, reset: long }),
	sub('cleric/tempest', { key: 'wrath-of-the-storm', name: 'Wrath of the Storm', max: mod1, reset: long }),
	sub('cleric/war', { key: 'war-priest', name: 'War Priest', max: mod1, reset: long }),
	sub('cleric/peace', { key: 'emboldening-bond', name: 'Emboldening Bond', max: prof, reset: long }),
	sub('druid/stars', { key: 'starry-guiding-bolt', name: 'Guiding Bolt (Star Map)', feature: 'Star Map', max: (c) => (c.level >= 2 ? prof(c) : 0), reset: long }),
	sub('ranger/fey-wanderer', { key: 'fey-reinforcements', name: 'Fey Reinforcements', max: (c) => byLevel(c.level, [[11, 1]]), reset: long }),
	sub('ranger/fey-wanderer', { key: 'misty-wanderer', name: 'Misty Wanderer', max: (c) => (c.level >= 15 ? mod1(c) : 0), reset: long }),
	sub('ranger/swarmkeeper', { key: 'writhing-tide', name: 'Writhing Tide', max: (c) => (c.level >= 7 ? prof(c) : 0), reset: long }),
	sub('sorcerer/clockwork-soul', { key: 'restore-balance', name: 'Restore Balance', max: prof, reset: long }),
	sub('warlock/hexblade', { key: 'hexblades-curse', name: "Hexblade's Curse", max: () => 1, reset: short }),
	sub('warlock/genie', { key: 'bottled-respite', name: 'Bottled Respite', max: () => 1, reset: long }),

	sub('artificer/alchemist', { key: 'experimental-elixir', name: 'Experimental Elixir', max: (c) => byLevel(c.level, [[3, 1], [6, 2], [15, 3]]), reset: long }),
	sub('artificer/armorer', { key: 'defensive-field', name: 'Defensive Field (Guardian)', feature: 'Guardian', max: profAt(3), reset: long }),
	sub('artificer/artillerist', { key: 'eldritch-cannon', name: 'Eldritch Cannon', max: oneAt(3), reset: long }),
	sub('artificer/battle-smith', { key: 'arcane-jolt', name: 'Arcane Jolt', max: modAt(9, 'int'), reset: long }),
	sub('barbarian/beast', { key: 'infectious-fury', name: 'Infectious Fury', max: profAt(10), reset: long }),
	sub('barbarian/wild-magic', { key: 'magic-awareness', name: 'Magic Awareness', max: profAt(3), reset: long }),
	sub('bard/creation', { key: 'performance-of-creation', name: 'Performance of Creation', max: oneAt(3), reset: long }),
	sub('bard/creation', { key: 'animating-performance', name: 'Animating Performance', max: oneAt(6), reset: long }),
	sub('bard/eloquence', { key: 'universal-speech', name: 'Universal Speech', max: oneAt(6), reset: long }),
	sub('bard/eloquence', { key: 'infectious-inspiration', name: 'Infectious Inspiration', max: modAt(14, 'cha'), reset: long }),
	sub('bard/glamour', { key: 'mantle-of-majesty', name: 'Mantle of Majesty', max: oneAt(6), reset: long }),
	sub('bard/glamour', { key: 'unbreakable-majesty', name: 'Unbreakable Majesty', max: oneAt(14), reset: short }),
	sub('bard/whispers', { key: 'mantle-of-whispers', name: 'Mantle of Whispers', max: oneAt(6), reset: short }),
	sub('bard/whispers', { key: 'shadow-lore', name: 'Shadow Lore', max: oneAt(14), reset: long }),
	sub('cleric/forge', { key: 'blessing-of-the-forge', name: 'Blessing of the Forge', max: one, reset: long }),
	sub('cleric/grave', { key: 'eyes-of-the-grave', name: 'Eyes of the Grave', max: abilityMod1('wis'), reset: long }),
	sub('cleric/grave', { key: 'sentinel-at-deaths-door', name: "Sentinel at Death's Door", max: modAt(6, 'wis'), reset: long }),
	sub('cleric/order', { key: 'embodiment-of-the-law', name: 'Embodiment of the Law', max: modAt(6, 'wis'), reset: long }),
	sub('cleric/twilight', { key: 'eyes-of-night', name: 'Eyes of Night', max: one, reset: long }),
	sub('cleric/twilight', { key: 'steps-of-night', name: 'Steps of Night', max: profAt(6), reset: long }),
	// Slots back on a short rest, up to half the druid level (rounded up) in total levels.
	sub('druid/land', { key: 'natural-recovery', name: 'Natural Recovery', max: oneAt(2), reset: long, die: (c) => `${Math.ceil(c.level / 2)} slot levels` }),
	sub('druid/dreams', { key: 'balm-of-the-summer-court', name: 'Balm of the Summer Court', max: (c) => (c.level >= 2 ? c.level : 0), reset: long, die: () => 'd6', pool: true }),
	sub('druid/dreams', { key: 'hidden-paths', name: 'Hidden Paths', max: modAt(10, 'wis'), reset: long }),
	sub('druid/dreams', { key: 'walker-in-dreams', name: 'Walker in Dreams', max: oneAt(14), reset: long }),
	sub('druid/shepherd', { key: 'spirit-totem', name: 'Spirit Totem', max: oneAt(2), reset: short }),
	sub('druid/stars', { key: 'cosmic-omen', name: 'Cosmic Omen', max: profAt(6), reset: long }),
	sub('druid/wildfire', { key: 'cauterizing-flames', name: 'Cauterizing Flames', max: profAt(10), reset: long }),
	sub('fighter/cavalier', { key: 'unwavering-mark', name: 'Unwavering Mark', max: modAt(3, 'str'), reset: long }),
	sub('fighter/cavalier', { key: 'warding-maneuver', name: 'Warding Maneuver', max: modAt(7, 'con'), reset: long }),
	sub('fighter/rune-knight', { key: 'runic-shield', name: 'Runic Shield', max: profAt(7), reset: long }),
	sub('fighter/samurai', { key: 'fighting-spirit', name: 'Fighting Spirit', max: (c) => byLevel(c.level, [[3, 3]]), reset: long }),
	sub('fighter/samurai', { key: 'strength-before-death', name: 'Strength before Death', max: oneAt(18), reset: long }),
	sub('monk/open-hand', { key: 'wholeness-of-body', name: 'Wholeness of Body', max: oneAt(6), reset: long }),
	sub('monk/mercy', { key: 'hand-of-ultimate-mercy', name: 'Hand of Ultimate Mercy', max: oneAt(17), reset: long }),
	sub('paladin/ancients', { key: 'undying-sentinel', name: 'Undying Sentinel', max: oneAt(15), reset: long }),
	sub('paladin/ancients', { key: 'elder-champion', name: 'Elder Champion', max: oneAt(20), reset: long }),
	sub('paladin/conquest', { key: 'invincible-conqueror', name: 'Invincible Conqueror', max: oneAt(20), reset: long }),
	sub('paladin/devotion', { key: 'holy-nimbus', name: 'Holy Nimbus', max: oneAt(20), reset: long }),
	sub('paladin/glory', { key: 'glorious-defense', name: 'Glorious Defense', max: modAt(15, 'cha'), reset: long }),
	sub('paladin/glory', { key: 'living-legend', name: 'Living Legend', max: oneAt(20), reset: long }),
	sub('paladin/oathbreaker', { key: 'dread-lord', name: 'Dread Lord', max: oneAt(20), reset: long }),
	sub('paladin/vengeance', { key: 'avenging-angel', name: 'Avenging Angel', max: oneAt(20), reset: long }),
	sub('paladin/watchers', { key: 'mortal-bulwark', name: 'Mortal Bulwark', max: oneAt(20), reset: long }),
	sub('ranger/horizon-walker', { key: 'detect-portal', name: 'Detect Portal', max: oneAt(3), reset: short }),
	sub('ranger/monster-slayer', { key: 'hunters-sense', name: "Hunter's Sense", max: modAt(3, 'wis'), reset: long }),
	sub('rogue/phantom', { key: 'wails-from-the-grave', name: 'Wails from the Grave', max: profAt(3), reset: long }),
	sub('sorcerer/aberrant-mind', { key: 'warping-implosion', name: 'Warping Implosion', max: oneAt(18), reset: long }),
	sub('sorcerer/clockwork-soul', { key: 'trance-of-order', name: 'Trance of Order', max: oneAt(14), reset: long }),
	sub('sorcerer/clockwork-soul', { key: 'clockwork-cavalcade', name: 'Clockwork Cavalcade', max: oneAt(18), reset: long }),
	sub('sorcerer/divine-soul', { key: 'unearthly-recovery', name: 'Unearthly Recovery', max: oneAt(18), reset: long }),
	sub('sorcerer/shadow', { key: 'strength-of-the-grave', name: 'Strength of the Grave', max: one, reset: long }),
	sub('warlock/archfey', { key: 'fey-presence', name: 'Fey Presence', max: one, reset: short }),
	sub('warlock/archfey', { key: 'misty-escape', name: 'Misty Escape', max: oneAt(6), reset: short }),
	sub('warlock/archfey', { key: 'dark-delirium', name: 'Dark Delirium', max: oneAt(14), reset: short }),
	sub('warlock/celestial', { key: 'healing-light', name: 'Healing Light', max: (c) => 1 + c.level, reset: long, die: () => 'd6', pool: true }),
	sub('warlock/celestial', { key: 'searing-vengeance', name: 'Searing Vengeance', max: oneAt(14), reset: long }),
	sub('warlock/fathomless', { key: 'tentacle-of-the-deeps', name: 'Tentacle of the Deeps', max: prof, reset: long }),
	sub('warlock/fathomless', { key: 'fathomless-plunge', name: 'Fathomless Plunge', max: oneAt(14), reset: short }),
	sub('warlock/fiend', { key: 'dark-ones-own-luck', name: "Dark One's Own Luck", max: oneAt(6), reset: short }),
	sub('warlock/fiend', { key: 'hurl-through-hell', name: 'Hurl Through Hell', max: oneAt(14), reset: long }),
	// Flight from Elemental Gift; Limited Wish comes back after 1d4 long rests, so the player gives it back.
	sub('warlock/genie', { key: 'elemental-gift', name: 'Elemental Gift (flight)', max: profAt(6), reset: long }),
	sub('warlock/genie', { key: 'limited-wish', name: 'Limited Wish', max: oneAt(14), reset: never }),
	sub('warlock/great-old-one', { key: 'entropic-ward', name: 'Entropic Ward', max: oneAt(6), reset: short }),
	sub('warlock/hexblade', { key: 'accursed-specter', name: 'Accursed Specter', max: oneAt(6), reset: long }),
	sub('warlock/undead', { key: 'form-of-dread', name: 'Form of Dread', max: prof, reset: long }),
	// Necrotic Husk's revival comes back after 1d4 long rests.
	sub('warlock/undead', { key: 'necrotic-husk', name: 'Necrotic Husk', max: oneAt(10), reset: never }),
	sub('warlock/undead', { key: 'spirit-projection', name: 'Spirit Projection', max: oneAt(14), reset: long }),
	sub('wizard/abjuration', {
		key: 'arcane-ward',
		name: 'Arcane Ward',
		max: (c) => (c.level >= 2 ? 2 * c.level + abilityMod(abilityScores(c).int) : 0),
		reset: long,
		pool: true
	}),
	sub('wizard/conjuration', { key: 'benign-transposition', name: 'Benign Transposition', max: oneAt(6), reset: long }),
	sub('wizard/illusion', { key: 'illusory-self', name: 'Illusory Self', max: oneAt(10), reset: short }),
	sub('wizard/scribes', { key: 'manifest-mind', name: 'Manifest Mind', max: profAt(6), reset: long }),
	sub('wizard/scribes', { key: 'one-with-the-word', name: 'One with the Word', max: oneAt(14), reset: long }),
	sub('wizard/transmutation', { key: 'shapechanger', name: 'Shapechanger', max: oneAt(10), reset: short }),
	...['Cloud', 'Fire', 'Frost', 'Hill', 'Stone', 'Storm'].map((n) => rune(`${n} Rune`)),

	race('dragonborn', {
		key: 'breath-weapon',
		name: 'Breath Weapon',
		max: () => 1,
		reset: short,
		die: (c) => dieByLevel(c.level, [[1, '2d6'], [6, '3d6'], [11, '4d6'], [16, '5d6']])
	}),
	race('half-orc', { key: 'relentless-endurance', name: 'Relentless Endurance', max: () => 1, reset: long }),
	race('tiefling', { key: 'hellish-rebuke', name: 'Hellish Rebuke', feature: 'Infernal Legacy', max: (c) => byLevel(c.level, [[3, 1]]), reset: long }),
	race('tiefling', { key: 'infernal-darkness', name: 'Darkness', feature: 'Infernal Legacy', max: (c) => byLevel(c.level, [[5, 1]]), reset: long }),
	subrace('elf/drow', { key: 'faerie-fire', name: 'Faerie Fire', feature: 'Drow Magic', max: (c) => byLevel(c.level, [[3, 1]]), reset: long }),
	subrace('elf/drow', { key: 'drow-darkness', name: 'Darkness', feature: 'Drow Magic', max: (c) => byLevel(c.level, [[5, 1]]), reset: long }),

	// Volo's Guide to Monsters. Keys get -vgm where the MPMM version has the same trait.
	race('aasimar-vgm', { key: 'healing-hands-vgm', name: 'Healing Hands', max: one, reset: long }),
	subrace('aasimar-vgm/protector', { key: 'radiant-soul', name: 'Radiant Soul', max: at3, reset: long }),
	subrace('aasimar-vgm/scourge', { key: 'radiant-consumption', name: 'Radiant Consumption', max: at3, reset: long }),
	subrace('aasimar-vgm/fallen', { key: 'necrotic-shroud', name: 'Necrotic Shroud', max: at3, reset: long }),
	race('firbolg-vgm', { key: 'firbolg-vgm-detect-magic', name: 'Detect Magic', feature: 'Firbolg Magic', max: one, reset: short }),
	race('firbolg-vgm', { key: 'firbolg-vgm-disguise-self', name: 'Disguise Self', feature: 'Firbolg Magic', max: one, reset: short }),
	race('firbolg-vgm', { key: 'hidden-step-vgm', name: 'Hidden Step', max: one, reset: short }),
	race('goblin-vgm', { key: 'fury-of-the-small-vgm', name: 'Fury of the Small', max: one, reset: short }),
	race('goliath-vgm', { key: 'stones-endurance-vgm', name: "Stone's Endurance", max: one, reset: short, die: () => 'd12' }),
	race('hobgoblin-vgm', { key: 'saving-face', name: 'Saving Face', max: one, reset: short }),
	race('kobold-vgm', { key: 'grovel-cower-and-beg', name: 'Grovel, Cower, and Beg', max: one, reset: short }),
	race('lizardfolk-vgm', { key: 'hungry-jaws-vgm', name: 'Hungry Jaws', max: one, reset: short }),
	race('triton-vgm', { key: 'triton-vgm-fog-cloud', name: 'Fog Cloud', feature: 'Control Air and Water', max: one, reset: long }),
	race('triton-vgm', { key: 'triton-vgm-gust-of-wind', name: 'Gust of Wind', feature: 'Control Air and Water', max: at3, reset: long }),
	race('triton-vgm', { key: 'triton-vgm-wall-of-water', name: 'Wall of Water', feature: 'Control Air and Water', max: at5, reset: long }),
	race('yuan-ti-pureblood-vgm', { key: 'yuan-ti-pureblood-vgm-suggestion', name: 'Suggestion', feature: 'Innate Spellcasting', max: at3, reset: long }),

	// Monsters of the Multiverse. Racial spells are keyed '<race>-<spell>'; each can be cast once per long rest.
	race('aarakocra', { key: 'aarakocra-gust-of-wind', name: 'Gust of Wind', feature: 'Wind Caller', max: at3, reset: long }),
	race('aasimar', { key: 'healing-hands', name: 'Healing Hands', max: one, reset: long, die: (c) => `${prof(c)}d4` }),
	race('aasimar', { key: 'celestial-revelation', name: 'Celestial Revelation', max: at3, reset: long }),
	race('deep-gnome', { key: 'deep-gnome-disguise-self', name: 'Disguise Self', feature: 'Gift of the Svirfneblin', max: at3, reset: long }),
	race('deep-gnome', { key: 'deep-gnome-nondetection', name: 'Nondetection', feature: 'Gift of the Svirfneblin', max: at5, reset: long }),
	race('deep-gnome', { key: 'svirfneblin-camouflage', name: 'Svirfneblin Camouflage', max: prof, reset: long }),
	race('duergar', { key: 'duergar-enlarge-reduce', name: 'Enlarge/Reduce', feature: 'Duergar Magic', max: at3, reset: long }),
	race('duergar', { key: 'duergar-invisibility', name: 'Invisibility', feature: 'Duergar Magic', max: at5, reset: long }),
	race('eladrin', { key: 'fey-step', name: 'Fey Step', max: prof, reset: long }),
	race('fairy', { key: 'fairy-faerie-fire', name: 'Faerie Fire', feature: 'Fairy Magic', max: at3, reset: long }),
	race('fairy', { key: 'fairy-enlarge-reduce', name: 'Enlarge/Reduce', feature: 'Fairy Magic', max: at5, reset: long }),
	race('firbolg', { key: 'firbolg-detect-magic', name: 'Detect Magic', feature: 'Firbolg Magic', max: one, reset: long }),
	race('firbolg', { key: 'firbolg-disguise-self', name: 'Disguise Self', feature: 'Firbolg Magic', max: one, reset: long }),
	race('firbolg', { key: 'hidden-step', name: 'Hidden Step', max: prof, reset: long }),
	subrace('genasi/air', { key: 'genasi-feather-fall', name: 'Feather Fall', feature: 'Mingle with the Wind', max: at3, reset: long }),
	subrace('genasi/air', { key: 'genasi-levitate', name: 'Levitate', feature: 'Mingle with the Wind', max: at5, reset: long }),
	subrace('genasi/earth', { key: 'merge-with-stone', name: 'Blade Ward (bonus action)', feature: 'Merge with Stone', max: prof, reset: long }),
	subrace('genasi/earth', { key: 'genasi-pass-without-trace', name: 'Pass without Trace', feature: 'Merge with Stone', max: at5, reset: long }),
	subrace('genasi/fire', { key: 'genasi-burning-hands', name: 'Burning Hands', feature: 'Reach to the Blaze', max: at3, reset: long }),
	subrace('genasi/fire', { key: 'genasi-flame-blade', name: 'Flame Blade', feature: 'Reach to the Blaze', max: at5, reset: long }),
	subrace('genasi/water', { key: 'genasi-create-or-destroy-water', name: 'Create or Destroy Water', feature: 'Call to the Wave', max: at3, reset: long }),
	subrace('genasi/water', { key: 'genasi-water-walk', name: 'Water Walk', feature: 'Call to the Wave', max: at5, reset: long }),
	race('githyanki', { key: 'githyanki-jump', name: 'Jump', feature: 'Githyanki Psionics', max: at3, reset: long }),
	race('githyanki', { key: 'githyanki-misty-step', name: 'Misty Step', feature: 'Githyanki Psionics', max: at5, reset: long }),
	race('githzerai', { key: 'githzerai-shield', name: 'Shield', feature: 'Githzerai Psionics', max: at3, reset: long }),
	race('githzerai', { key: 'githzerai-detect-thoughts', name: 'Detect Thoughts', feature: 'Githzerai Psionics', max: at5, reset: long }),
	race('goblin', { key: 'fury-of-the-small', name: 'Fury of the Small', max: prof, reset: long }),
	race('goliath', { key: 'stones-endurance', name: "Stone's Endurance", max: prof, reset: long, die: () => 'd12' }),
	race('harengon', { key: 'rabbit-hop', name: 'Rabbit Hop', max: prof, reset: long }),
	race('hobgoblin', { key: 'fey-gift', name: 'Fey Gift', max: prof, reset: long }),
	race('hobgoblin', { key: 'fortune-from-the-many', name: 'Fortune from the Many', max: prof, reset: long }),
	race('kenku', { key: 'kenku-recall', name: 'Kenku Recall', max: prof, reset: long }),
	race('kobold', { key: 'draconic-cry', name: 'Draconic Cry', max: prof, reset: long }),
	race('lizardfolk', { key: 'hungry-jaws', name: 'Hungry Jaws', max: prof, reset: long }),
	race('orc', { key: 'adrenaline-rush', name: 'Adrenaline Rush', max: prof, reset: long }),
	race('orc', { key: 'orc-relentless-endurance', name: 'Relentless Endurance', max: one, reset: long }),
	race('shadar-kai', { key: 'blessing-of-the-raven-queen', name: 'Blessing of the Raven Queen', max: prof, reset: long }),
	race('shifter', { key: 'shifting', name: 'Shifting', max: prof, reset: long }),
	race('triton', { key: 'triton-fog-cloud', name: 'Fog Cloud', feature: 'Control Air and Water', max: one, reset: long }),
	race('triton', { key: 'triton-gust-of-wind', name: 'Gust of Wind', feature: 'Control Air and Water', max: at3, reset: long }),
	race('triton', { key: 'triton-water-walk', name: 'Water Walk', feature: 'Control Air and Water', max: at5, reset: long }),
	race('yuan-ti', { key: 'yuan-ti-suggestion', name: 'Suggestion', feature: 'Serpentine Spellcasting', max: at3, reset: long })
];

function owns(c: Character, def: ResourceDef): boolean {
	const { kind, key } = def.owner;
	switch (kind) {
		case 'class':
			return c.classKey === key;
		case 'subclass':
			return !!c.subclassKey && `${c.classKey}/${c.subclassKey}` === key;
		case 'race':
			return c.raceKey === key;
		case 'subrace':
			return !!c.raceKey && !!c.subraceKey && `${c.raceKey}/${c.subraceKey}` === key;
		case 'option':
			return c.classOptions.some((o) => o.ref === key);
	}
}

/** Resources this character has right now: owner matches and max is above 0. */
export function resourcesFor(c: Character): ResourceDef[] {
	return RESOURCES.filter((r) => owns(c, r) && r.max(c) > 0);
}

export function resourceLeft(c: Character, def: ResourceDef): number {
	const max = def.max(c);
	return Math.min(max, Math.max(0, max - (c.resourcesUsed[def.key] ?? 0)));
}

export function spendResource(c: Character, key: string, n = 1): boolean {
	const def = resourcesFor(c).find((r) => r.key === key);
	if (!def || !Number.isInteger(n) || n <= 0 || n > resourceLeft(c, def)) return false;
	c.resourcesUsed[key] = (c.resourcesUsed[key] ?? 0) + n;
	return true;
}

export function restoreResource(c: Character, key: string, n = 1): void {
	const def = resourcesFor(c).find((r) => r.key === key);
	// Clamp first so a level drop (used above the new max) doesn't swallow restores.
	const used = Math.min(c.resourcesUsed[key] ?? 0, def ? def.max(c) : Infinity);
	if (used <= 0 || n <= 0) return;
	const left = used - n;
	if (left > 0) c.resourcesUsed[key] = left;
	else delete c.resourcesUsed[key];
}

/**
 * A long rest resets everything but counters that don't come back on a rest ('none': Divine Intervention);
 * a short rest only what resets on short. Unknown keys wait for a long rest. Custom counters that never
 * come back ('none') are only refilled by hand too.
 */
export function resetResources(c: Character, kind: 'short' | 'long'): void {
	if (kind === 'long') {
		const kept = resourcesFor(c).filter((def) => def.reset(c) === 'none' && c.resourcesUsed[def.key]);
		c.resourcesUsed = Object.fromEntries(kept.map((def) => [def.key, c.resourcesUsed[def.key]]));
	} else {
		for (const def of resourcesFor(c)) if (def.reset(c) === 'short') delete c.resourcesUsed[def.key];
	}
	for (const r of c.customResources) if (r.reset === 'short' || (kind === 'long' && r.reset === 'long')) r.used = 0;
}

export function spendCustom(c: Character, id: string): boolean {
	const r = c.customResources.find((x) => x.id === id);
	if (!r || !(r.used + 1 <= r.max)) return false;
	r.used = Math.max(0, r.used) + 1;
	return true;
}

export function restoreCustom(c: Character, id: string): void {
	const r = c.customResources.find((x) => x.id === id);
	if (!r) return;
	r.used = Math.max(0, Math.min(r.used, r.max) - 1);
}

/** What one use of a counter is called: a Ki point, a superiority die, else a use. */
export function resourceUnit(def: Pick<ResourceDef, 'key' | 'pool'>): [one: string, many: string] {
	if (DICE.has(def.key)) return ['die', 'dice'];
	if (def.pool || def.key === 'ki') return ['point', 'points'];
	return ['use', 'uses'];
}

const DICE = new Set(['superiority-dice', 'psionic-energy', 'soulknife-psionic-energy', 'healing-light', 'balm-of-the-summer-court']);

/** The animation Vitals plays when a feature is used, by what it does. Features not listed get arcane. */
export const FEATURE_FX: Partial<Record<UseFx, string[]>> = {
	heal: [
		'second-wind', 'lay-on-hands', 'healing-light', 'healing-hands', 'healing-hands-vgm', 'balm-of-the-summer-court', 'wholeness-of-body',
		'hand-of-ultimate-mercy', 'relentless-endurance', 'orc-relentless-endurance', 'unearthly-recovery', 'experimental-elixir', 'undying-sentinel'
	],
	radiant: [
		'channel-divinity', 'paladin-channel-divinity', 'harness-divine-power', 'paladin-harness-divine-power', 'divine-intervention', 'cleansing-touch',
		'radiant-soul', 'radiant-consumption', 'searing-vengeance', 'celestial-revelation', 'holy-nimbus', 'elder-champion', 'avenging-angel',
		'living-legend', 'glorious-defense', 'mortal-bulwark', 'emboldening-bond', 'favored-by-the-gods', 'starry-guiding-bolt'
	],
	light: [
		'divine-sense', 'warding-flare', 'eyes-of-night', 'cosmic-omen', 'magic-awareness', 'detect-portal', 'hunters-sense',
		'firbolg-detect-magic', 'firbolg-vgm-detect-magic', 'faerie-fire', 'fairy-faerie-fire'
	],
	necrotic: [
		'necrotic-shroud', 'form-of-dread', 'necrotic-husk', 'spirit-projection', 'wails-from-the-grave', 'strength-of-the-grave', 'dread-lord',
		'eyes-of-the-grave', 'sentinel-at-deaths-door', 'blessing-of-the-raven-queen', 'hexblades-curse', 'accursed-specter', 'hurl-through-hell',
		'infernal-darkness', 'drow-darkness'
	],
	fire: ['fire-rune', 'cauterizing-flames', 'blessing-of-the-forge', 'genasi-burning-hands', 'genasi-flame-blade', 'hellish-rebuke'],
	lightning: ['wrath-of-the-storm', 'storm-rune', 'arcane-jolt'],
	frost: ['frost-rune'],
	music: [
		'bardic-inspiration', 'infectious-inspiration', 'mantle-of-majesty', 'unbreakable-majesty', 'universal-speech', 'mantle-of-whispers',
		'draconic-cry', 'fey-presence', 'yuan-ti-suggestion', 'yuan-ti-pureblood-vgm-suggestion'
	],
	strike: [
		'rage', 'action-surge', 'favored-foe', 'superiority-dice', 'arcane-shot', 'giants-might', 'unwavering-mark', 'fighting-spirit',
		'strength-before-death', 'war-priest', 'infectious-fury', 'invincible-conqueror', 'stroke-of-luck', 'fury-of-the-small', 'fury-of-the-small-vgm',
		'hungry-jaws', 'hungry-jaws-vgm', 'saving-face', 'fortune-from-the-many'
	],
	force: [
		'indomitable', 'arcane-ward', 'runic-shield', 'defensive-field', 'warding-maneuver', 'entropic-ward', 'psionic-energy', 'soulknife-psionic-energy',
		'restore-balance', 'trance-of-order', 'clockwork-cavalcade', 'warping-implosion', 'hill-rune', 'stones-endurance', 'stones-endurance-vgm',
		'githzerai-shield', 'merge-with-stone', 'bolstering-magic'
	],
	vanish: [
		'wild-shape', 'misty-escape', 'misty-wanderer', 'fey-step', 'benign-transposition', 'illusory-self', 'hidden-step', 'hidden-step-vgm',
		'steps-of-night', 'natures-veil', 'shadow-lore', 'fathomless-plunge', 'shapechanger', 'shifting', 'walker-in-dreams', 'hidden-paths',
		'dark-delirium', 'svirfneblin-camouflage', 'githyanki-misty-step', 'duergar-invisibility', 'deep-gnome-disguise-self', 'deep-gnome-nondetection',
		'firbolg-disguise-self', 'firbolg-vgm-disguise-self', 'grovel-cower-and-beg', 'fey-gift'
	],
	summon: [
		'eldritch-cannon', 'fey-reinforcements', 'spirit-totem', 'animating-performance', 'performance-of-creation', 'manifest-mind',
		'tentacle-of-the-deeps', 'triton-fog-cloud', 'triton-vgm-fog-cloud', 'bottled-respite'
	],
	wind: [
		'cloud-rune', 'elemental-gift', 'writhing-tide', 'rabbit-hop', 'adrenaline-rush', 'githyanki-jump', 'aarakocra-gust-of-wind', 'triton-gust-of-wind',
		'triton-vgm-gust-of-wind', 'genasi-feather-fall', 'genasi-levitate', 'bladesong'
	],
	scroll: ['one-with-the-word', 'kenku-recall', 'spell-storing-item']
};

const FX_BY_KEY = new Map(Object.entries(FEATURE_FX).flatMap(([fx, keys]) => keys.map((k) => [k, fx as UseFx])));

/** A dragonborn's breath by ancestry (the subrace key is the dragon's colour). */
const BREATH: Record<string, UseFx> = {
	black: 'poison',
	copper: 'poison',
	green: 'poison',
	blue: 'lightning',
	bronze: 'lightning',
	brass: 'fire',
	gold: 'fire',
	red: 'fire',
	silver: 'frost',
	white: 'frost'
};

/** The animation for using a feature: a dragonborn's breath by ancestry, else by what the feature does. */
export function featureFx(c: Pick<Character, 'subraceKey'>, def: Pick<ResourceDef, 'key'>): UseFx {
	if (def.key === 'breath-weapon') return BREATH[c.subraceKey ?? ''] ?? 'fire';
	return FX_BY_KEY.get(def.key) ?? 'arcane';
}
