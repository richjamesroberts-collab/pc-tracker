import { describe, expect, it } from 'vitest';
import { newCharacter } from '$lib/character';
import spells from '$lib/data/spells.json';
import type { Character, ClassOption } from '$lib/types';
import { spellNotes } from './spellnotes';
import { grantCasting, grantedSpells } from './grants';

const scores = { str: 10, dex: 14, con: 14, int: 18, wis: 16, cha: 18 };
function pc(overrides: Partial<Character> = {}): Character {
	return { ...newCharacter(), abilities: scores, ...overrides };
}
const spell = (id: string) => spells.find((s) => s.id === id)!;
const invocation = (name: string, source = 'phb'): ClassOption => ({ ref: `${name.toLowerCase()}|${source}`, name, kind: 'invocation' });

describe('spell notes', () => {
	it('counts eldritch blast beams and adds invocations', () => {
		const c = pc({ classKey: 'warlock', level: 5, classOptions: [invocation('Agonizing Blast'), invocation('Repelling Blast')] });
		expect(spellNotes(c, spell('eldritch blast|phb'))).toEqual([
			'2 beams, each its own attack',
			'Agonizing Blast: +4 damage per beam',
			'Repelling Blast: push up to 10 feet per beam that hits'
		]);
	});

	it('adds Potent Spellcasting to damaging cleric cantrips from 8th level', () => {
		const light = pc({ classKey: 'cleric', subclassKey: 'light', level: 8 });
		expect(spellNotes(light, spell('sacred flame|phb'))).toEqual(['Potent Spellcasting: +3 damage']);
		expect(spellNotes(light, spell('guidance|phb'))).toEqual([]);
		expect(spellNotes({ ...light, level: 7 }, spell('sacred flame|phb'))).toEqual([]);
		expect(spellNotes({ ...light, subclassKey: 'war' }, spell('sacred flame|phb'))).toEqual([]);
	});

	it('adds evocation wizard features to evocation spells', () => {
		const c = pc({ classKey: 'wizard', subclassKey: 'evocation', level: 10 });
		expect(spellNotes(c, spell('fireball|phb'))).toEqual(['Empowered Evocation: +4 to one damage roll']);
		expect(spellNotes(c, spell('acid splash|phb'))).toEqual([]);
		expect(spellNotes(c, spell('ray of frost|phb'))).toEqual(['Empowered Evocation: +4 to one damage roll']);
		expect(spellNotes(c, spell('magic missile|phb'))).toEqual(['Empowered Evocation: +4 to one damage roll']);
	});

	it('adds Disciple of Life to healing spells', () => {
		const c = pc({ classKey: 'cleric', subclassKey: 'life', level: 1 });
		expect(spellNotes(c, spell('cure wounds|phb'))).toEqual(["Disciple of Life: +3 hit points (+2 + the slot's level)"]);
		expect(spellNotes(c, spell('bless|phb'))).toEqual([]);
	});

	it('adds Radiant Soul to radiant and fire spells', () => {
		const c = pc({ classKey: 'warlock', subclassKey: 'celestial', level: 6 });
		expect(spellNotes(c, spell('guiding bolt|phb'))).toEqual(['Radiant Soul: +4 to one radiant or fire damage roll against one target']);
		expect(spellNotes(c, spell('hex|phb'))).toEqual([]);
	});

	it('adds Spell Sniper to spell attacks', () => {
		const c = pc({ classKey: 'sorcerer', level: 4, feats: [{ id: 'f', ref: 'spell sniper|phb', name: 'Spell Sniper' }] });
		expect(spellNotes(c, spell('fire bolt|phb'))).toEqual(['Spell Sniper: double range; ignores half and three-quarters cover']);
	});
});

describe('granted spell casting ability', () => {
	const casting = (c: Character, id: string) => grantCasting(c, grantedSpells(c).find((g) => g.id === id)!);

	it('uses Charisma for a tiefling fighter’s racial spells', () => {
		// CHA 18 + 2 from the race: +5, with a +3 proficiency bonus.
		const c = pc({ classKey: 'fighter', raceKey: 'tiefling', level: 5 });
		expect(casting(c, 'hellish rebuke|phb')).toEqual({ ability: 'cha', name: 'Charisma', attack: 8, dc: 16 });
	});

	it('uses Wisdom for a Shadow monk’s ki spells', () => {
		expect(casting(pc({ classKey: 'monk', subclassKey: 'shadow', level: 5 }), 'darkness|phb')).toMatchObject({ ability: 'wis', dc: 14 });
	});

	it('uses the ability a feat raised, and the best one a MPMM race offers', () => {
		const fey = { id: 'f', ref: 'fey touched|tce', name: 'Fey Touched', abilities: ['wis' as const] };
		expect(casting(pc({ classKey: 'fighter', level: 4, feats: [fey] }), 'misty step|phb')?.ability).toBe('wis');
		const githyanki = pc({ classKey: 'fighter', raceKey: 'githyanki', level: 5, abilities: { ...scores, int: 8, wis: 18, cha: 12 } });
		expect(casting(githyanki, 'misty step|phb')?.ability).toBe('wis');
		// Intelligence is a fighter's own spellcasting ability, so nothing changes.
		expect(casting({ ...githyanki, abilities: { ...scores, int: 18, wis: 8 } }, 'misty step|phb')).toBeNull();
	});

	it('leaves class spells to the class’s ability', () => {
		expect(casting(pc({ classKey: 'cleric', subclassKey: 'life', level: 1 }), 'bless|phb')).toBeNull();
		const warlock = pc({ classKey: 'warlock', level: 2, classOptions: [invocation('Armor of Shadows')] });
		expect(casting(warlock, 'mage armor|phb')).toBeNull();
	});
});
