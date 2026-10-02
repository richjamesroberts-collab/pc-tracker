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
const psiDie = (c: Character) => dieByLevel(c.level, [[1, 'd6'], [5, 'd8'], [11, 'd10'], [17, 'd12']]);

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
	subrace('elf/drow', { key: 'drow-darkness', name: 'Darkness', max: (c) => byLevel(c.level, [[5, 1]]), reset: long })
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
