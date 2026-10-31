import { describe, expect, it } from 'vitest';
import { newCharacter } from '$lib/character';
import { CLASS_MAP } from '$lib/data/classes';
import featsJson from '$lib/data/feats.json';
import gearJson from '$lib/data/gear.json';
import type { GearItem } from '$lib/data/content';
import type { Character } from '$lib/types';
import { applyChoices } from './levelup';
import { armorClass, recompute } from './stats';
import { chosenEntries, giveKit, newKitChoices, rollGold, type KitChoices, type KitRow } from './starting';
import { carryState } from './carry';
import { languageList, picksMade, toolChoices, toolList, toolPickCount, toolSources, type ToolChoice } from './tools';

const pc = (over: Partial<Character>): Character => ({ ...newCharacter(), ...over });

describe('tools and languages', () => {
	it('adds up what class, subclass, race and background give, and what was picked', () => {
		const c = pc({
			classKey: 'rogue',
			subclassKey: 'assassin',
			raceKey: 'dwarf',
			background: { ref: 'soldier|phb', name: 'Soldier', skills: [], tools: ['vehicles (land)'], pickTools: [{ count: 1, from: ['gaming'] }] },
			toolProficiencies: ['dice set'],
			languages: ['Elvish']
		});
		expect(toolList(c)).toEqual(['dice set', 'disguise kit', "poisoner's kit", "thieves' tools", 'vehicles (land)']);
		expect(languageList(c)).toEqual(['Common', 'Dwarvish', 'Elvish', "Thieves' Cant"]);
		expect(toolSources(c).map((s) => s.source)).toEqual(['Dwarf', 'Rogue', 'Assassin', 'Soldier (background)']);
		expect(toolChoices(c)).toEqual([
			{ source: 'Dwarf', kind: 'tool', count: 1, from: ["smith's tools", "brewer's supplies", "mason's tools"] },
			{ source: 'Soldier (background)', kind: 'tool', count: 1, from: ['dice set', 'dragonchess set', 'playing card set', 'three-dragon ante set'] }
		]);
	});

	it('joins a race and subrace without repeating languages', () => {
		const c = pc({ raceKey: 'elf', subraceKey: 'high' });
		expect(languageList(c)).toEqual(['Common', 'Elvish']);
		expect(toolChoices(c)).toEqual([{ source: expect.any(String), kind: 'language', count: 1 }]);
		expect(toolList(pc({ raceKey: 'gnome', subraceKey: 'rock' }))).toEqual(["tinker's tools"]);
	});

	it('counts each pick towards one choice', () => {
		const human: ToolChoice = { source: 'Human', kind: 'language', count: 1 };
		const samurai: ToolChoice = { source: 'Samurai', kind: 'language', count: 1 };
		const any: ToolChoice = { source: 'Prodigy', kind: 'tool', count: 1 };
		const gaming: ToolChoice = { source: 'Soldier', kind: 'tool', count: 1, from: ['dice set'] };
		const either: ToolChoice = { source: 'Custom', kind: 'either', count: 2 };
		const one = picksMade([human, samurai], [], ['Elvish']);
		expect([one.get(human), one.get(samurai)]).toEqual([1, 0]);
		// The dice set goes to the list that needs it, even with an "any tool" listed first.
		const tools = picksMade([any, gaming], ['dice set'], []);
		expect([tools.get(any), tools.get(gaming)]).toEqual([0, 1]);
		expect(picksMade([either], ['lute'], ['Orc']).get(either)).toBe(2);
	});

	it('gives rangers a favored enemy language at 1st, 6th and 14th level', () => {
		expect([1, 6, 14].map((level) => toolPickCount(pc({ classKey: 'ranger', level })))).toEqual([1, 2, 3]);
	});

	it('knows what feats give, and only counts feats it has data for', () => {
		const feats = (featsJson as { id: string }[]).map((f) => f.id);
		for (const ref of ['artificer initiate|tce', 'chef|tce', 'fey teleportation|xge', 'linguist|phb', 'poisoner|tce', 'prodigy|xge']) expect(feats).toContain(ref);
		const c = pc({ feats: [{ id: 'a', ref: 'linguist|phb', name: 'Linguist' }, { id: 'b', name: 'Typed in' }] });
		expect(toolChoices(c)).toEqual([{ source: 'Linguist', kind: 'language', count: 3 }]);
	});

	it('only names subclasses that exist', () => {
		for (const [classKey, subclassKey] of [
			['artificer', 'alchemist'],
			['artificer', 'armorer'],
			['artificer', 'artillerist'],
			['artificer', 'battle-smith'],
			['cleric', 'forge'],
			['cleric', 'knowledge'],
			['fighter', 'battle-master'],
			['fighter', 'cavalier'],
			['fighter', 'samurai'],
			['fighter', 'rune-knight'],
			['monk', 'drunken-master'],
			['monk', 'kensei'],
			['monk', 'mercy'],
			['rogue', 'assassin'],
			['rogue', 'mastermind']
		]) {
			expect(CLASS_MAP.get(classKey)?.subclasses.map((s) => s.key)).toContain(subclassKey);
		}
	});

	it('keeps the picks a level up makes', () => {
		const c = pc({ toolProficiencies: ['lute'], languages: [] });
		applyChoices(c, { hp: 0, tools: ['lute', 'drum'], languages: ['Orc'] }, 3);
		expect(c).toMatchObject({ toolProficiencies: ['lute', 'drum'], languages: ['Orc'] });
	});

	it('counts more picks when a subclass brings them', () => {
		expect(toolPickCount(pc({ classKey: 'rogue', subclassKey: 'mastermind' }))).toBeGreaterThan(toolPickCount(pc({ classKey: 'rogue' })));
	});
});

describe('starting equipment', () => {
	const byId = new Map((gearJson as GearItem[]).map((g) => [g.id, g]));
	const fixed = (...items: KitRow['options'][number]['items']): KitRow => ({ options: [{ label: '', items }] });
	const give = (c: Character, rows: KitRow[], choices: KitChoices = newKitChoices()) => {
		giveKit(c, chosenEntries(rows, 'class', choices), choices, byId);
		return recompute(c);
	};

	it('puts armor on, readies weapons and fills the pack', () => {
		const c = give(pc({ abilities: { str: 16, dex: 12, con: 10, int: 10, wis: 10, cha: 10 } }), [
			fixed({ ref: 'chain mail|phb', quantity: 1 }, { ref: 'shield|phb', quantity: 1 }, { ref: 'longsword|phb', quantity: 1 }),
			fixed({ ref: "explorer's pack|phb", quantity: 1 }),
			fixed({ ref: 'common clothes|phb', quantity: 1 })
		]);
		expect(armorClass(c).total).toBe(18);
		expect(c.items.find((i) => i.ref === 'longsword|phb')?.equipped).toBe(true);
		const bag = c.items.find((i) => i.ref === 'backpack|phb')!;
		expect(bag.equipped).toBe(true);
		expect(c.items.find((i) => i.ref === 'common clothes|phb')?.inside).toBe(bag.id);
		expect(c.items.find((i) => i.ref === 'bedroll|phb')?.inside).toBe(bag.id);
		expect(carryState(c).carried).toBeGreaterThan(0);
	});

	it("takes the player's picks and stacks repeats", () => {
		const rows = [fixed({ pick: 'weaponSimple', quantity: 1 }, { pick: 'weaponSimple', quantity: 1 })];
		const choices = { ...newKitChoices(), picks: { 'class:0:0:0': 'dagger|phb', 'class:0:0:1': 'dagger|phb' } };
		const c = give(pc({}), rows, choices);
		expect(c.items).toHaveLength(1);
		expect(c.items[0]).toMatchObject({ ref: 'dagger|phb', quantity: 2, equipped: true });
	});

	it('takes the option chosen in a row', () => {
		const rows: KitRow[] = [{ options: [{ label: 'a', items: [{ ref: 'mace|phb', quantity: 1 }] }, { label: 'b', items: [{ ref: 'warhammer|phb', quantity: 1 }] }] }];
		expect(give(pc({}), rows).items[0].ref).toBe('mace|phb');
		expect(give(pc({}), rows, { ...newKitChoices(), options: { 'class:0': 1 } }).items[0].ref).toBe('warhammer|phb');
	});

	it("keeps coins in the background's pouch, and names things as the book does", () => {
		const c = give(pc({}), [fixed({ ref: 'pouch|phb', quantity: 1, coins: 1550 }, { name: 'Vestments', quantity: 1 }, { ref: 'book|phb', name: 'Prayer book', note: 'A prayer book', quantity: 1 })]);
		expect(c.items.find((i) => i.ref === 'pouch|phb')?.coins).toMatchObject({ gp: 15, sp: 5 });
		expect(c.coins.gp).toBe(0);
		expect(c.items.find((i) => i.name === 'Vestments')).toMatchObject({ kind: 'gear', quantity: 1 });
		expect(c.items.find((i) => i.ref === 'book|phb')).toMatchObject({ name: 'Prayer book', notes: 'A prayer book' });
	});

	it('leaves coins loose without a pouch', () => {
		expect(give(pc({}), [fixed({ quantity: 0, coins: 500 })]).coins.gp).toBe(5);
	});

	it('rolls starting gold', () => {
		expect(rollGold({ count: 5, sides: 4, times: 10 }, () => 0)).toBe(50);
		expect(rollGold({ count: 5, sides: 4, times: 10 }, () => 0.99)).toBe(200);
		expect(rollGold({ count: 5, sides: 4, times: 1 }, () => 0.5)).toBe(15);
	});
});
