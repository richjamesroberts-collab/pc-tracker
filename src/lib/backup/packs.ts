import type { Character, SpellPack } from '$lib/types';
import { APP_ID, BackupError, readSpells } from './backup';

export const PACK_SCHEMA_VERSION = 1;

export interface SpellPackFile {
	app: typeof APP_ID;
	kind: 'spell-pack';
	schemaVersion: number;
	pack: { id: string; name: string; version: string; description?: string };
	spells: SpellPack['spells'];
}

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);

export function isSpellPackFile(data: unknown): boolean {
	return isObj(data) && data.app === APP_ID && data.kind === 'spell-pack';
}

export function readSpellPack(data: unknown, now = new Date().toISOString()): SpellPack {
	if (!isSpellPackFile(data)) throw new BackupError("This isn't a spell pack file.");
	const file = data as Record<string, unknown>;
	if (typeof file.schemaVersion === 'number' && file.schemaVersion > PACK_SCHEMA_VERSION) {
		throw new BackupError('This spell pack is from a newer version of the app. Update and try again.');
	}
	const meta = file.pack;
	if (!isObj(meta) || typeof meta.id !== 'string' || !meta.id || typeof meta.name !== 'string') {
		throw new BackupError('The spell pack is missing its name.');
	}
	const spells = readSpells(file.spells);
	if (spells.length === 0) throw new BackupError('The spell pack has no spells in it.');
	return {
		id: meta.id,
		name: meta.name,
		version: typeof meta.version === 'string' ? meta.version : '1',
		description: typeof meta.description === 'string' ? meta.description : undefined,
		spells,
		importedAt: now
	};
}

/** Package a character's custom spells as a pack so the rest of the table can import them. */
export function customSpellsPack(c: Character): SpellPackFile {
	const slug = c.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'character';
	return {
		app: APP_ID,
		kind: 'spell-pack',
		schemaVersion: PACK_SCHEMA_VERSION,
		pack: {
			id: `custom-${slug}`,
			name: `${c.name}'s custom spells`,
			version: new Date().toISOString().slice(0, 10),
			description: `${c.customSpells.length} spells entered by hand in ${c.name}'s spellbook.`
		},
		spells: c.customSpells.map(({ pack: _pack, ...s }) => s)
	};
}

export function packFileName(pack: { id: string }): string {
	return `${pack.id}.spellpack.json`;
}
