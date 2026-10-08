import type { Ability, Character } from '$lib/types';
import { CLASS_MAP } from '$lib/data/classes';
import { RACE_MAP } from '$lib/data/races';
import { ABILITIES, ABILITY_SHORT, abilityMod, signedMod } from './abilities';
import { heavyLoadNote } from './carry';
import { isActive } from './items';
import { proficiencyBonus } from './spellcasting';
import { abilityBreakdown, scoreDetail, type AbilityBreakdown, type StatSource } from './stats';

/** Bonuses to every saving throw from items in use, by the bundled item's id. */
const ITEM_SAVE_BONUS: Record<string, number> = {
	'cloak of protection|dmg': 1,
	'ring of protection|dmg': 1,
	'luck blade|dmg': 1,
	'robe of stars|dmg': 1,
	'stone of good luck|dmg': 1,
	'staff of power|dmg': 2
};

/** Advantage on some saving throws from items in use, by the bundled item's id. */
const ITEM_SAVE_NOTES: Record<string, string> = {
	'belt of dwarvenkind|dmg': 'Advantage against poison',
	'mantle of spell resistance|dmg': 'Advantage against spells',
	'necklace of adaptation|dmg': 'Advantage against harmful gases and vapors',
	'ring of spell turning|dmg': 'Advantage against spells that target only you',
	'rod of alertness|dmg': 'Once planted (action, once a day): +1 to AC and saving throws for 10 minutes',
	'robe of the archmagi|dmg': 'Advantage against spells and other magical effects',
	'scarab of protection|dmg': 'Advantage against spells',
	'spellguard shield|dmg': 'Advantage against spells and other magical effects',
	'staff of the magi|dmg': 'Advantage against spells'
};

/** Racial advantage on saves, keyed by race or '<race>/<subrace>', with the saves it usually applies to. */
const RACE_SAVE_NOTES: Record<string, { trait: string; text: string; abilities: Ability[] }[]> = {
	dwarf: [{ trait: 'Dwarven Resilience', text: 'advantage against poison', abilities: ['con'] }],
	duergar: [
		{ trait: 'Dwarven Resilience', text: 'advantage against poison', abilities: ['con'] },
		{ trait: 'Psionic Fortitude', text: 'advantage against being charmed or stunned', abilities: ['wis', 'con'] }
	],
	elf: [{ trait: 'Fey Ancestry', text: 'advantage against being charmed', abilities: ['wis', 'cha'] }],
	eladrin: [{ trait: 'Fey Ancestry', text: 'advantage against being charmed', abilities: ['wis', 'cha'] }],
	'sea-elf': [{ trait: 'Fey Ancestry', text: 'advantage against being charmed', abilities: ['wis', 'cha'] }],
	'shadar-kai': [{ trait: 'Fey Ancestry', text: 'advantage against being charmed', abilities: ['wis', 'cha'] }],
	'half-elf': [{ trait: 'Fey Ancestry', text: 'advantage against being charmed', abilities: ['wis', 'cha'] }],
	gnome: [{ trait: 'Gnome Cunning', text: 'advantage against magic', abilities: ['int', 'wis', 'cha'] }],
	'deep-gnome': [{ trait: 'Gnome Cunning', text: 'advantage against magic', abilities: ['int', 'wis', 'cha'] }],
	halfling: [{ trait: 'Brave', text: 'advantage against being frightened', abilities: ['wis', 'cha'] }],
	'halfling/stout': [{ trait: 'Stout Resilience', text: 'advantage against poison', abilities: ['con'] }],
	githzerai: [{ trait: 'Mental Discipline', text: 'advantage against being charmed or frightened', abilities: ['wis', 'cha'] }],
	satyr: [{ trait: 'Magic Resistance', text: 'advantage against spells', abilities: ['str', 'dex', 'con', 'int', 'wis', 'cha'] }],
	'yuan-ti': [{ trait: 'Magic Resistance', text: 'advantage against spells', abilities: ['str', 'dex', 'con', 'int', 'wis', 'cha'] }],
	'yuan-ti-pureblood-vgm': [{ trait: 'Magic Resistance', text: 'advantage against spells and other magical effects', abilities: ['str', 'dex', 'con', 'int', 'wis', 'cha'] }]
};

export interface SaveCheck {
	ability: Ability;
	name: string;
	total: number;
	proficient: boolean;
	parts: StatSource[];
	/** Advantage and features that apply only sometimes; not in `total`. */
	notes: string[];
}

type SaveInput = Pick<
	Character,
	'abilities' | 'raceKey' | 'subraceKey' | 'raceAbilityChoices' | 'classKey' | 'subclassKey' | 'level' | 'items' | 'saveProficiencies'
> &
	Partial<Pick<Character, 'coins' | 'stashes' | 'encumbranceRule'>>;

/** Where proficiency in a save comes from, if anywhere: the class, a class feature or the player's pick (Resilient). */
export function saveProficiencySource(c: Pick<Character, 'classKey' | 'level' | 'saveProficiencies'>, a: Ability): string | undefined {
	const cls = CLASS_MAP.get(c.classKey);
	if (cls?.saveProficiencies.some((s) => s.toLowerCase() === a)) return cls.name;
	if (c.classKey === 'monk' && c.level >= 14) return 'Diamond Soul (Monk 14)';
	if (c.classKey === 'rogue' && c.level >= 15 && a === 'wis') return 'Slippery Mind (Rogue 15)';
	if (c.saveProficiencies?.includes(a)) return 'Your pick (Resilient, a DM ruling)';
	return undefined;
}

/**
 * Every saving throw with how it was worked out: ability modifier, proficiency, Aura of Protection and
 * item bonuses; racial, class and item advantage are notes.
 */
export function savingThrows(c: SaveInput, breakdown: AbilityBreakdown = abilityBreakdown(c)): SaveCheck[] {
	const prof = proficiencyBonus(c.level);
	const items = (c.items ?? []).filter((i) => i.ref && isActive(i));
	const race = c.raceKey ? RACE_MAP.get(c.raceKey) : undefined;
	const raceNotes = [...(RACE_SAVE_NOTES[c.raceKey ?? ''] ?? []), ...(RACE_SAVE_NOTES[`${c.raceKey}/${c.subraceKey}`] ?? [])];
	const cha = abilityMod(breakdown.scores.cha);
	const heavy = heavyLoadNote(c);

	return ABILITIES.map(({ key: a, name }) => {
		const mod = abilityMod(breakdown.scores[a]);
		const parts: StatSource[] = [{ label: `${ABILITY_SHORT[a]} modifier`, value: signedMod(mod), from: scoreDetail(c.abilities, breakdown, a) }];
		const notes: string[] = [];
		let total = mod;

		const source = saveProficiencySource(c, a);
		if (source) {
			total += prof;
			parts.push({ label: 'Proficiency', value: signedMod(prof), from: `${source} · level ${c.level} bonus` });
		}
		if (c.classKey === 'paladin' && c.level >= 6) {
			const n = Math.max(1, cha);
			total += n;
			parts.push({ label: 'Aura of Protection', value: signedMod(n), from: 'Paladin: CHA modifier (at least +1) while conscious' });
		}
		for (const i of items) {
			const bonus = ITEM_SAVE_BONUS[i.ref!];
			if (bonus) {
				total += bonus;
				parts.push({ label: i.name, value: signedMod(bonus), from: 'Magic item: all saving throws' });
			}
			if (ITEM_SAVE_NOTES[i.ref!]) notes.push(`${i.name}: ${ITEM_SAVE_NOTES[i.ref!]}`);
			if (/dragon scale mail/.test(i.ref!) && i.equipped) notes.push(`${i.name}: advantage against dragons’ Frightful Presence and breath weapons`);
		}

		for (const r of raceNotes) if (r.abilities.includes(a)) notes.push(`${r.trait} (${race?.name ?? c.raceKey}): ${r.text}`);
		if (heavy && (a === 'str' || a === 'dex' || a === 'con')) notes.push(heavy);
		if (c.classKey === 'barbarian' && a === 'str') notes.push('Raging: advantage');
		if (c.classKey === 'barbarian' && c.level >= 2 && a === 'dex') {
			notes.push('Danger Sense: advantage against effects you can see, unless blinded, deafened or incapacitated');
		}
		if ((c.classKey === 'rogue' || c.classKey === 'monk') && c.level >= 7 && a === 'dex') {
			notes.push('Evasion: no damage on a success, half on a failure, for effects that allow half');
		}
		if (c.classKey === 'monk' && c.level >= 14) notes.push('Diamond Soul: spend 1 ki point to reroll a failed save');
		if (c.classKey === 'paladin' && c.level >= 10 && (a === 'wis' || a === 'cha')) notes.push('Aura of Courage: can’t be frightened while conscious');
		if (c.classKey === 'wizard' && c.subclassKey === 'bladesinging' && c.level >= 2 && a === 'con') {
			notes.push(`Bladesong: ${signedMod(Math.max(1, abilityMod(breakdown.scores.int)))} to concentration saves while it's active`);
		}

		return { ability: a, name, total, proficient: !!source, parts, notes };
	});
}
