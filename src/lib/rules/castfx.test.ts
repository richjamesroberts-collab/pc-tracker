import { describe, expect, it } from 'vitest';
import { newCharacter } from '$lib/character';
import { castSpent, spellFx } from './castfx';
import { spendPactSlot, spendSlot, spendSorceryPoints } from './resources';
import { spendResource } from './features';
import type { Character } from '$lib/types';

const char = (overrides: Partial<Character> = {}): Character => ({ ...newCharacter(), name: 'Lyra', classKey: 'sorcerer', level: 7, ...overrides });

describe('castSpent', () => {
	it('names the slot and sorcery points a cast used', () => {
		const before = char();
		const after = structuredClone(before);
		spendSlot(after, 2);
		spendSorceryPoints(after, 2);
		expect(castSpent(before, after)).toEqual([
			{ key: 'slot-2', label: '2nd-level slot', tag: '2nd slot', shape: 'circle', max: 3, before: 3, after: 2 },
			{ key: 'sorcery', label: 'Sorcery points', tag: '2 SP', shape: 'diamond', max: 7, before: 7, after: 5 }
		]);
	});

	it('shows a pact slot and Mystic Arcanum', () => {
		const before = char({ classKey: 'warlock', level: 11 });
		const pact = structuredClone(before);
		spendPactSlot(pact);
		expect(castSpent(before, pact)).toMatchObject([{ key: 'pact', label: 'Pact slot (5th)', max: 3, before: 3, after: 2 }]);
		const arcanum = structuredClone(before);
		arcanum.arcanumUsed = [6];
		expect(castSpent(before, arcanum)).toMatchObject([{ key: 'arcanum-6', tag: 'Arcanum', before: 1, after: 0 }]);
	});

	it('counts ki and other counters', () => {
		const before = char({ classKey: 'monk', subclassKey: 'shadow', level: 6 });
		const after = structuredClone(before);
		spendResource(after, 'ki', 2);
		expect(castSpent(before, after)).toMatchObject([{ key: 'ki', tag: '2 ki', shape: 'circle', before: 6, after: 4 }]);
	});

	it('is empty when nothing was spent', () => {
		const c = char();
		expect(castSpent(c, structuredClone(c))).toEqual([]);
	});
});

describe('spellFx', () => {
	const spell = (name: string, school: string, text = '') => ({ name, school, text });
	it('goes by name, then damage, then healing, then school', () => {
		expect(spellFx(spell('Fire Bolt', 'Evocation'))).toBe('fire');
		expect(spellFx(spell('Revivify', 'Necromancy'))).toBe('heal');
		expect(spellFx(spell('Blade Ward', 'Abjuration', 'resistance against slashing damage'))).toBe('force');
		expect(spellFx(spell('Chill Touch', 'Necromancy', 'takes 1d8 necrotic damage'))).toBe('necrotic');
		expect(spellFx(spell('Vampiric Touch', 'Necromancy', 'take 3d6 necrotic damage, and you regain hit points'))).toBe('necrotic');
		expect(spellFx(spell('Mass Healing Word', 'Evocation', 'regains hit points equal to 1d4'))).toBe('heal');
		expect(spellFx(spell('Misty Step', 'Conjuration', 'you teleport up to 30 feet'))).toBe('summon');
		expect(spellFx(spell('Hold Person', 'Enchantment', 'must succeed on a Wisdom saving throw'))).toBe('arcane');
	});
});
