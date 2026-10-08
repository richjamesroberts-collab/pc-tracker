import { describe, expect, it } from 'vitest';
import { newCharacter } from '$lib/character';
import { recompute } from '$lib/rules/stats';
import { APP_ID, BackupError, decodeRestoreCode, encodeRestoreCode, parseBackupText, readBackup, toBackup } from './backup';

const spell = (id: string, name: string) => ({
	id,
	name,
	source: 'PHB',
	level: 0,
	school: 'Necromancy',
	time: '1 action',
	range: '60 ft',
	components: 'V, S',
	duration: 'Instantaneous',
	concentration: false,
	ritual: false,
	classes: ['wizard'],
	text: 'A bell tolls.'
});

const lyra = () =>
	recompute({
		...newCharacter(),
		name: 'Lyra Ashwood',
		classKey: 'sorcerer',
		level: 7,
		hpBase: 52,
		hpCurrent: 38,
		image: 'data:image/webp;base64,AAAA',
		slotsUsed: { 1: 2 },
		spells: [{ id: 'fireball|phb', prepared: true }]
	});

describe('backup files', () => {
	it('round-trips a character', () => {
		const c = lyra();
		expect(parseBackupText(JSON.stringify(toBackup(c)))).toEqual(c);
	});

	it('keeps granted spell picks, swaps and variant lists', () => {
		const c = {
			...lyra(),
			subclassKey: 'aberrant-mind',
			spells: [
				{ id: 'charm person|phb', prepared: true, grant: 'sorcerer/aberrant-mind#0', replaces: 'arms of hadar|phb' },
				{ id: 'fireball|phb', prepared: true }
			],
			grantVariants: { 'druid/land': 'Arctic' }
		};
		const back = parseBackupText(JSON.stringify(toBackup(c)));
		expect(back.spells).toEqual(c.spells);
		expect(back.grantVariants).toEqual({ 'druid/land': 'Arctic' });
		expect(parseBackupText(JSON.stringify(toBackup(lyra()))).grantVariants).toBeUndefined();
	});

	it('keeps saved copies of pack spells', () => {
		const c = { ...lyra(), spellCache: [{ ...spell('toll the dead|xge', 'Toll the Dead'), source: 'XGE' }] };
		const back = parseBackupText(JSON.stringify(toBackup(c)));
		expect(back.spellCache[0].source).toBe('XGE');
		expect(back.spellCache[0].name).toBe('Toll the Dead');
	});

	it('keeps inventory items and cleans bad ones', () => {
		const wand = {
			id: 'w1',
			kind: 'magic' as const,
			ref: 'wand of magic missiles|dmg',
			name: 'Wand of Magic Missiles',
			type: 'Wand',
			rarity: 'uncommon',
			attunement: false,
			attuned: false,
			quantity: 1,
			charges: { max: 7, used: 3, regain: '1d6 + 1' },
			use: { times: ['action' as const] },
			notes: ''
		};
		const mail = {
			...wand,
			id: 'a1',
			ref: '+1 armor|dmg',
			name: '+1 Chain Mail',
			type: 'Armor (any)',
			rarity: 'rare',
			armor: { type: 'heavy' as const, ac: 16, base: 'chain mail' },
			equipped: true,
			effects: { ac: 1 },
			charges: undefined,
			use: undefined
		};
		delete mail.charges;
		delete mail.use;
		const c = { ...lyra(), items: [wand, mail] };
		expect(parseBackupText(JSON.stringify(toBackup(c))).items).toEqual([wand, mail]);

		const raw = { ...toBackup(lyra()) };
		const bad = [{ id: 'x', name: '' }, { id: 'y', name: 'Ring', attuned: true, quantity: -2, charges: { max: 3, used: 9 }, use: { times: ['zap', 'bonus'], consumed: 'yes' } }];
		const back = readBackup({ ...raw, character: { ...raw.character, items: bad } });
		expect(back.items).toHaveLength(1);
		expect(back.items[0]).toMatchObject({ kind: 'magic', attuned: false, quantity: 1, charges: { max: 3, used: 3 }, use: { times: ['bonus'] }, type: '', notes: '' });
	});

	it('keeps what older backups showed: typed AC, max HP, spellcasting modifier and initiative', () => {
		const legacy = { id: 'old', name: 'Old', classKey: 'cleric', level: 5, ac: 18, hpMax: 38, hpCurrent: 30, spellMod: 4, initiativeModifier: 1 };
		const c = readBackup({ app: '5e-pc-tracker', schemaVersion: 1, character: legacy });
		expect(c).toMatchObject({ acAuto: false, acBase: 18, ac: 18, hpBase: 38, hpMax: 38, hpCurrent: 30, spellModOverride: 4, spellMod: 4 });
		expect(c).toMatchObject({ initiativeOverride: 1, initiativeModifier: 1 });
	});

	it('works numbers out again on import rather than trusting the file', () => {
		const c = { ...lyra(), abilities: { str: 10, dex: 14, con: 10, int: 10, wis: 10, cha: 18 }, ac: 99, spellMod: 0 };
		const back = parseBackupText(JSON.stringify(toBackup(c)));
		expect(back.ac).toBe(12);
		expect(back.spellMod).toBe(4);
		expect(back.initiativeModifier).toBe(2);
	});

	it('keeps ability scores and clamps bad ones', () => {
		const c = { ...lyra(), abilities: { str: 8, dex: 14, con: 13, int: 12, wis: 10, cha: 18 } };
		expect(parseBackupText(JSON.stringify(toBackup(c))).abilities).toEqual(c.abilities);
		const raw = toBackup(lyra());
		const odd = readBackup({ ...raw, character: { ...raw.character, abilities: { str: 0, dex: 40, con: 'x', cha: 15.4 } } });
		expect(odd.abilities).toEqual({ str: 1, dex: 30, con: 10, int: 10, wis: 10, cha: 15 });
	});

	it('keeps coins and gear, and cleans bad coin counts', () => {
		const torch = { id: 't', kind: 'gear' as const, ref: 'torch|phb', name: 'Torch', type: 'Adventuring gear', rarity: '', attunement: false, attuned: false, quantity: 10, weight: 1, notes: '' };
		const c = { ...lyra(), items: [torch], coins: { cp: 3, sp: 0, ep: 0, gp: 42, pp: 1 } };
		const back = parseBackupText(JSON.stringify(toBackup(c)));
		expect(back.items).toEqual([torch]);
		expect(back.coins).toEqual(c.coins);

		const raw = toBackup(lyra());
		const odd = readBackup({ ...raw, character: { ...raw.character, coins: { gp: -4, sp: 2.7, pp: 'lots' } } });
		expect(odd.coins).toEqual({ cp: 0, sp: 2, ep: 0, gp: 0, pp: 0 });
	});

	it('rejects files from other apps and newer versions', () => {
		expect(() => parseBackupText('{"foo":1}')).toThrow(BackupError);
		expect(() => parseBackupText('not json')).toThrow(BackupError);
		expect(() => readBackup({ ...toBackup(lyra()), schemaVersion: 99 })).toThrow(/newer version/);
	});

	it('fills in fields missing from older files and clamps bad values', () => {
		const { character } = toBackup(lyra());
		const partial = { id: character.id, name: 'Lyra', classKey: 'sorcerer', hpMax: 20, hpCurrent: 99, level: 40 };
		const c = readBackup({ app: '5e-pc-tracker', schemaVersion: 1, character: partial });
		expect(c.hpCurrent).toBe(20);
		expect(c.level).toBe(20);
		expect(c.spells).toEqual([]);
		expect(c.items).toEqual([]);
		expect(c.coins).toEqual({ cp: 0, sp: 0, ep: 0, gp: 0, pp: 0 });
		expect(c.abilities).toEqual({ str: 10, dex: 10, con: 10, int: 10, wis: 10, cha: 10 });
		expect(c.deathSaves).toEqual({ successes: 0, failures: 0 });
	});
});

describe('restore codes', () => {
	it('round-trips without the portrait', async () => {
		const c = lyra();
		const code = await encodeRestoreCode(c);
		expect(code).toMatch(/^[A-Za-z0-9_-]+$/);
		const { image: _image, ...rest } = c;
		expect(await decodeRestoreCode(code)).toEqual({ ...rest, image: undefined, spellCache: [] });
	});

	it('rejects damaged codes', async () => {
		await expect(decodeRestoreCode('abc')).rejects.toThrow(BackupError);
	});
});

describe('race and resource fields', () => {
	it('fills new fields when importing an old backup', () => {
		const c = readBackup({ app: APP_ID, schemaVersion: 1, character: { id: 'a', name: 'Old', classKey: 'fighter' } });
		expect(c.resourcesUsed).toEqual({});
		expect(c.customResources).toEqual([]);
		expect(c.raceKey).toBeUndefined();
		expect(c.hitDiceUsed).toBe(0);
	});

	it('keeps spent hit dice, up to the level', () => {
		const read = (hitDiceUsed: unknown) =>
			readBackup({ app: APP_ID, schemaVersion: 1, character: { id: 'a', name: 'X', classKey: 'fighter', level: 3, hitDiceUsed } })
				.hitDiceUsed;
		expect([read(2), read(9), read(-1), read('x')]).toEqual([2, 3, 0, 0]);
	});

	it('keeps race, counters and custom counters, dropping junk', () => {
		const c = readBackup({
			app: APP_ID,
			schemaVersion: 1,
			character: {
				id: 'a',
				name: 'X',
				classKey: 'barbarian',
				raceKey: 'half-orc',
				subraceKey: 5,
				resourcesUsed: { rage: 2, bad: 'x' },
				customResources: [
					{ id: 'c1', name: 'Luck', max: 3, reset: 'long', used: 1 },
					{ id: 'c3', name: 'Wish', max: 1, reset: 'none', used: 1 },
					{ name: 'no id' },
					{ id: 'c2', name: 'Bad', max: 2, reset: 'weekly', used: 0 }
				]
			}
		});
		expect(c.raceKey).toBe('half-orc');
		expect(c.subraceKey).toBeUndefined();
		expect(c.resourcesUsed).toEqual({ rage: 2 });
		expect(c.customResources).toEqual([
			{ id: 'c1', name: 'Luck', max: 3, reset: 'long', used: 1 },
			{ id: 'c3', name: 'Wish', max: 1, reset: 'none', used: 1 }
		]);
	});

	it('restore links carry race and counters', async () => {
		const c = { ...newCharacter(), name: 'R', raceKey: 'elf', subraceKey: 'drow', resourcesUsed: { 'faerie-fire': 1 } };
		const back = await decodeRestoreCode(await encodeRestoreCode(c));
		expect([back.raceKey, back.subraceKey, back.resourcesUsed]).toEqual(['elf', 'drow', { 'faerie-fire': 1 }]);
	});
});

describe('experience, proficiencies, senses and weapons', () => {
	it('fills new fields when importing an old backup', () => {
		const c = readBackup({ app: APP_ID, schemaVersion: 1, character: { id: 'a', name: 'Old', classKey: 'fighter' } });
		expect(c).toMatchObject({ xp: 0, milestone: false, weaponProficiencies: [], fightingStyles: [], senses: [], skillProficiencies: [], skillExpertise: [], saveProficiencies: [], defenses: [] });
	});

	it('keeps them, dropping junk', () => {
		const c = readBackup({
			app: APP_ID,
			schemaVersion: 1,
			character: {
				id: 'a',
				name: 'X',
				classKey: 'fighter',
				xp: 6500.7,
				milestone: 'yes',
				weaponProficiencies: ['whip', 3, 'whip'],
				fightingStyles: ['defense'],
				senses: [{ id: 's', name: 'Darkvision', range: 60 }, { name: '', range: 10 }, { name: 'Tremorsense', range: -5 }],
				defenses: [
					{ id: 'd', kind: 'resistance', name: ' Cold ', source: 'Infernal Constitution' },
					{ id: 'e', kind: 'immunity', name: 'charmed', source: '' },
					{ kind: 'weakness', name: 'fire' },
					{ kind: 'immunity', name: '  ' }
				],
				items: [
					{
						id: 'i',
						kind: 'gear',
						name: 'Longsword',
						equipped: true,
						weapon: { base: 'longsword', category: 'martial', damage: '1d8', damageType: 'slashing', properties: ['versatile', 'bogus'], versatile: '1d10' },
						effects: { attack: 1, damage: 1 }
					},
					{ id: 'r', name: 'Ring of Cold Resistance', attunement: true, attuned: true, effects: { resist: ['cold', 4], immune: [] } },
					{ id: 'j', name: 'Stick', weapon: { base: 'stick', category: 'exotic' }, equipped: true }
				]
			}
		});
		expect(c).toMatchObject({ xp: 6500, milestone: false, weaponProficiencies: ['whip'], fightingStyles: ['defense'] });
		expect(c.senses).toEqual([{ id: 's', name: 'Darkvision', range: 60 }]);
		expect(c.defenses).toEqual([
			{ id: 'd', kind: 'resistance', name: 'cold', source: 'Infernal Constitution' },
			{ id: 'e', kind: 'immunity', name: 'charmed' }
		]);
		expect(c.items[1].effects).toEqual({ resist: ['cold'] });
		expect(c.items[0]).toMatchObject({
			equipped: true,
			weapon: { base: 'longsword', ranged: false, properties: ['versatile'], versatile: '1d10' },
			effects: { attack: 1, damage: 1 }
		});
		expect(c.items[2].weapon).toBeUndefined();
		expect(c.items[2].equipped).toBeUndefined();
	});
});

describe('feats and class options', () => {
	it('fills them in when importing an old backup', () => {
		const c = readBackup({ app: APP_ID, schemaVersion: 1, character: { id: 'a', name: 'Old', classKey: 'warlock' } });
		expect(c).toMatchObject({ feats: [], classOptions: [] });
	});

	it('keeps them, dropping junk', () => {
		const c = readBackup({
			app: APP_ID,
			schemaVersion: 1,
			character: {
				id: 'a',
				name: 'X',
				classKey: 'warlock',
				feats: [
					{ id: 'f', ref: 'tough|phb', name: 'Tough', level: 4, hpPerLevel: 2 },
					{ id: 'g', ref: 'resilient|phb', name: ' Resilient ', abilities: ['con', 'luck'] },
					{ name: '' },
					'Alert'
				],
				classOptions: [
					{ ref: 'agonizing blast|phb', name: 'Agonizing Blast', kind: 'invocation' },
					{ ref: 'agonizing blast|phb', name: 'Agonizing Blast', kind: 'invocation' },
					{ ref: 'pact of the blade|phb', name: 'Pact of the Blade', kind: 'pact-boon' },
					{ ref: 'x', name: 'X', kind: 'spell' }
				]
			}
		});
		expect(c.feats).toEqual([
			{ id: 'f', ref: 'tough|phb', name: 'Tough', level: 4, hpPerLevel: 2 },
			{ id: 'g', ref: 'resilient|phb', name: 'Resilient', abilities: ['con'] }
		]);
		expect(c.classOptions.map((o) => o.name)).toEqual(['Agonizing Blast', 'Pact of the Blade']);
	});
});

describe('containers and stashes', () => {
	const thing = (id: string, extra: object = {}) => ({ id, kind: 'gear', name: id, type: '', rarity: '', quantity: 1, notes: '', ...extra });

	it('fills them in when importing an old backup', () => {
		const c = readBackup({ app: APP_ID, schemaVersion: 1, character: { id: 'a', name: 'Old', classKey: 'fighter' } });
		expect(c.stashes).toEqual([]);
		expect(c.encumbranceRule).toBeUndefined();
	});

	it('keeps where things are, bringing back anything left somewhere that no longer exists', () => {
		const c = readBackup({
			app: APP_ID,
			schemaVersion: 1,
			character: {
				id: 'a',
				name: 'X',
				classKey: 'fighter',
				encumbranceRule: 'variant',
				stashes: [{ id: 'hall', name: ' Guild hall ', kind: 'place', coins: { gp: 40, sp: -2 } }, { id: 'x', name: '' }],
				items: [
					thing('chest', { stash: 'hall', container: { lb: 300, coins: true, weightless: 'yes' } }),
					thing('rope', { stash: 'hall', inside: 'chest' }),
					thing('lamp', { stash: 'gone', inside: 'chest' }),
					thing('torch', { inside: 'rope' })
				]
			}
		});
		expect(c.encumbranceRule).toBe('variant');
		expect(c.stashes).toEqual([{ id: 'hall', name: 'Guild hall', kind: 'place', coins: { cp: 0, sp: 0, ep: 0, gp: 40, pp: 0 } }]);
		expect(c.items.map((i) => [i.id, i.stash, i.inside])).toEqual([
			['chest', 'hall', undefined],
			['rope', 'hall', 'chest'],
			['lamp', undefined, undefined],
			['torch', undefined, undefined]
		]);
		expect(c.items[0].container).toEqual({ lb: 300, coins: true });
	});

	it('keeps coins in containers, equipped containers and mounts', () => {
		const c = readBackup({
			app: APP_ID,
			schemaVersion: 1,
			character: {
				id: 'a',
				name: 'X',
				classKey: 'fighter',
				stashes: [{ id: 'pony', name: 'Pony', kind: 'mount', lb: 225 }],
				items: [
					thing('pouch', { container: { lb: 6, coins: true }, equipped: true, coins: { gp: 40, pp: -1 } }),
					thing('rope', { equipped: true, coins: { gp: 5 } })
				]
			}
		});
		expect(c.stashes[0]).toMatchObject({ kind: 'mount', lb: 225 });
		expect(c.items[0]).toMatchObject({ equipped: true, coins: { cp: 0, sp: 0, ep: 0, gp: 40, pp: 0 } });
		expect(c.items[1]).not.toHaveProperty('equipped');
		expect(c.items[1]).not.toHaveProperty('coins');
	});
});
