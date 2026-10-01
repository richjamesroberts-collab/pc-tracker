import { describe, expect, it } from 'vitest';
import { newCharacter } from '$lib/character';
import { BackupError, decodeRestoreCode, encodeRestoreCode, parseBackupText, readBackup, toBackup } from './backup';

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

const lyra = () => ({
	...newCharacter(),
	name: 'Lyra Ashwood',
	classKey: 'sorcerer',
	level: 7,
	hpMax: 52,
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
