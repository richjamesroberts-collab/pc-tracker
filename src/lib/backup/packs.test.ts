import { describe, expect, it } from 'vitest';
import { newCharacter } from '$lib/character';
import { BackupError } from './backup';
import { customSpellsPack, readSpellPack } from './packs';

const spell = {
	id: 'toll the dead|xge',
	name: 'Toll the Dead',
	source: 'XGE',
	level: 0,
	school: 'Necromancy',
	time: '1 action',
	range: '60 ft',
	components: 'V, S',
	duration: 'Instantaneous',
	concentration: false,
	ritual: false,
	classes: ['cleric', 'warlock', 'wizard'],
	text: 'A bell tolls.'
};

const file = (overrides: Record<string, unknown> = {}) => ({
	app: '5e-pc-tracker',
	kind: 'spell-pack',
	schemaVersion: 1,
	pack: { id: 'xge', name: "Xanathar's", version: '2026-10-02' },
	spells: [spell],
	...overrides
});

describe('spell packs', () => {
	it('reads a pack and keeps each spell source', () => {
		const pack = readSpellPack(file(), '2026-10-02T00:00:00Z');
		expect(pack).toMatchObject({ id: 'xge', name: "Xanathar's", version: '2026-10-02', importedAt: '2026-10-02T00:00:00Z' });
		expect(pack.spells).toEqual([spell]);
	});

	it('drops malformed spells and unknown fields', () => {
		const pack = readSpellPack(file({ spells: [spell, { name: 'No id' }, { ...spell, id: 'x', evil: '<script>' }] }));
		expect(pack.spells).toHaveLength(2);
		expect(pack.spells[1]).not.toHaveProperty('evil');
	});

	it('rejects backups, empty packs and newer versions', () => {
		expect(() => readSpellPack({ app: '5e-pc-tracker', schemaVersion: 1, character: {} })).toThrow(BackupError);
		expect(() => readSpellPack(file({ spells: [] }))).toThrow(/no spells/);
		expect(() => readSpellPack(file({ schemaVersion: 9 }))).toThrow(/newer version/);
	});

	it('exports custom spells as a pack that reads back', () => {
		const c = { ...newCharacter(), name: 'Lyra Ashwood', customSpells: [{ ...spell, id: 'custom-1', source: 'Custom' }] };
		const out = customSpellsPack(c);
		expect(out.pack.id).toBe('custom-lyra-ashwood');
		expect(readSpellPack(JSON.parse(JSON.stringify(out))).spells[0].name).toBe('Toll the Dead');
	});
});
