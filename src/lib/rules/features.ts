import type { Character } from '$lib/types';
import { proficiencyBonus } from './spellcasting';

export { proficiencyBonus };

export interface ResourceDef {
	key: string;
	name: string;
	/** Subclass owners use '<classKey>/<subclassKey>', subrace owners '<raceKey>/<subraceKey>'. */
	owner: { kind: 'class' | 'subclass' | 'race' | 'subrace'; key: string };
	/** 0 = hidden. */
	max(c: Character): number;
	reset(c: Character): 'short' | 'long';
	die?(c: Character): string;
	/** Spent in amounts and shown as a number (Lay on Hands). */
	pool?: true;
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
const psiDie =(c: Character) => dieByLevel(c.level, [[1, 'd6'], [5, 'd8'], [11, 'd10'], [17, 'd12']]);

type Def = Omit<ResourceDef, 'owner'>;
const cls = (key: string, d: Def): ResourceDef => ({ ...d, owner: { kind: 'class', key } });
const sub = (key: string, d: Def): ResourceDef => ({ ...d, owner: { kind: 'subclass', key } });
const race = (key: string, d: Def): ResourceDef => ({ ...d, owner: { kind: 'race', key } });
const subrace = (key: string, d: Def): ResourceDef => ({ ...d, owner: { kind: 'subrace', key } });

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

	sub('fighter/battle-master', {
		key: 'superiority-dice',
		name: 'Superiority Dice',
		max: (c) => byLevel(c.level, [[3, 4], [7, 5], [15, 6]]),
		reset: short,
		die: (c) => dieByLevel(c.level, [[1, 'd8'], [10, 'd10'], [18, 'd12']])
	}),
	sub('fighter/arcane-archer', { key: 'arcane-shot', name: 'Arcane Shot', max: (c) => byLevel(c.level, [[3, 2]]), reset: short }),
	sub('fighter/rune-knight', { key: 'giants-might', name: "Giant's Might", max: (c) => (c.level >= 3 ? prof(c) : 0), reset: long }),
	sub('fighter/psi-warrior', { key: 'psionic-energy', name: 'Psionic Energy', max: (c) => (c.level >= 3 ? 2 * prof(c) : 0), reset: long, die: psiDie }),
	sub('rogue/soulknife', { key: 'soulknife-psionic-energy', name: 'Psionic Energy', max: (c) => (c.level >= 3 ? 2 * prof(c) : 0), reset: long, die: psiDie }),
	sub('barbarian/wild-magic', { key: 'bolstering-magic', name: 'Bolstering Magic', max: (c) => (c.level >= 6 ? prof(c) : 0), reset: long }),
	sub('sorcerer/wild-magic', { key: 'tides-of-chaos', name: 'Tides of Chaos', max: () => 1, reset: long }),
	sub('sorcerer/divine-soul', { key: 'favored-by-the-gods', name: 'Favored by the Gods', max: () => 1, reset: short }),
	sub('wizard/divination', { key: 'portent', name: 'Portent', max: (c) => byLevel(c.level, [[2, 2], [14, 3]]), reset: long }),
	sub('wizard/bladesinging', { key: 'bladesong', name: 'Bladesong', max: (c) => (c.level >= 2 ? prof(c) : 0), reset: long }),
	sub('cleric/light', { key: 'warding-flare', name: 'Warding Flare', max: mod1, reset: long }),
	sub('cleric/tempest', { key: 'wrath-of-the-storm', name: 'Wrath of the Storm', max: mod1, reset: long }),
	sub('cleric/war', { key: 'war-priest', name: 'War Priest', max: mod1, reset: long }),
	sub('cleric/peace', { key: 'emboldening-bond', name: 'Emboldening Bond', max: prof, reset: long }),
	sub('druid/stars', { key: 'starry-guiding-bolt', name: 'Guiding Bolt (Star Map)', max: (c) => (c.level >= 2 ? prof(c) : 0), reset: long }),
	sub('ranger/fey-wanderer', { key: 'fey-reinforcements', name: 'Fey Reinforcements', max: (c) => byLevel(c.level, [[11, 1]]), reset: long }),
	sub('ranger/fey-wanderer', { key: 'misty-wanderer', name: 'Misty Wanderer', max: (c) => (c.level >= 15 ? mod1(c) : 0), reset: long }),
	sub('ranger/swarmkeeper', { key: 'writhing-tide', name: 'Writhing Tide', max: (c) => (c.level >= 7 ? prof(c) : 0), reset: long }),
	sub('sorcerer/clockwork-soul', { key: 'restore-balance', name: 'Restore Balance', max: prof, reset: long }),
	sub('warlock/hexblade', { key: 'hexblades-curse', name: "Hexblade's Curse", max: () => 1, reset: short }),
	sub('warlock/genie', { key: 'bottled-respite', name: 'Bottled Respite', max: () => 1, reset: long }),

	race('dragonborn', {
		key: 'breath-weapon',
		name: 'Breath Weapon',
		max: () => 1,
		reset: short,
		die: (c) => dieByLevel(c.level, [[1, '2d6'], [6, '3d6'], [11, '4d6'], [16, '5d6']])
	}),
	race('half-orc', { key: 'relentless-endurance', name: 'Relentless Endurance', max: () => 1, reset: long }),
	race('tiefling', { key: 'hellish-rebuke', name: 'Hellish Rebuke', max: (c) => byLevel(c.level, [[3, 1]]), reset: long }),
	race('tiefling', { key: 'infernal-darkness', name: 'Darkness', max: (c) => byLevel(c.level, [[5, 1]]), reset: long }),
	subrace('elf/drow', { key: 'faerie-fire', name: 'Faerie Fire', max: (c) => byLevel(c.level, [[3, 1]]), reset: long }),
	subrace('elf/drow', { key: 'drow-darkness', name: 'Darkness', max: (c) => byLevel(c.level, [[5, 1]]), reset: long }),

	// Volo's Guide to Monsters. Keys get -vgm where the MPMM version has the same trait.
	race('aasimar-vgm', { key: 'healing-hands-vgm', name: 'Healing Hands', max: one, reset: long }),
	subrace('aasimar-vgm/protector', { key: 'radiant-soul', name: 'Radiant Soul', max: at3, reset: long }),
	subrace('aasimar-vgm/scourge', { key: 'radiant-consumption', name: 'Radiant Consumption', max: at3, reset: long }),
	subrace('aasimar-vgm/fallen', { key: 'necrotic-shroud', name: 'Necrotic Shroud', max: at3, reset: long }),
	race('firbolg-vgm', { key: 'firbolg-vgm-detect-magic', name: 'Detect Magic', max: one, reset: short }),
	race('firbolg-vgm', { key: 'firbolg-vgm-disguise-self', name: 'Disguise Self', max: one, reset: short }),
	race('firbolg-vgm', { key: 'hidden-step-vgm', name: 'Hidden Step', max: one, reset: short }),
	race('goblin-vgm', { key: 'fury-of-the-small-vgm', name: 'Fury of the Small', max: one, reset: short }),
	race('goliath-vgm', { key: 'stones-endurance-vgm', name: "Stone's Endurance", max: one, reset: short, die: () => 'd12' }),
	race('hobgoblin-vgm', { key: 'saving-face', name: 'Saving Face', max: one, reset: short }),
	race('kobold-vgm', { key: 'grovel-cower-and-beg', name: 'Grovel, Cower, and Beg', max: one, reset: short }),
	race('lizardfolk-vgm', { key: 'hungry-jaws-vgm', name: 'Hungry Jaws', max: one, reset: short }),
	race('triton-vgm', { key: 'triton-vgm-fog-cloud', name: 'Fog Cloud', max: one, reset: long }),
	race('triton-vgm', { key: 'triton-vgm-gust-of-wind', name: 'Gust of Wind', max: at3, reset: long }),
	race('triton-vgm', { key: 'triton-vgm-wall-of-water', name: 'Wall of Water', max: at5, reset: long }),
	race('yuan-ti-pureblood-vgm', { key: 'yuan-ti-pureblood-vgm-suggestion', name: 'Suggestion', max: at3, reset: long }),

	// Monsters of the Multiverse. Racial spells are keyed '<race>-<spell>'; each can be cast once per long rest.
	race('aarakocra', { key: 'aarakocra-gust-of-wind', name: 'Gust of Wind', max: at3, reset: long }),
	race('aasimar', { key: 'healing-hands', name: 'Healing Hands', max: one, reset: long, die: (c) => `${prof(c)}d4` }),
	race('aasimar', { key: 'celestial-revelation', name: 'Celestial Revelation', max: at3, reset: long }),
	race('deep-gnome', { key: 'deep-gnome-disguise-self', name: 'Disguise Self', max: at3, reset: long }),
	race('deep-gnome', { key: 'deep-gnome-nondetection', name: 'Nondetection', max: at5, reset: long }),
	race('deep-gnome', { key: 'svirfneblin-camouflage', name: 'Svirfneblin Camouflage', max: prof, reset: long }),
	race('duergar', { key: 'duergar-enlarge-reduce', name: 'Enlarge/Reduce', max: at3, reset: long }),
	race('duergar', { key: 'duergar-invisibility', name: 'Invisibility', max: at5, reset: long }),
	race('eladrin', { key: 'fey-step', name: 'Fey Step', max: prof, reset: long }),
	race('fairy', { key: 'fairy-faerie-fire', name: 'Faerie Fire', max: at3, reset: long }),
	race('fairy', { key: 'fairy-enlarge-reduce', name: 'Enlarge/Reduce', max: at5, reset: long }),
	race('firbolg', { key: 'firbolg-detect-magic', name: 'Detect Magic', max: one, reset: long }),
	race('firbolg', { key: 'firbolg-disguise-self', name: 'Disguise Self', max: one, reset: long }),
	race('firbolg', { key: 'hidden-step', name: 'Hidden Step', max: prof, reset: long }),
	subrace('genasi/air', { key: 'genasi-feather-fall', name: 'Feather Fall', max: at3, reset: long }),
	subrace('genasi/air', { key: 'genasi-levitate', name: 'Levitate', max: at5, reset: long }),
	subrace('genasi/earth', { key: 'merge-with-stone', name: 'Blade Ward (bonus action)', max: prof, reset: long }),
	subrace('genasi/earth', { key: 'genasi-pass-without-trace', name: 'Pass without Trace', max: at5, reset: long }),
	subrace('genasi/fire', { key: 'genasi-burning-hands', name: 'Burning Hands', max: at3, reset: long }),
	subrace('genasi/fire', { key: 'genasi-flame-blade', name: 'Flame Blade', max: at5, reset: long }),
	subrace('genasi/water', { key: 'genasi-create-or-destroy-water', name: 'Create or Destroy Water', max: at3, reset: long }),
	subrace('genasi/water', { key: 'genasi-water-walk', name: 'Water Walk', max: at5, reset: long }),
	race('githyanki', { key: 'githyanki-jump', name: 'Jump', max: at3, reset: long }),
	race('githyanki', { key: 'githyanki-misty-step', name: 'Misty Step', max: at5, reset: long }),
	race('githzerai', { key: 'githzerai-shield', name: 'Shield', max: at3, reset: long }),
	race('githzerai', { key: 'githzerai-detect-thoughts', name: 'Detect Thoughts', max: at5, reset: long }),
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
	race('triton', { key: 'triton-fog-cloud', name: 'Fog Cloud', max: one, reset: long }),
	race('triton', { key: 'triton-gust-of-wind', name: 'Gust of Wind', max: at3, reset: long }),
	race('triton', { key: 'triton-water-walk', name: 'Water Walk', max: at5, reset: long }),
	race('yuan-ti', { key: 'yuan-ti-suggestion', name: 'Suggestion', max: at3, reset: long })
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

/** A long rest resets everything; a short rest only what resets on short. Unknown keys wait for a long rest. */
export function resetResources(c: Character, kind: 'short' | 'long'): void {
	if (kind === 'long') {
		c.resourcesUsed = {};
	} else {
		for (const def of resourcesFor(c)) if (def.reset(c) === 'short') delete c.resourcesUsed[def.key];
	}
	for (const r of c.customResources) if (kind === 'long' || r.reset === 'short') r.used = 0;
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
