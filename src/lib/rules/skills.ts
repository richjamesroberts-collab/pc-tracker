import type { Ability, Character, InventoryItem, Skill } from '$lib/types';
import { CLASS_MAP } from '$lib/data/classes';
import { RACE_MAP } from '$lib/data/races';
import { ABILITY_SHORT, abilityMod, signedMod } from './abilities';
import { heavyLoadNote } from './carry';
import { isActive } from './items';
import { proficiencyBonus } from './spellcasting';
import { abilityBreakdown, scoreDetail, type AbilityBreakdown, type StatSource } from './stats';

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

/** The skill picks the character's class and race offer at 1st level, for the form to point out. */
export function skillChoices(c: Pick<Character, 'classKey' | 'raceKey' | 'subraceKey'>): SkillChoice[] {
	const out: SkillChoice[] = [];
	const cls = CLASS_SKILLS[c.classKey];
	if (cls) out.push({ source: CLASS_MAP.get(c.classKey)?.name ?? c.classKey, ...cls });
	const race = c.raceKey ? (RACE_SKILL_CHOICES[`${c.raceKey}/${c.subraceKey}`] ?? RACE_SKILL_CHOICES[c.raceKey]) : undefined;
	if (race) out.push({ source: `${RACE_MAP.get(c.raceKey!)?.name ?? c.raceKey} (${race.trait})`, count: race.count, from: race.from });
	return out;
}

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
	Partial<Pick<Character, 'coins' | 'stashes' | 'encumbranceRule'>>;

/**
 * Every skill's modifier with how it was worked out: ability modifier, proficiency (the player's picks or
 * the race's), expertise, Jack of All Trades or Remarkable Athlete, and item bonuses.
 */
export function skillChecks(c: SkillInput, breakdown: AbilityBreakdown = abilityBreakdown(c)): SkillCheck[] {
	const prof = proficiencyBonus(c.level);
	const race = raceSkills(c);
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
		if (picks.has(s.key) || fromRace || expertise.has(s.key)) {
			level = 'proficient';
			total += prof;
			parts.push({
				label: 'Proficiency',
				value: signedMod(prof),
				from: `${fromRace ? race.source : 'Your pick (class, background or feat)'} · level ${c.level} bonus`
			});
			if (expertise.has(s.key)) {
				level = 'expertise';
				total += prof;
				parts.push({ label: 'Expertise', value: signedMod(prof), from: 'Your pick: proficiency bonus doubled' });
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
		if (s.key === 'perception' || s.key === 'investigation' || s.key === 'insight') notes.push(`Passive ${s.name.toLowerCase()}: ${10 + total}`);

		return { key: s.key, name: s.name, ability: s.ability, total, level, parts, notes };
	});
}
