import type { Ability, Character, ClassOption, ClassOptionKind, Skill } from '$lib/types';
import { characterFeat, type FeatData } from '$lib/data/content';
import { abilityMod } from './abilities';
import { attacksPerAction, fightingStyleCount } from './attacks';
import { resourcesFor } from './features';
import { sorceryPointsMax } from './resources';
import { abilityBreakdown } from './stats';
import {
	arcanumLevels,
	cantripsKnown,
	ordinal,
	pactSlots,
	prepStyle,
	proficiencyBonus,
	slotMax,
	spellLimit,
	type SpellPrep
} from './spellcasting';
import { levelUp, MAX_LEVEL } from './xp';

type Steps = [level: number, value: number][];

/** Value of the highest breakpoint at or below `level`; 0 below the first. */
function byLevel(level: number, steps: Steps): number {
	let value = 0;
	for (const [from, v] of steps) if (level >= from) value = v;
	return value;
}

const SUBCLASS_LEVEL: Record<string, number> = { cleric: 1, sorcerer: 1, warlock: 1, druid: 2, wizard: 2 };

/** The level a class picks its subclass: 1 for clerics, sorcerers and warlocks, 2 for druids and wizards, 3 for the rest. */
export const subclassLevel = (classKey: string) => SUBCLASS_LEVEL[classKey] ?? 3;

/** Ability Score Improvement (or a feat) at 4, 8, 12, 16 and 19, plus fighter 6 and 14 and rogue 10. */
export function isAsiLevel(classKey: string, level: number): boolean {
	if ([4, 8, 12, 16, 19].includes(level)) return true;
	return (classKey === 'fighter' && (level === 6 || level === 14)) || (classKey === 'rogue' && level === 10);
}

const EXPERTISE: Record<string, Record<number, number>> = { rogue: { 1: 2, 6: 2 }, bard: { 3: 2, 10: 2 } };

/** Skills a class gains expertise in at exactly this level (rogue 1 and 6, bard 3 and 10). */
export const expertiseGained = (classKey: string, level: number) => EXPERTISE[classKey]?.[level] ?? 0;

/** Metamagic options a sorcerer knows: 2 at 3rd level, 3 at 10th, 4 at 17th. */
export const metamagicCount = (c: Pick<Character, 'classKey' | 'level'>) =>
	c.classKey === 'sorcerer' ? byLevel(c.level, [[3, 2], [10, 3], [17, 4]]) : 0;

interface OptionTable {
	kind: ClassOptionKind;
	classKey: string;
	subclassKey?: string;
	steps: Steps;
}

const OPTION_TABLES: OptionTable[] = [
	{ kind: 'invocation', classKey: 'warlock', steps: [[2, 2], [5, 3], [7, 4], [9, 5], [12, 6], [15, 7], [18, 8]] },
	{ kind: 'pact-boon', classKey: 'warlock', steps: [[3, 1]] },
	{ kind: 'maneuver', classKey: 'fighter', subclassKey: 'battle-master', steps: [[3, 3], [7, 5], [10, 7], [15, 9]] },
	{ kind: 'arcane-shot', classKey: 'fighter', subclassKey: 'arcane-archer', steps: [[3, 2], [7, 3], [10, 4], [15, 5], [18, 6]] },
	{ kind: 'rune', classKey: 'fighter', subclassKey: 'rune-knight', steps: [[3, 2], [7, 3], [10, 4], [15, 5]] },
	{ kind: 'infusion', classKey: 'artificer', steps: [[2, 4], [6, 6], [10, 8], [14, 10], [18, 12]] },
	// Elemental Attunement counts as one of them.
	{ kind: 'discipline', classKey: 'monk', subclassKey: 'four-elements', steps: [[3, 2], [6, 3], [11, 4], [17, 5]] }
];

export const OPTION_INFO: Record<ClassOptionKind, { one: string; many: string; swap?: string }> = {
	invocation: { one: 'Eldritch Invocation', many: 'Eldritch Invocations', swap: 'You can also replace one invocation you know.' },
	'pact-boon': { one: 'Pact Boon', many: 'Pact Boon' },
	maneuver: { one: 'Maneuver', many: 'Maneuvers', swap: 'When you learn new maneuvers you can also replace one you know.' },
	'arcane-shot': { one: 'Arcane Shot option', many: 'Arcane Shot options', swap: 'When you learn a new option you can also replace one you know.' },
	rune: { one: 'Rune', many: 'Runes', swap: 'You can also replace one rune you know.' },
	infusion: { one: 'Artificer Infusion', many: 'Artificer Infusions', swap: 'You can also replace one infusion you know.' },
	discipline: { one: 'Elemental Discipline', many: 'Elemental Disciplines', swap: 'When you learn a new discipline you can also replace one you know.' }
};

/** How many options of this kind the class (or subclass) gives at the character's level. */
export function optionCount(c: Pick<Character, 'classKey' | 'subclassKey' | 'level'>, kind: ClassOptionKind): number {
	const t = OPTION_TABLES.find((x) => x.kind === kind && x.classKey === c.classKey && (!x.subclassKey || x.subclassKey === c.subclassKey));
	return t ? byLevel(c.level, t.steps) : 0;
}

/** Option kinds the character has picks for at their level. */
export const optionKinds = (c: Pick<Character, 'classKey' | 'subclassKey' | 'level'>) =>
	OPTION_TABLES.filter((t) => optionCount(c, t.kind) > 0).map((t) => t.kind);

type LevelInput = Pick<Character, 'classKey' | 'subclassKey' | 'level' | 'spellMod'>;

/** What the player has to choose when `prev` becomes `next` (one level up, subclass already picked if it's due). */
export interface LevelUpNeeds {
	/** A subclass is due and the character has none. */
	subclass: boolean;
	/** Ability Score Improvement or a feat. */
	asi: boolean;
	/** Fighting styles the class gives at the new level, when the character has fewer. */
	fightingStyles: number;
	/** New skills to gain expertise in. */
	expertise: number;
	/** Metamagic options known at the new level, when the character has fewer. */
	metamagic: number;
	/** Option lists that grow at this level, with the new total. */
	options: { kind: ClassOptionKind; total: number }[];
	/** New cantrips to learn. */
	cantrips: number;
	/** New spells to learn (known casters) or copy into the spellbook (wizards). */
	spells: number;
	/** Known casters can swap one spell they know for another. */
	swapSpell: boolean;
	/** A new Mystic Arcanum spell level (warlock 11, 13, 15, 17). */
	arcanum: number | null;
	prep: SpellPrep;
}

export function levelUpNeeds(
	prev: LevelInput & Pick<Character, 'fightingStyles' | 'metamagic' | 'classOptions'>,
	next: LevelInput
): LevelUpNeeds {
	const prep = prepStyle(next);
	const known = (kind: ClassOptionKind) => prev.classOptions.filter((o) => o.kind === kind).length;
	const styles = fightingStyleCount(next);
	const meta = metamagicCount(next);
	const newArcanum = arcanumLevels(next).find((l) => !arcanumLevels(prev).includes(l));
	const prevPrep = prepStyle(prev);
	return {
		subclass: !next.subclassKey && next.level >= subclassLevel(next.classKey),
		asi: isAsiLevel(next.classKey, next.level),
		fightingStyles: styles > prev.fightingStyles.length ? styles : 0,
		expertise: expertiseGained(next.classKey, next.level),
		metamagic: meta > prev.metamagic.length ? meta : 0,
		options: optionKinds(next)
			.map((kind) => ({ kind, total: optionCount(next, kind) }))
			.filter((o) => o.total > optionCount(prev, o.kind) || o.total > known(o.kind)),
		cantrips: Math.max(0, cantripsKnown(next) - cantripsKnown(prev)),
		spells:
			prep === 'known'
				? Math.max(0, spellLimit(next) - (prevPrep === 'known' ? spellLimit(prev) : 0))
				: prep === 'spellbook' && next.level > 1
					? 2
					: 0,
		swapSpell: prep === 'known' && prevPrep === 'known' && spellLimit(prev) > 0,
		arcanum: newArcanum ?? null,
		prep
	};
}

/** Numbers that change at the new level, as short lines: "Proficiency bonus +2 → +3", "Rage 3 → 4". */
export function levelUpChanges(prev: Character, next: Character): string[] {
	const out: string[] = [];
	const sign = (n: number) => `+${n}`;
	const pb = [proficiencyBonus(prev.level), proficiencyBonus(next.level)];
	if (pb[0] !== pb[1]) out.push(`Proficiency bonus ${sign(pb[0])} → ${sign(pb[1])}`);
	out.push(`Hit dice ${prev.level} → ${next.level}`);

	const before = new Map(resourcesFor(prev).map((r) => [r.key, r]));
	for (const r of resourcesFor(next)) {
		const old = before.get(r.key);
		const [m0, m1] = [old ? old.max(prev) : 0, r.max(next)];
		const [d0, d1] = [old?.die?.(prev), r.die?.(next)];
		if (!old) out.push(`New: ${r.name} ${m1}${d1 ? ` (${d1})` : ''}`);
		else if (m0 !== m1 || d0 !== d1) out.push(`${r.name} ${m0}${d0 ? ` (${d0})` : ''} → ${m1}${d1 ? ` (${d1})` : ''}`);
	}
	for (const r of resourcesFor(prev)) if (!resourcesFor(next).some((x) => x.key === r.key)) out.push(`${r.name}: no longer counted`);

	const [s0, s1] = [slotMax(prev), slotMax(next)];
	for (let i = 0; i < s1.length; i++) {
		if ((s0[i] ?? 0) !== s1[i]) out.push(`${ordinal(i + 1)}-level slots ${s0[i] ?? 0} → ${s1[i]}`);
	}
	const [p0, p1] = [pactSlots(prev), pactSlots(next)];
	if (p1 && (p0?.count !== p1.count || p0?.level !== p1.level)) {
		out.push(`Pact slots ${p0 ? `${p0.count} × ${ordinal(p0.level)}` : 0} → ${p1.count} × ${ordinal(p1.level)}`);
	}
	const [sp0, sp1] = [sorceryPointsMax(prev), sorceryPointsMax(next)];
	if (sp0 !== sp1) out.push(`Sorcery points ${sp0} → ${sp1}`);
	const [a0, a1] = [attacksPerAction(prev), attacksPerAction(next)];
	if (a0 !== a1) out.push(`Attacks per Attack action ${a0} → ${a1}`);
	if (prepStyle(next) === 'prepared' || prepStyle(next) === 'spellbook') {
		const [l0, l1] = [prepStyle(prev) === 'none' ? 0 : spellLimit(prev), spellLimit(next)];
		if (l0 !== l1) out.push(`Spells you can prepare ${l0} → ${l1}`);
	}
	return out;
}

/** Ability Score Improvement: each entry is +1, so ['str', 'str'] is +2 Strength. */
export interface AsiChoice {
	kind: 'asi';
	abilities: Ability[];
}

export interface FeatChoice {
	kind: 'feat';
	feat: FeatData;
	/** The ability the feat raises (fixed or chosen); also the save for Resilient. */
	ability?: Ability;
	skills: Skill[];
	expertise: Skill[];
}

export interface LevelUpChoices {
	/** Max HP gained (hit die roll or average, plus CON and the rest). */
	hp: number;
	subclassKey?: string;
	improvement?: AsiChoice | FeatChoice;
	/** The full list of fighting styles after levelling. */
	fightingStyles?: string[];
	/** Skills gaining expertise from the class. */
	expertise?: Skill[];
	/** The full list of metamagic options after levelling. */
	metamagic?: string[];
	/** The full list of class options after levelling, for each kind in `optionKinds`. */
	options?: ClassOption[];
	optionKinds?: ClassOptionKind[];
	/** Spells learned (cantrips, new spells, Mystic Arcanum, spellbook copies). */
	learn?: string[];
	/** Spells swapped out. */
	forget?: string[];
}

/** Ability increases a feat choice gives, as +1 picks. */
export function featAbilities(choice: FeatChoice): Ability[] {
	const fixed = Object.entries(choice.feat.ability?.fixed ?? {}).flatMap(([k, n]) => Array<Ability>(n ?? 0).fill(k as Ability));
	if (fixed.length) return fixed;
	return choice.ability && choice.feat.ability?.choose ? Array<Ability>(choice.feat.ability.amount ?? 1).fill(choice.ability) : [];
}

/**
 * Go up a level with everything the player chose, in one change. Returns false at level 20.
 * `choices.hp` is the gain for the new level; a Tough feat or a higher CON modifier taken now also adds HP for the levels before.
 * Spells are only added by id; copy pack spells with `cacheSpell` afterwards. Run `recompute` after (session.mutate does).
 */
export function applyLevelUp(c: Character, choices: LevelUpChoices): boolean {
	if (c.level >= MAX_LEVEL) return false;
	const level = c.level + 1;
	if (choices.subclassKey) c.subclassKey = choices.subclassKey;

	const conMod = () => abilityMod(abilityBreakdown(c).withoutItems.con);
	const conBefore = conMod();
	const imp = choices.improvement;
	if (imp?.kind === 'asi') {
		for (const a of imp.abilities) c.abilities[a] += 1;
	} else if (imp?.kind === 'feat') {
		const raised = featAbilities(imp);
		for (const a of raised) c.abilities[a] += 1;
		if (imp.feat.save && imp.ability && !c.saveProficiencies.includes(imp.ability)) c.saveProficiencies.push(imp.ability);
		for (const s of imp.skills) if (!c.skillProficiencies.includes(s)) c.skillProficiencies.push(s);
		for (const s of imp.expertise) if (!c.skillExpertise.includes(s)) c.skillExpertise.push(s);
		c.feats.push(characterFeat(imp.feat, level, raised));
		if (imp.feat.hpPerLevel) {
			c.hpBase += imp.feat.hpPerLevel * c.level;
			c.hpCurrent += imp.feat.hpPerLevel * c.level;
		}
	}

	// A new CON modifier counts as if it had been there from 1st level; `choices.hp` already uses it for the new level.
	const conChange = (conMod() - conBefore) * c.level;
	c.hpBase += conChange;
	c.hpCurrent = Math.max(0, c.hpCurrent + conChange);

	if (choices.fightingStyles) c.fightingStyles = [...new Set(choices.fightingStyles)];
	for (const s of choices.expertise ?? []) if (!c.skillExpertise.includes(s)) c.skillExpertise.push(s);
	if (choices.metamagic) c.metamagic = [...new Set(choices.metamagic)];
	if (choices.optionKinds?.length) {
		const kinds = new Set(choices.optionKinds);
		c.classOptions = [...c.classOptions.filter((o) => !kinds.has(o.kind)), ...(choices.options ?? []).filter((o) => kinds.has(o.kind))];
	}

	const learn = choices.learn ?? [];
	const forget = new Set((choices.forget ?? []).filter((id) => !learn.includes(id)));
	c.spells = c.spells.filter((s) => !forget.has(s.id));
	for (const id of learn) if (!c.spells.some((s) => s.id === id)) c.spells.push({ id, prepared: true });
	if (c.concentration && forget.size) {
		// Concentration is kept by name; drop it if that spell was swapped out.
		const name = c.concentration.toLowerCase();
		if ([...forget].some((id) => id.split('|')[0] === name)) c.concentration = undefined;
	}

	return levelUp(c, choices.hp);
}
