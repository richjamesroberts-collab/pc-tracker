import type { Ability, Character, InventoryItem, Skill } from '$lib/types';
import { CLASS_MAP } from '$lib/data/classes';
import { RACE_MAP } from '$lib/data/races';
import { ABILITY_SHORT, abilityMod, signedMod } from './abilities';
import { heavyLoadNote } from './carry';
import { isActive } from './items';
import { proficiencyBonus } from './spellcasting';
import { abilityBreakdown, bladesongActive, scoreDetail, type AbilityBreakdown, type StatSource } from './stats';

export const SKILLS: { key: Skill; name: string; ability: Ability }[] = [
	{ key: 'acrobatics', name: 'Acrobatics', ability: 'dex' },
	{ key: 'animal-handling', name: 'Animal Handling', ability: 'wis' },
	{ key: 'arcana', name: 'Arcana', ability: 'int' },
	{ key: 'athletics', name: 'Athletics', ability: 'str' },
	{ key: 'deception', name: 'Deception', ability: 'cha' },
	{ key: 'history', name: 'History', ability: 'int' },
	{ key: 'insight', name: 'Insight', ability: 'wis' },
	{ key: 'intimidation', name: 'Intimidation', ability: 'cha' },
	{ key: 'investigation', name: 'Investigation', ability: 'int' },
	{ key: 'medicine', name: 'Medicine', ability: 'wis' },
	{ key: 'nature', name: 'Nature', ability: 'int' },
	{ key: 'perception', name: 'Perception', ability: 'wis' },
	{ key: 'performance', name: 'Performance', ability: 'cha' },
	{ key: 'persuasion', name: 'Persuasion', ability: 'cha' },
	{ key: 'religion', name: 'Religion', ability: 'int' },
	{ key: 'sleight-of-hand', name: 'Sleight of Hand', ability: 'dex' },
	{ key: 'stealth', name: 'Stealth', ability: 'dex' },
	{ key: 'survival', name: 'Survival', ability: 'wis' }
];

export const SKILL_KEYS = SKILLS.map((s) => s.key);

/** Skills a race always has, keyed by race key, with the trait that gives them. Racial choices are the player's picks. */
const RACE_SKILLS: Record<string, { skills: Skill[]; trait: string }> = {
	bugbear: { skills: ['stealth'], trait: 'Sneaky' },
	'bugbear-vgm': { skills: ['stealth'], trait: 'Sneaky' },
	eladrin: { skills: ['perception'], trait: 'Keen Senses' },
	elf: { skills: ['perception'], trait: 'Keen Senses' },
	goliath: { skills: ['athletics'], trait: 'Natural Athlete' },
	'goliath-vgm': { skills: ['athletics'], trait: 'Natural Athlete' },
	'half-orc': { skills: ['intimidation'], trait: 'Menacing' },
	harengon: { skills: ['perception'], trait: 'Hare-Trigger' },
	satyr: { skills: ['performance', 'persuasion'], trait: 'Reveler' },
	'sea-elf': { skills: ['perception'], trait: 'Keen Senses' },
	'shadar-kai': { skills: ['perception'], trait: 'Keen Senses' },
	tabaxi: { skills: ['perception', 'stealth'], trait: "Cat's Talent" },
	'tabaxi-vgm': { skills: ['perception', 'stealth'], trait: "Cat's Talent" }
};

/** The skills the character's race gives, and where from ("Elf (Keen Senses)"). */
export function raceSkills(c: Pick<Character, 'raceKey'>): { skills: Skill[]; source: string } {
	const r = c.raceKey ? RACE_SKILLS[c.raceKey] : undefined;
	if (!r) return { skills: [], source: '' };
	return { skills: r.skills, source: `${RACE_MAP.get(c.raceKey!)?.name ?? c.raceKey} (${r.trait})` };
}

/** The skills the character's background gives outright, and where from ("Acolyte (background)"). */
export function backgroundSkills(c: Partial<Pick<Character, 'background'>>): { skills: Skill[]; source: string } {
	const b = c.background;
	return b ? { skills: b.skills, source: `${b.name} (background)` } : { skills: [], source: '' };
}

interface SubclassSkills {
	/** Skills it gives outright. */
	skills?: Skill[];
	/** Skills to pick when the subclass is taken; any skill when `from` is left out. */
	choose?: { count: number; from?: Skill[] };
	/** Its skills also get expertise. */
	expertise?: true;
	/** The pick can be a language instead. */
	orLanguage?: true;
}

/** Skills from subclasses, by `class/subclass`. */
const SUBCLASS_SKILLS: Record<string, SubclassSkills> = {
	'bard/lore': { choose: { count: 3 } },
	'cleric/arcana': { skills: ['arcana'] },
	'cleric/knowledge': { choose: { count: 2, from: ['arcana', 'history', 'nature', 'religion'] }, expertise: true },
	'cleric/nature': { choose: { count: 1, from: ['animal-handling', 'nature', 'survival'] } },
	'cleric/order': { choose: { count: 1, from: ['intimidation', 'persuasion'] } },
	'cleric/peace': { choose: { count: 1, from: ['insight', 'performance', 'persuasion'] } },
	'fighter/arcane-archer': { choose: { count: 1, from: ['arcana', 'nature'] } },
	'fighter/cavalier': { choose: { count: 1, from: ['animal-handling', 'history', 'insight', 'performance', 'persuasion'] }, orLanguage: true },
	'fighter/samurai': { choose: { count: 1, from: ['history', 'insight', 'performance', 'persuasion'] }, orLanguage: true },
	'monk/drunken-master': { skills: ['performance'] },
	'monk/mercy': { skills: ['insight', 'medicine'] },
	'ranger/fey-wanderer': { choose: { count: 1, from: ['deception', 'performance', 'persuasion'] } },
	'rogue/scout': { skills: ['nature', 'survival'], expertise: true },
	'wizard/bladesinging': { skills: ['performance'] }
};

/** What the character's subclass does for their skills. */
export const subclassSkills = (c: Partial<Pick<Character, 'classKey' | 'subclassKey'>>): SubclassSkills => SUBCLASS_SKILLS[`${c.classKey}/${c.subclassKey}`] ?? {};

/** Who gave a subclass's skills: "Way of Mercy". */
const subclassName = (c: Partial<Pick<Character, 'classKey' | 'subclassKey'>>) =>
	CLASS_MAP.get(c.classKey ?? '')?.subclasses.find((s) => s.key === c.subclassKey)?.name ?? '';

/** The skills the character's subclass gives outright, and where from. */
export const givenBySubclass = (c: Partial<Pick<Character, 'classKey' | 'subclassKey'>>) => ({ skills: subclassSkills(c).skills ?? [], source: subclassName(c) });

type FixedInput = Pick<Character, 'raceKey'> & Partial<Pick<Character, 'background' | 'classKey' | 'subclassKey'>>;

/** Every skill the character has without picking it; one from two places is listed twice. */
export const fixedSkills = (c: FixedInput): Skill[] => [...raceSkills(c).skills, ...givenBySubclass(c).skills, ...backgroundSkills(c).skills];

/** Skills a class picks from at 1st level (PHB, TCE), and how many; Bard picks any three. */
const CLASS_SKILLS: Record<string, { count: number; from?: Skill[] }> = {
	artificer: { count: 2, from: ['arcana', 'history', 'investigation', 'medicine', 'nature', 'perception', 'sleight-of-hand'] },
	barbarian: { count: 2, from: ['animal-handling', 'athletics', 'intimidation', 'nature', 'perception', 'survival'] },
	bard: { count: 3 },
	cleric: { count: 2, from: ['history', 'insight', 'medicine', 'persuasion', 'religion'] },
	druid: { count: 2, from: ['arcana', 'animal-handling', 'insight', 'medicine', 'nature', 'perception', 'religion', 'survival'] },
	fighter: { count: 2, from: ['acrobatics', 'animal-handling', 'athletics', 'history', 'insight', 'intimidation', 'perception', 'survival'] },
	monk: { count: 2, from: ['acrobatics', 'athletics', 'history', 'insight', 'religion', 'stealth'] },
	paladin: { count: 2, from: ['athletics', 'insight', 'intimidation', 'medicine', 'persuasion', 'religion'] },
	ranger: { count: 3, from: ['animal-handling', 'athletics', 'insight', 'investigation', 'nature', 'perception', 'stealth', 'survival'] },
	rogue: {
		count: 4,
		from: ['acrobatics', 'athletics', 'deception', 'insight', 'intimidation', 'investigation', 'perception', 'performance', 'persuasion', 'sleight-of-hand', 'stealth']
	},
	sorcerer: { count: 2, from: ['arcana', 'deception', 'insight', 'intimidation', 'persuasion', 'religion'] },
	warlock: { count: 2, from: ['arcana', 'deception', 'history', 'intimidation', 'investigation', 'nature', 'religion'] },
	wizard: { count: 2, from: ['arcana', 'history', 'insight', 'investigation', 'medicine', 'religion'] }
};

/** Skills a race (or `race/subrace`) picks from, and how many; no list means any skill. */
const RACE_SKILL_CHOICES: Record<string, { count: number; from?: Skill[]; trait: string }> = {
	'human/variant': { count: 1, trait: 'Skills' },
	'half-elf': { count: 2, trait: 'Skill Versatility' },
	'custom-lineage': { count: 1, trait: 'Variable Trait' },
	centaur: { count: 1, from: ['animal-handling', 'medicine', 'nature', 'survival'], trait: 'Natural Affinity' },
	changeling: { count: 2, from: ['deception', 'insight', 'intimidation', 'performance', 'persuasion'], trait: 'Changeling Instincts' },
	githyanki: { count: 1, trait: 'Githyanki Psionics' },
	kenku: { count: 2, trait: 'Kenku Recall' },
	'kenku-vgm': { count: 2, from: ['acrobatics', 'deception', 'sleight-of-hand', 'stealth'], trait: 'Kenku Training' },
	kobold: { count: 1, from: ['arcana', 'investigation', 'medicine', 'sleight-of-hand', 'survival'], trait: 'Kobold Legacy' },
	lizardfolk: { count: 2, from: ['animal-handling', 'medicine', 'nature', 'perception', 'stealth', 'survival'], trait: "Nature's Intuition" },
	'lizardfolk-vgm': { count: 2, from: ['animal-handling', 'nature', 'perception', 'stealth', 'survival'], trait: "Hunter's Lore" },
	'orc-vgm': { count: 2, from: ['animal-handling', 'insight', 'intimidation', 'medicine', 'nature', 'perception', 'survival'], trait: 'Primal Intuition' },
	shifter: { count: 1, from: ['acrobatics', 'athletics', 'intimidation', 'survival'], trait: 'Bestial Instincts' },
	tortle: { count: 1, from: ['animal-handling', 'medicine', 'nature', 'perception', 'stealth', 'survival'], trait: "Nature's Intuition" }
};

export interface SkillChoice {
	/** "Fighter" or "Half-Elf (Skill Versatility)". */
	source: string;
	count: number;
	/** The skills to pick from; any skill when left out. */
	from?: Skill[];
}

/** The skill picks the character's class, race and background offer at 1st level, for the form to point out. */
export function skillChoices(c: Pick<Character, 'classKey' | 'raceKey' | 'subraceKey' | 'subclassKey' | 'background'>): SkillChoice[] {
	const out: SkillChoice[] = [];
	const cls = CLASS_SKILLS[c.classKey];
	if (cls) out.push({ source: CLASS_MAP.get(c.classKey)?.name ?? c.classKey, ...cls });
	const race = c.raceKey ? (RACE_SKILL_CHOICES[`${c.raceKey}/${c.subraceKey}`] ?? RACE_SKILL_CHOICES[c.raceKey]) : undefined;
	if (race) out.push({ source: `${RACE_MAP.get(c.raceKey!)?.name ?? c.raceKey} (${race.trait})`, count: race.count, from: race.from });
	if (c.background?.choose) out.push({ source: backgroundSkills(c).source, ...c.background.choose });
	const sub = subclassSkills(c).choose;
	if (sub) out.push({ source: subclassName(c), ...sub });
	// The PHB: a proficiency from two sources lets the player take another of the same kind.
	const fixed = fixedSkills(c);
	const twice = fixed.length - new Set(fixed).size;
	if (twice) out.push({ source: 'From two places', count: twice });
	return out;
}

/**
 * How many picks each choice holds, each pick used once and at most `count` to a choice, arranged so that as many
 * as possible fit: a pick on two lists goes where it leaves room for the rest.
 */
export function fillChoices<C extends { count: number; from?: readonly string[] }, P>(
	choices: C[],
	picks: P[],
	accepts: (choice: C, pick: P) => boolean
): { made: Map<C, number>; fitted: P[] } {
	// Narrow lists first, so a pick counts for the list that needs it rather than an "any".
	const size = (ch: C) => ch.from?.length ?? Infinity;
	const slots = [...choices].sort((a, b) => size(a) - size(b)).flatMap((ch) => Array.from({ length: ch.count }, () => ch));
	const held = slots.map(() => -1);
	const place = (pick: number, seen: Set<number>): boolean => {
		for (let s = 0; s < slots.length; s++) {
			if (seen.has(s) || !accepts(slots[s], picks[pick])) continue;
			seen.add(s);
			if (held[s] < 0 || place(held[s], seen)) {
				held[s] = pick;
				return true;
			}
		}
		return false;
	};
	picks.forEach((_, i) => place(i, new Set()));
	const made = new Map(choices.map((ch) => [ch, slots.filter((slot, s) => slot === ch && held[s] >= 0).length]));
	return { made, fitted: held.filter((p) => p >= 0).sort((a, b) => a - b).map((p) => picks[p]) };
}

const onList = (ch: SkillChoice, skill: Skill) => !ch.from || ch.from.includes(skill);

/** How the player's skill picks fill the choices; `picks` leaves out skills they have anyway. */
export const skillsMade = (choices: SkillChoice[], picks: Skill[]) => fillChoices(choices, picks, onList);

/** Whether a choice still has room for this skill. */
export const canPickSkill = (choices: SkillChoice[], picks: Skill[], skill: Skill) =>
	skillsMade(choices, [...picks, skill]).fitted.length > skillsMade(choices, picks).fitted.length;

/** Item bonuses and advantage on skills, by the bundled item's id, while the item is in use. */
const ITEM_SKILLS: Record<string, { skill?: Skill; bonus?: number; note?: string }[]> = {
	'stone of good luck|dmg': [{ bonus: 1 }],
	'gloves of thievery|dmg': [{ skill: 'sleight-of-hand', bonus: 5 }],
	'gloves of swimming and climbing|dmg': [{ skill: 'athletics', note: '+5 to climb or swim' }],
	'belt of dwarvenkind|dmg': [{ skill: 'persuasion', note: 'Advantage with dwarves' }],
	'boots of elvenkind|dmg': [{ skill: 'stealth', note: 'Advantage when moving silently' }],
	'cloak of elvenkind|dmg': [{ skill: 'stealth', note: 'Advantage to hide, hood up' }],
	'cloak of the bat|dmg': [{ skill: 'stealth', note: 'Advantage' }],
	'shadowfell brand tattoo|tce': [{ skill: 'stealth', note: 'Advantage' }],
	'eyes of the eagle|dmg': [{ skill: 'perception', note: 'Advantage on checks that rely on sight' }],
	'robe of eyes|dmg': [{ skill: 'perception', note: 'Advantage on checks that rely on sight' }],
	'rod of alertness|dmg': [{ skill: 'perception', note: 'Advantage while holding it' }],
	'sentinel shield|dmg': [{ skill: 'perception', note: 'Advantage while holding it' }],
	'eyes of minute seeing|dmg': [{ skill: 'investigation', note: 'Advantage on things within 1 ft' }]
};

/** Worn armor that gives disadvantage on Stealth: all heavy armor, padded, scale mail and half plate, unless mithral. */
function noisyArmor(i: InventoryItem): boolean {
	if (!i.armor || !i.equipped || i.armor.type === 'shield' || /mithral/i.test(i.name)) return false;
	return i.armor.type === 'heavy' || /\b(padded|scale mail|half plate)\b/i.test(`${i.name} ${i.armor.base ?? ''}`);
}

export type SkillLevel = 'none' | 'half' | 'proficient' | 'expertise';

export interface SkillCheck {
	key: Skill;
	name: string;
	ability: Ability;
	total: number;
	level: SkillLevel;
	parts: StatSource[];
	/** Advantage, disadvantage and features that apply only sometimes; not in `total`. */
	notes: string[];
}

type SkillInput = Pick<
	Character,
	| 'abilities'
	| 'raceKey'
	| 'subraceKey'
	| 'raceAbilityChoices'
	| 'classKey'
	| 'subclassKey'
	| 'level'
	| 'items'
	| 'skillProficiencies'
	| 'skillExpertise'
> &
	Partial<Pick<Character, 'coins' | 'stashes' | 'encumbranceRule' | 'background' | 'feats' | 'bladesong'>>;

/** Observant adds this to passive Perception and Investigation. */
const OBSERVANT_BONUS = 5;
const observant = (c: Partial<Pick<Character, 'feats'>>) => !!c.feats?.some((f) => f.ref === 'observant|phb');

/**
 * Every skill's modifier with how it was worked out: ability modifier, proficiency (the player's picks, or
 * the race's or background's), expertise, Jack of All Trades or Remarkable Athlete, and item bonuses.
 */
export function skillChecks(c: SkillInput, breakdown: AbilityBreakdown = abilityBreakdown(c)): SkillCheck[] {
	const prof = proficiencyBonus(c.level);
	const race = raceSkills(c);
	const background = backgroundSkills(c);
	const given = givenBySubclass(c);
	const picks = new Set(c.skillProficiencies ?? []);
	const expertise = new Set(c.skillExpertise ?? []);
	const cls = CLASS_MAP.get(c.classKey);
	const subclass = cls?.subclasses.find((s) => s.key === c.subclassKey)?.name;
	const items = (c.items ?? []).filter((i) => i.ref && ITEM_SKILLS[i.ref] && isActive(i));
	const noisy = (c.items ?? []).filter(noisyArmor);
	const heavy = heavyLoadNote(c);

	return SKILLS.map((s) => {
		const mod = abilityMod(breakdown.scores[s.ability]);
		const parts: StatSource[] = [
			{ label: `${ABILITY_SHORT[s.ability]} modifier`, value: signedMod(mod), from: scoreDetail(c.abilities, breakdown, s.ability) }
		];
		const notes: string[] = [];
		let total = mod;
		let level: SkillLevel = 'none';

		const fromRace = race.skills.includes(s.key);
		const fromBackground = background.skills.includes(s.key);
		const fromSubclass = given.skills.includes(s.key);
		const expert = expertise.has(s.key) || (fromSubclass && !!subclassSkills(c).expertise);
		if (picks.has(s.key) || fromRace || fromBackground || fromSubclass || expert) {
			level = 'proficient';
			total += prof;
			parts.push({
				label: 'Proficiency',
				value: signedMod(prof),
				from: `${fromRace ? race.source : fromSubclass ? given.source : fromBackground ? background.source : 'Your pick (class, background or feat)'} · level ${c.level} bonus`
			});
			if (expert) {
				level = 'expertise';
				total += prof;
				parts.push({ label: 'Expertise', value: signedMod(prof), from: `${fromSubclass ? given.source : 'Your pick'}: proficiency bonus doubled` });
			}
		} else if (c.classKey === 'bard' && c.level >= 2) {
			level = 'half';
			const n = Math.floor(prof / 2);
			total += n;
			parts.push({ label: 'Jack of All Trades', value: signedMod(n), from: 'Bard: half proficiency, rounded down' });
		} else if (c.classKey === 'fighter' && c.subclassKey === 'champion' && c.level >= 7 && ['str', 'dex', 'con'].includes(s.ability)) {
			level = 'half';
			const n = Math.ceil(prof / 2);
			total += n;
			parts.push({ label: 'Remarkable Athlete', value: signedMod(n), from: `${subclass ?? 'Champion'}: half proficiency, rounded up` });
		}

		for (const i of items) {
			for (const e of ITEM_SKILLS[i.ref!]) {
				if (e.skill && e.skill !== s.key) continue;
				if (e.bonus) {
					total += e.bonus;
					parts.push({ label: i.name, value: signedMod(e.bonus), from: e.skill ? `Magic item: ${s.name} checks` : 'Magic item: all ability checks' });
				}
				if (e.note) notes.push(`${i.name}: ${e.note}`);
			}
		}

		if (s.key === 'stealth') for (const a of noisy) notes.push(`${a.name}: disadvantage`);
		if (s.key === 'acrobatics' && bladesongActive(c)) notes.push('Bladesong: advantage');
		if (heavy && (s.ability === 'str' || s.ability === 'dex' || s.ability === 'con')) notes.push(heavy);
		if (c.classKey === 'rogue' && c.level >= 11 && level !== 'none' && level !== 'half') {
			notes.push(`Reliable Talent: a d20 roll of 9 or lower counts as 10 (at least ${total + 10})`);
		}
		if (c.classKey === 'barbarian' && s.ability === 'str') notes.push('Raging: advantage');
		// Stonecunning and Artificer's Lore count as proficiency and double it, for some History checks.
		const doubled = level === 'expertise' ? 0 : level === 'proficient' ? prof : 2 * prof - (level === 'half' ? total - mod : 0);
		if (s.key === 'history' && doubled > 0) {
			if (c.raceKey === 'dwarf') notes.push(`Stonecunning: ${signedMod(total + doubled)} about the origin of stonework`);
			if (c.raceKey === 'gnome' && c.subraceKey === 'rock') {
				notes.push(`Artificer’s Lore: ${signedMod(total + doubled)} about magic items, alchemical objects or technological devices`);
			}
		}
		if (c.classKey === 'bard' && c.subclassKey === 'lore' && c.level >= 14) notes.push('Peerless Skill: spend a Bardic Inspiration die and add it');
		if (s.key === 'perception' || s.key === 'investigation' || s.key === 'insight') {
			const bonus = s.key !== 'insight' && observant(c) ? OBSERVANT_BONUS : 0;
			notes.push(`Passive ${s.name.toLowerCase()}: ${10 + total + bonus}`);
		}

		return { key: s.key, name: s.name, ability: s.ability, total, level, parts, notes };
	});
}

export interface PassivePerception {
	/** What's shown: the player's own number if they set one. */
	total: number;
	/** What it comes to without the player's own number. */
	worked: number;
	/** The player's own number replaces the worked-out one. */
	own: boolean;
	parts: StatSource[];
	notes: string[];
}

/** Passive Perception: 10 plus the Perception check, and Observant's bonus; `c.passivePerception` replaces it. */
export function passivePerception(c: SkillInput & Partial<Pick<Character, 'passivePerception'>>, breakdown: AbilityBreakdown = abilityBreakdown(c)): PassivePerception {
	const check = skillChecks(c, breakdown).find((s) => s.key === 'perception')!;
	const bonus = observant(c) ? OBSERVANT_BONUS : 0;
	const worked = 10 + check.total + bonus;
	const parts: StatSource[] = [
		{ label: 'Base', value: '10', from: 'Every passive check' },
		...check.parts,
		...(bonus ? [{ label: 'Observant', value: signedMod(bonus), from: 'Feat' }] : [])
	];
	const notes = [...check.notes.filter((n) => !n.startsWith('Passive') && !n.startsWith('Reliable')), 'Advantage on the check adds 5, disadvantage takes 5 off'];
	if (c.passivePerception == null) return { total: worked, worked, own: false, parts, notes };
	return {
		total: c.passivePerception,
		worked,
		own: true,
		parts: [{ label: 'Your own number', value: `${c.passivePerception}`, from: 'Set in Edit' }],
		notes: [`Worked out it would be ${worked}: clear the box in Edit to use that`, ...notes]
	};
}
