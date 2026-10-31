import type { Ability, Beast, Character } from '$lib/types';
import { signedMod } from './abilities';
import type { Attack } from './attacks';
import { defenses, type Defense, type Defenses } from './defenses';
import { applyDamage, type DamageResult } from './hp';
import { spendResource } from './features';
import { senses } from './senses';
import { passivePerception, type PassivePerception } from './skills';
import { abilityBreakdown, initiative, type AbilityBreakdown } from './stats';

const RESOURCE = 'wild-shape';

type LevelInput = Pick<Character, 'classKey' | 'subclassKey' | 'level'>;

const moon = (c: LevelInput) => c.classKey === 'druid' && c.subclassKey === 'moon';

export interface BeastLimit {
	maxCr: number;
	fly: boolean;
	swim: boolean;
}

/** The Beast Shapes table: Circle of the Moon replaces its CR (Circle Forms) but keeps its limits on movement. */
export function beastLimit(c: LevelInput): BeastLimit {
	const table = c.level >= 8 ? 1 : c.level >= 4 ? 0.5 : 0.25;
	return { maxCr: moon(c) ? (c.level >= 6 ? Math.floor(c.level / 3) : 1) : table, fly: c.level >= 8, swim: c.level >= 4 };
}

/** The highest CR as written: "1/4". */
export const crLabel = (cr: number) => (cr === 0.25 ? '1/4' : cr === 0.5 ? '1/2' : cr === 0.125 ? '1/8' : `${cr}`);

/** Whether the druid can take this form. */
export function canBecome(c: LevelInput, b: Pick<Beast, 'crValue' | 'speed' | 'elemental'>): boolean {
	if (b.elemental) return moon(c) && c.level >= 10;
	const limit = beastLimit(c);
	return b.crValue <= limit.maxCr && (limit.fly || !b.speed.fly) && (limit.swim || !b.speed.swim);
}

/** Uses a form costs: an elemental two (Elemental Wild Shape), and none at 20th level (Archdruid). */
export const shapeCost = (c: LevelInput, b: Pick<Beast, 'elemental'>) => (c.level >= 20 ? 0 : b.elemental ? 2 : 1);

/** How long a form lasts: half the druid's level, rounded down. */
export const shapeHours = (c: LevelInput) => Math.floor(c.level / 2);

/** Take a form, spending what it costs. Returns false if there aren't enough uses. */
export function transform(c: Character, beast: Beast): boolean {
	const cost = shapeCost(c, beast);
	if (cost && !spendResource(c, RESOURCE, cost)) return false;
	c.wildShape = { hp: beast.hp, beast: structuredClone(beast) };
	return true;
}

/** Back to normal form, with the hit points the character had before. */
export function revert(c: Character): void {
	c.wildShape = undefined;
}

export interface ShapeDamage extends Pick<DamageResult, 'absorbed' | 'concentrationDC'> {
	/** The form dropped to 0 hit points. */
	reverted: boolean;
	/** What carried over to normal form. */
	overflow: number;
	/** The overflow dropped the character too. */
	droppedToZero: boolean;
	instantDeath: boolean;
}

/** Damage to the form: temp HP first, and at 0 hit points the character reverts and takes what's left over. */
export function damageShape(c: Character, amount: number): ShapeDamage {
	const ws = c.wildShape;
	const dmg = Math.max(0, Math.floor(amount));
	const out: ShapeDamage = { absorbed: 0, reverted: false, overflow: 0, droppedToZero: false, instantDeath: false };
	if (!ws || !dmg) return out;
	out.absorbed = Math.min(c.tempHp, dmg);
	c.tempHp -= out.absorbed;
	const remaining = dmg - out.absorbed;
	if (c.concentration) out.concentrationDC = Math.max(10, Math.floor(dmg / 2));
	if (remaining < ws.hp) {
		ws.hp -= remaining;
		return out;
	}
	out.reverted = true;
	out.overflow = remaining - ws.hp;
	revert(c);
	const after = applyDamage(c, out.overflow);
	out.droppedToZero = after.droppedToZero;
	out.instantDeath = after.instantDeath;
	if (after.droppedToZero) out.concentrationDC = undefined;
	return out;
}

/** Run `fn` with the form's hit points standing in for the character's, so healing heals the form. */
export function asShape<T>(c: Character, fn: () => T): T {
	const ws = c.wildShape;
	if (!ws) return fn();
	const [hp, max] = [c.hpCurrent, c.hpMax];
	c.hpCurrent = ws.hp;
	c.hpMax = ws.beast.hp;
	try {
		return fn();
	} finally {
		ws.hp = c.hpCurrent;
		c.hpCurrent = hp;
		c.hpMax = max;
	}
}

/** The form's scores: STR, DEX and CON are the beast's, INT, WIS and CHA stay the character's. */
export function shapeBreakdown(c: Character, beast: Beast): AbilityBreakdown {
	const own = abilityBreakdown(c).scores;
	const scores = { ...own, str: beast.str, dex: beast.dex, con: beast.con };
	const sources = Object.fromEntries((Object.keys(scores) as Ability[]).map((k) => [k, []])) as unknown as AbilityBreakdown['sources'];
	return { scores, withoutItems: scores, sources };
}

/** The character as a form: gear isn't counted, which is the DM's call while it's melded or dropped. */
const unequipped = (c: Character): Character => ({ ...c, items: [] });

/** Saving throws use `savingThrows` with this: the form's scores and the character's proficiencies. */
export const shapeSaveInput = (c: Character, beast: Beast) => ({ input: unequipped(c), breakdown: shapeBreakdown(c, beast) });

export const shapeInitiative = (c: Character, beast: Beast) => initiative(unequipped(c), shapeBreakdown(c, beast).scores).total;

/** Passive Perception in form: the character's own, or the stat block's if that's higher. */
export function shapePassive(c: Character, beast: Beast): PassivePerception {
	const own = passivePerception(unequipped(c), shapeBreakdown(c, beast));
	if (own.own || beast.passive <= own.worked) return own;
	return {
		...own,
		total: beast.passive,
		worked: beast.passive,
		parts: [
			{ label: 'Base', value: '10', from: 'Every passive check' },
			{ label: `${beast.name} Perception`, value: signedMod(beast.passive - 10), from: 'Stat block, higher than yours' }
		]
	};
}

/** The stat block's attacks as Vitals lists them. */
export function shapeAttacks(c: LevelInput, beast: Beast): Attack[] {
	const magical = moon(c) && c.level >= 6;
	return beast.attacks.map((a, i) => ({
		id: `beast:${i}`,
		name: a.name,
		toHit: a.toHit,
		damage: a.damage,
		damageBonus: 0,
		reach: a.reach,
		properties: '',
		proficient: true,
		ability: a.ranged ? 'dex' : 'str',
		hitParts: [{ label: 'Stat block', value: signedMod(a.toHit), from: beast.name }],
		damageParts: [{ label: 'Stat block', value: a.damage, from: beast.name }],
		notes: [...(a.rider ? [a.rider[0].toUpperCase() + a.rider.slice(1)] : []), ...(magical ? ['Primal Strike: counts as magical'] : [])]
	}));
}

const SPEEDS: [keyof Beast['speed'], string][] = [
	['walk', 'Speed'],
	['fly', 'Fly'],
	['swim', 'Swim'],
	['climb', 'Climb'],
	['burrow', 'Burrow']
];

/** Speeds and senses as Vitals tiles. Senses are the stat block's and the character's, the longest of each. */
export function shapeStats(c: Character, beast: Beast): { k: string; v: string }[] {
	const speeds = SPEEDS.flatMap(([key, k]) => (beast.speed[key] ? [{ k, v: `${beast.speed[key]} ft` }] : []));
	const longest = new Map(senses(c).map((s) => [s.name, s.range]));
	for (const s of beast.senses) longest.set(s.name, Math.max(s.range, longest.get(s.name) ?? 0));
	return [...speeds, ...[...longest].map(([k, range]) => ({ k, v: `${range} ft` }))];
}

/** Defenses in form: the stat block's on top of what the character has without gear. */
export function shapeDefenses(c: Character, beast: Beast): Defenses {
	const own = defenses(unequipped(c));
	const add = (list: Defense[], kind: Defense['kind'], names: string[]) => {
		for (const name of names) {
			if (!list.some((d) => d.name === name && !d.when)) list.push({ kind, name, sources: [beast.name] });
		}
	};
	add(own.immunities, 'immunity', [...(beast.immune ?? []), ...(beast.conditionImmune ?? [])]);
	add(own.resistances, 'resistance', beast.resist ?? []);
	return { ...own, resistances: own.resistances.filter((r) => r.when || !own.immunities.some((i) => i.name === r.name)) };
}
