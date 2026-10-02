import { newCharacter } from '$lib/character';
import type { Character, CharacterSpell, CustomResource, Spell } from '$lib/types';

export const APP_ID = '5e-pc-tracker';
export const SCHEMA_VERSION = 1;

export interface BackupFile {
	app: typeof APP_ID;
	schemaVersion: number;
	exportedAt: string;
	character: Character;
}

export class BackupError extends Error {}

export function toBackup(c: Character): BackupFile {
	return { app: APP_ID, schemaVersion: SCHEMA_VERSION, exportedAt: new Date().toISOString(), character: c };
}

export function backupFileName(c: Character): string {
	const slug = c.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'character';
	return `${slug}.pctracker.json`;
}

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const num = (v: unknown, fallback: number) => (typeof v === 'number' && Number.isFinite(v) ? v : fallback);
const str = (v: unknown, fallback = '') => (typeof v === 'string' ? v : fallback);

function numRecord(v: unknown): Record<number, number> {
	if (!isObj(v)) return {};
	const out: Record<number, number> = {};
	for (const [k, n] of Object.entries(v)) if (typeof n === 'number' && n > 0) out[Number(k)] = n;
	return out;
}

function usedRecord(v: unknown): Record<string, number> {
	if (!isObj(v)) return {};
	const out: Record<string, number> = {};
	for (const [k, n] of Object.entries(v)) if (typeof n === 'number' && Number.isFinite(n) && n >= 0) out[k] = n;
	return out;
}

function customResources(v: unknown): CustomResource[] {
	if (!Array.isArray(v)) return [];
	const out: CustomResource[] = [];
	for (const r of v) {
		if (!isObj(r) || typeof r.id !== 'string' || typeof r.name !== 'string' || !r.name) continue;
		if (r.reset !== 'short' && r.reset !== 'long') continue;
		const max = Math.max(1, num(r.max, 1));
		out.push({ id: r.id, name: r.name, max, reset: r.reset, used: Math.min(max, Math.max(0, num(r.used, 0))) });
	}
	return out;
}

function spellList(v: unknown): CharacterSpell[] {
	if (!Array.isArray(v)) return [];
	return v.filter((s) => isObj(s) && typeof s.id === 'string').map((s) => ({ id: s.id as string, prepared: !!s.prepared }));
}

/** Check spells from a backup or spell pack, keeping only known fields. `source` overrides the file's own when given. */
export function readSpells(v: unknown, source?: string): Spell[] {
	if (!Array.isArray(v)) return [];
	return v
		.filter((s): s is Record<string, unknown> => isObj(s) && typeof s.id === 'string' && typeof s.name === 'string')
		.map((s) => ({
			id: s.id as string,
			name: s.name as string,
			source: source ?? str(s.source, 'Custom'),
			level: Math.min(9, Math.max(0, num(s.level, 0))),
			school: str(s.school),
			time: str(s.time),
			range: str(s.range),
			components: str(s.components),
			duration: str(s.duration),
			concentration: !!s.concentration,
			ritual: !!s.ritual,
			classes: Array.isArray(s.classes) ? s.classes.filter((x): x is string => typeof x === 'string') : [],
			text: str(s.text),
			...(typeof s.higher === 'string' && s.higher ? { higher: s.higher } : {})
		}));
}

/** Check a parsed backup and fill in anything an older or hand-edited file is missing. */
export function readBackup(data: unknown): Character {
	if (!isObj(data) || data.app !== APP_ID) throw new BackupError("This isn't a PC Tracker backup file.");
	const version = num(data.schemaVersion, 0);
	if (version > SCHEMA_VERSION) throw new BackupError('This backup is from a newer version of the app. Update and try again.');
	const raw = data.character;
	if (!isObj(raw) || typeof raw.id !== 'string' || typeof raw.name !== 'string' || typeof raw.classKey !== 'string') {
		throw new BackupError('The backup is missing character details.');
	}

	const base = newCharacter();
	const hpMax = Math.max(1, num(raw.hpMax, base.hpMax));
	const saves = isObj(raw.deathSaves) ? raw.deathSaves : {};
	return {
		...base,
		id: raw.id,
		name: raw.name,
		image: typeof raw.image === 'string' && raw.image.startsWith('data:image/') ? raw.image : undefined,
		classKey: raw.classKey,
		subclassKey: typeof raw.subclassKey === 'string' ? raw.subclassKey : undefined,
		raceKey: typeof raw.raceKey === 'string' ? raw.raceKey : undefined,
		subraceKey: typeof raw.subraceKey === 'string' ? raw.subraceKey : undefined,
		level: Math.min(20, Math.max(1, num(raw.level, 1))),
		ac: num(raw.ac, base.ac),
		hpMax,
		hpCurrent: Math.min(hpMax, Math.max(0, num(raw.hpCurrent, hpMax))),
		tempHp: Math.max(0, num(raw.tempHp, 0)),
		deathSaves: { successes: num(saves.successes, 0), failures: num(saves.failures, 0) },
		stable: !!raw.stable,
		speed: typeof raw.speed === 'number' ? raw.speed : undefined,
		initiativeModifier: typeof raw.initiativeModifier === 'number' ? raw.initiativeModifier : undefined,
		passivePerception: typeof raw.passivePerception === 'number' ? raw.passivePerception : undefined,
		spellMod: num(raw.spellMod, 0),
		slotsUsed: numRecord(raw.slotsUsed),
		bonusSlots: numRecord(raw.bonusSlots),
		pactSlotsUsed: num(raw.pactSlotsUsed, 0),
		arcanumUsed: Array.isArray(raw.arcanumUsed) ? raw.arcanumUsed.filter((x): x is number => typeof x === 'number') : [],
		sorceryPointsUsed: num(raw.sorceryPointsUsed, 0),
		metamagic: Array.isArray(raw.metamagic) ? raw.metamagic.filter((x): x is string => typeof x === 'string') : [],
		resourcesUsed: usedRecord(raw.resourcesUsed),
		customResources: customResources(raw.customResources),
		spells: spellList(raw.spells),
		customSpells: readSpells(raw.customSpells, 'Custom'),
		spellCache: readSpells(raw.spellCache),
		concentration: typeof raw.concentration === 'string' ? raw.concentration : undefined,
		notes: str(raw.notes),
		createdAt: str(raw.createdAt, base.createdAt),
		updatedAt: str(raw.updatedAt, base.updatedAt),
		lastBackupAt: typeof raw.lastBackupAt === 'string' ? raw.lastBackupAt : undefined
	};
}

export function parseBackupText(text: string): Character {
	let data: unknown;
	try {
		data = JSON.parse(text);
	} catch {
		throw new BackupError("Couldn't read the file. Is it a .pctracker.json backup?");
	}
	return readBackup(data);
}

// ── Restore links: the backup compressed into a URL-safe string ──

async function pipe(bytes: Uint8Array, stream: CompressionStream | DecompressionStream): Promise<Uint8Array> {
	const out = new Blob([bytes as BlobPart]).stream().pipeThrough(stream);
	return new Uint8Array(await new Response(out).arrayBuffer());
}

function toBase64Url(bytes: Uint8Array): string {
	let bin = '';
	for (const b of bytes) bin += String.fromCharCode(b);
	return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function fromBase64Url(s: string): Uint8Array {
	const bin = atob(s.replace(/-/g, '+').replace(/_/g, '/'));
	return Uint8Array.from(bin, (ch) => ch.charCodeAt(0));
}

/**
 * Encode without the portrait or saved spell copies, which would make links and QR codes far too long.
 * Spells from packs the other phone hasn't installed show as missing until it imports the pack.
 */
export async function encodeRestoreCode(c: Character): Promise<string> {
	const { image: _image, ...rest } = c;
	const json = JSON.stringify(toBackup({ ...rest, spellCache: [] } as Character));
	return toBase64Url(await pipe(new TextEncoder().encode(json), new CompressionStream('deflate-raw')));
}

export async function decodeRestoreCode(code: string): Promise<Character> {
	let text: string;
	try {
		text = new TextDecoder().decode(await pipe(fromBase64Url(code.trim()), new DecompressionStream('deflate-raw')));
	} catch {
		throw new BackupError('That restore link is incomplete or damaged.');
	}
	return parseBackupText(text);
}
