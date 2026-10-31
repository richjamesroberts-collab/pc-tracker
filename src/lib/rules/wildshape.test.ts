import { describe, expect, it } from 'vitest';
import { newCharacter } from '$lib/character';
import beastsJson from '$lib/data/beasts.json';
import type { Beast, Character } from '$lib/types';
import { longRest } from './resources';
import { resourceLeft, resourcesFor } from './features';
import { savingThrows } from './saves';
import { applyHealing } from './hp';
import {
	asShape,
	beastLimit,
	canBecome,
	damageShape,
	revert,
	shapeAttacks,
	shapeCost,
	shapeDefenses,
	shapeHours,
	shapeInitiative,
	shapePassive,
	shapeSaveInput,
	shapeStats,
	transform
} from './wildshape';

const beasts = beastsJson as Beast[];
const beast = (name: string) => beasts.find((b) => b.name === name)!;
const druid = (over: Partial<Character> = {}): Character => ({
	...newCharacter(),
	classKey: 'druid',
	level: 2,
	hpBase: 20,
	hpMax: 20,
	hpCurrent: 20,
	abilities: { str: 8, dex: 12, con: 12, int: 10, wis: 16, cha: 10 },
	...over
});
const uses = (c: Character) => resourceLeft(c, resourcesFor(c).find((r) => r.key === 'wild-shape')!);

describe('which forms a druid can take', () => {
	const can = (level: number, name: string, subclassKey?: string) => canBecome({ classKey: 'druid', level, subclassKey }, beast(name));

	it('follows the Beast Shapes table', () => {
		expect(can(2, 'Wolf')).toBe(true); // CR 1/4
		expect(can(2, 'Black Bear')).toBe(false); // CR 1/2
		expect(can(2, 'Giant Crab')).toBe(false); // CR 1/8, but swims
		expect(can(2, 'Owl')).toBe(false); // flies
		expect(can(4, 'Crocodile')).toBe(true); // CR 1/2, swims
		expect(can(4, 'Owl')).toBe(false);
		expect(can(8, 'Giant Eagle')).toBe(true); // CR 1, flies
		expect(can(8, 'Polar Bear')).toBe(false); // CR 2
	});

	it('gives Circle of the Moon its own CR, keeping the movement limits', () => {
		expect(beastLimit({ classKey: 'druid', subclassKey: 'moon', level: 2 })).toEqual({ maxCr: 1, fly: false, swim: false });
		expect(can(2, 'Brown Bear', 'moon')).toBe(true);
		expect(can(2, 'Giant Eagle', 'moon')).toBe(false);
		expect(beastLimit({ classKey: 'druid', subclassKey: 'moon', level: 9 }).maxCr).toBe(3);
		expect(can(6, 'Polar Bear', 'moon')).toBe(true);
	});

	it('offers elementals to Circle of the Moon from 10th level, for two uses', () => {
		expect(can(9, 'Fire Elemental', 'moon')).toBe(false);
		expect(can(10, 'Fire Elemental', 'moon')).toBe(true);
		expect(can(10, 'Fire Elemental')).toBe(false);
		expect(shapeCost({ classKey: 'druid', level: 10 }, beast('Fire Elemental'))).toBe(2);
		expect(shapeCost({ classKey: 'druid', level: 20 }, beast('Fire Elemental'))).toBe(0);
	});

	it('lasts half the druid level, and the counter stays at 20th for Archdruid', () => {
		expect(shapeHours({ classKey: 'druid', level: 5 })).toBe(2);
		expect(uses(druid({ level: 20 }))).toBe(2);
		const c = druid({ level: 20 });
		transform(c, beast('Wolf'));
		expect(uses(c)).toBe(2);
	});
});

describe('being in a form', () => {
	const inForm = (name = 'Wolf', over: Partial<Character> = {}) => {
		const c = druid(over);
		transform(c, beast(name));
		return c;
	};

	it('spends a use and keeps the character\'s hit points waiting', () => {
		const c = inForm('Wolf', { hpCurrent: 7 });
		expect(uses(c)).toBe(1);
		expect(c.wildShape?.hp).toBe(11);
		expect(c.hpCurrent).toBe(7);
		revert(c);
		expect(c.wildShape).toBeUndefined();
		expect(c.hpCurrent).toBe(7);
	});

	it('refuses without enough uses', () => {
		const c = druid({ level: 10, subclassKey: 'moon', resourcesUsed: { 'wild-shape': 1 } });
		expect(transform(c, beast('Fire Elemental'))).toBe(false);
		expect(c.wildShape).toBeUndefined();
	});

	it('takes damage on the form, temp HP first', () => {
		const c = inForm('Wolf', { tempHp: 3 });
		expect(damageShape(c, 5)).toMatchObject({ absorbed: 3, reverted: false });
		expect(c.wildShape?.hp).toBe(9);
		expect(c.tempHp).toBe(0);
		expect(c.hpCurrent).toBe(20);
	});

	it('reverts at 0 hit points, the excess carrying over', () => {
		const c = inForm();
		expect(damageShape(c, 14)).toMatchObject({ reverted: true, overflow: 3, droppedToZero: false });
		expect(c.wildShape).toBeUndefined();
		expect(c.hpCurrent).toBe(17);
	});

	it('reverts with nothing over at exactly 0, and can drop the character too', () => {
		const exact = inForm();
		expect(damageShape(exact, 11)).toMatchObject({ reverted: true, overflow: 0 });
		expect(exact.hpCurrent).toBe(20);
		const down = inForm('Wolf', { hpCurrent: 2 });
		expect(damageShape(down, 15)).toMatchObject({ reverted: true, overflow: 4, droppedToZero: true });
		expect(down.hpCurrent).toBe(0);
	});

	it('keeps concentration, asking for a save', () => {
		const c = inForm('Wolf', { concentration: 'Entangle' });
		expect(damageShape(c, 4).concentrationDC).toBe(10);
		expect(c.concentration).toBe('Entangle');
	});

	it('heals the form up to its own maximum, leaving the character alone', () => {
		const c = inForm('Wolf', { hpCurrent: 5 });
		damageShape(c, 6);
		asShape(c, () => applyHealing(c, 2));
		expect(c.wildShape?.hp).toBe(7);
		asShape(c, () => applyHealing(c, 50));
		expect(c.wildShape?.hp).toBe(11);
		expect(c).toMatchObject({ hpCurrent: 5, hpMax: 20 });
	});

	it('uses the beast\'s physical scores with the character\'s mind and proficiencies', () => {
		const c = inForm('Brown Bear');
		const { input, breakdown } = shapeSaveInput(c, beast('Brown Bear'));
		const save = (a: string) => savingThrows(input, breakdown).find((s) => s.ability === a)!;
		expect(save('str').total).toBe(4); // STR 19
		expect(save('wis').total).toBe(5); // WIS 16, druid proficiency
		expect(save('int').total).toBe(2); // proficient
		expect(shapeInitiative(c, beast('Brown Bear'))).toBe(0);
	});

	it('takes the higher passive Perception', () => {
		const dull = druid({ abilities: { str: 8, dex: 12, con: 12, int: 10, wis: 8, cha: 10 } });
		transform(dull, beast('Wolf'));
		expect(shapePassive(dull, beast('Wolf')).total).toBe(13);
		expect(shapePassive(inForm(), beast('Wolf')).total).toBe(13);
		const sharp = druid({ skillProficiencies: ['perception'] });
		expect(shapePassive(sharp, beast('Wolf')).total).toBe(15);
	});

	it('lists the stat block\'s attacks, speeds and senses', () => {
		const bear = beast('Brown Bear');
		expect(shapeAttacks(druid(), bear).map((a) => [a.name, a.toHit, a.damage])).toEqual([
			['Bite', 6, '1d8 + 4 piercing'],
			['Claws', 6, '2d6 + 4 slashing']
		]);
		expect(shapeStats(druid(), bear).slice(0, 2)).toEqual([{ k: 'Speed', v: '40 ft' }, { k: 'Climb', v: '30 ft' }]);
		expect(shapeStats(druid({ raceKey: 'elf' }), beast('Fire Elemental')).filter((s) => s.k === 'Darkvision')).toEqual([{ k: 'Darkvision', v: '60 ft' }]);
		expect(shapeAttacks(druid({ subclassKey: 'moon', level: 6 }), bear)[0].notes).toContain('Primal Strike: counts as magical');
	});

	it('adds the stat block\'s defenses', () => {
		const d = shapeDefenses(druid(), beast('Fire Elemental'));
		expect(d.immunities.map((x) => x.name)).toEqual(expect.arrayContaining(['fire', 'poison', 'grappled']));
	});

	it('ends on a long rest', () => {
		const c = inForm('Wolf', { hpCurrent: 5 });
		longRest(c);
		expect(c.wildShape).toBeUndefined();
		expect(c.hpCurrent).toBe(c.hpMax);
	});
});
