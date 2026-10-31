import { describe, expect, it } from 'vitest';
import { newCharacter } from '$lib/character';
import featsJson from '$lib/data/feats.json';
import optionsJson from '$lib/data/options.json';
import { RACE_MAP } from '$lib/data/races';
import type { ClassOptionData, FeatData } from '$lib/data/content';
import type { AbilityScores, Character } from '$lib/types';
import { meetsFeat, meetsOptionSpells } from './prereqs';
import { armorProficiencies } from './proficiency';

const pc = (over: Partial<Character>): Character => ({ ...newCharacter(), ...over });
const feats = featsJson as FeatData[];
const feat = (id: string) => feats.find((f) => f.id === id)!;
const scores = (over: Partial<AbilityScores> = {}): AbilityScores => ({ str: 10, dex: 10, con: 10, int: 10, wis: 10, cha: 10, ...over });
const can = (id: string, c: Partial<Character>, s = scores(), canCast = false) => meetsFeat(feat(id), pc(c), s, canCast);

describe('feat prerequisites', () => {
	it('has a check for every prerequisite the player reads', () => {
		for (const f of feats) expect(!!f.requires, f.name).toBe(!!f.prerequisite);
	});

	it('only names races that exist', () => {
		const names = new Set(feats.flatMap((f) => f.requires?.race ?? []).map((r) => r.name));
		names.delete('small race');
		for (const name of names) expect(RACE_MAP.has(name), name).toBe(true);
	});

	it('checks race and subrace', () => {
		expect(can('elven accuracy|xge', { raceKey: 'elf' })).toBe(true);
		expect(can('elven accuracy|xge', { raceKey: 'half-elf' })).toBe(true);
		expect(can('elven accuracy|xge', { raceKey: 'human' })).toBe(false);
		expect(can('fey teleportation|xge', { raceKey: 'elf', subraceKey: 'high' })).toBe(true);
		expect(can('fey teleportation|xge', { raceKey: 'elf', subraceKey: 'wood' })).toBe(false);
		expect(can('dwarven fortitude|xge', { raceKey: 'duergar' })).toBe(true);
		expect(can('squat nimbleness|xge', { raceKey: 'halfling' })).toBe(true);
		expect(can('squat nimbleness|xge', { raceKey: 'human' })).toBe(false);
	});

	it('checks ability scores, either of two where the feat says so', () => {
		expect(can('grappler|phb', {}, scores({ str: 13 }))).toBe(true);
		expect(can('grappler|phb', {}, scores({ str: 12 }))).toBe(false);
		expect(can('ritual caster|phb', {}, scores({ wis: 13 }))).toBe(true);
		expect(can('ritual caster|phb', {}, scores())).toBe(false);
	});

	it('checks armor and weapon proficiency', () => {
		expect(can('heavy armor master|phb', { classKey: 'fighter' })).toBe(true);
		expect(can('heavy armor master|phb', { classKey: 'rogue' })).toBe(false);
		expect(can('heavy armor master|phb', { classKey: 'cleric', subclassKey: 'life' })).toBe(true);
		expect(can('medium armor master|phb', { classKey: 'wizard', raceKey: 'dwarf', subraceKey: 'mountain' })).toBe(true);
		expect(can('fighting initiate|tce', { classKey: 'wizard' })).toBe(false);
		expect(can('fighting initiate|tce', { classKey: 'fighter' })).toBe(true);
		expect(can('heavily armored|phb', { classKey: 'rogue', feats: [{ id: 'a', ref: 'moderately armored|phb', name: 'Moderately Armored' }] })).toBe(true);
	});

	it('checks spellcasting', () => {
		expect(can('war caster|phb', { classKey: 'fighter' })).toBe(false);
		expect(can('war caster|phb', { classKey: 'wizard' }, scores(), true)).toBe(true);
	});

	it('has armor proficiencies for feats it names', () => {
		for (const ref of ['heavily armored|phb', 'lightly armored|phb', 'moderately armored|phb']) expect(feat(ref)).toBeDefined();
		expect([...armorProficiencies(pc({ classKey: 'wizard' }))]).toEqual([]);
	});
});

describe('invocation spells', () => {
	const options = optionsJson as ClassOptionData[];
	const option = (id: string) => options.find((o) => o.id === id)!;

	it('needs the spell it names', () => {
		const agonizing = option('agonizing blast|phb');
		expect(meetsOptionSpells(agonizing, pc({}), new Set())).toBe(false);
		expect(meetsOptionSpells(agonizing, pc({}), new Set(['eldritch blast|phb']))).toBe(true);
		expect(meetsOptionSpells(option('armor of shadows|phb'), pc({}), new Set())).toBe(true);
	});

	it('takes Hex or a Hexblade for the ones that curse', () => {
		const hex = option('maddening hex|xge');
		expect(meetsOptionSpells(hex, pc({}), new Set())).toBe(false);
		expect(meetsOptionSpells(hex, pc({}), new Set(['hex|phb']))).toBe(true);
		expect(meetsOptionSpells(hex, pc({ subclassKey: 'hexblade' }), new Set())).toBe(true);
	});
});
