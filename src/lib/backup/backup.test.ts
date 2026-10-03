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
			notes: ''
		};
		const c = { ...lyra(), items: [wand] };
		expect(parseBackupText(JSON.stringify(toBackup(c))).items).toEqual([wand]);

		const raw = { ...toBackup(lyra()) };
		const bad = [{ id: 'x', name: '' }, { id: 'y', name: 'Ring', attuned: true, quantity: -2, charges: { max: 3, used: 9 } }];
		const back = readBackup({ ...raw, character: { ...raw.character, items: bad } });
		expect(back.items).toHaveLength(1);
		expect(back.items[0]).toMatchObject({ kind: 'magic', attuned: false, quantity: 1, charges: { max: 3, used: 3 }, type: '', notes: '' });
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
					{ name: 'no id' },
					{ id: 'c2', name: 'Bad', max: 2, reset: 'weekly', used: 0 }
				]
			}
		});
		expect(c.raceKey).toBe('half-orc');
		expect(c.subraceKey).toBeUndefined();
		expect(c.resourcesUsed).toEqual({ rage: 2 });
		expect(c.customResources).toEqual([{ id: 'c1', name: 'Luck', max: 3, reset: 'long', used: 1 }]);
	});

	it('restore links carry race and counters', async () => {
		const c = { ...newCharacter(), name: 'R', raceKey: 'elf', subraceKey: 'drow', resourcesUsed: { 'faerie-fire': 1 } };
		const back = await decodeRestoreCode(await encodeRestoreCode(c));
		expect([back.raceKey, back.subraceKey, back.resourcesUsed]).toEqual(['elf', 'drow', { 'faerie-fire': 1 }]);
	});
});
