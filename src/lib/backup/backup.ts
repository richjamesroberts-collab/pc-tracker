import { legacyToBase, newCharacter } from '$lib/character';
import { recompute } from '$lib/rules/stats';
import { SKILL_KEYS } from '$lib/rules/skills';
import type {
	Ability,
	AbilityScores,
	ArmorType,
	Character,
	CharacterFeat,
	CharacterSpell,
	ClassOption,
	ClassOptionKind,
	Coins,
	CustomResource,
	CustomDefense,
	CustomSense,
	InventoryItem,
	ItemArmor,
	ItemEffects,
	ItemUse,
	ItemWeapon,
	Skill,
	Spell,
	UseTime,
	WeaponProperty
} from '$lib/types';

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
		if (r.reset !== 'short' && r.reset !== 'long' && r.reset !== 'none') continue;
		const max = Math.max(1, num(r.max, 1));
		out.push({ id: r.id, name: r.name, max, reset: r.reset, used: Math.min(max, Math.max(0, num(r.used, 0))) });
	}
	return out;
}

function items(v: unknown): InventoryItem[] {
	if (!Array.isArray(v)) return [];
	const out: InventoryItem[] = [];
	for (const i of v) {
		if (!isObj(i) || typeof i.id !== 'string' || typeof i.name !== 'string' || !i.name) continue;
		const ch = isObj(i.charges) ? i.charges : undefined;
		const max = ch ? Math.min(99, Math.max(0, Math.floor(num(ch.max, 0)))) : 0;
		const weight = num(i.weight, 0);
		out.push({
			id: i.id,
			kind: i.kind === 'gear' ? 'gear' : 'magic',
			...(typeof i.ref === 'string' ? { ref: i.ref } : {}),
			name: i.name,
			type: str(i.type),
			rarity: str(i.rarity),
			attunement: !!i.attunement,
			attuned: !!i.attunement && !!i.attuned,
			quantity: Math.max(1, Math.floor(num(i.quantity, 1))),
			...(weight > 0 ? { weight } : {}),
			...(armor(i.armor) || weapon(i.weapon) ? { equipped: !!i.equipped } : {}),
			...(armor(i.armor) ? { armor: armor(i.armor) } : {}),
			...(weapon(i.weapon) ? { weapon: weapon(i.weapon) } : {}),
			...(effects(i.effects) ? { effects: effects(i.effects) } : {}),
			...(ch && max > 0
				? {
						charges: {
							max,
							used: Math.min(max, Math.max(0, num(ch.used, 0))),
							...(typeof ch.regain === 'string' && ch.regain ? { regain: ch.regain } : {})
						}
					}
				: {}),
			...(itemUse(i.use) ? { use: itemUse(i.use) } : {}),
			notes: str(i.notes)
		});
	}
	return out;
}

const USE_TIMES: UseTime[] = ['action', 'bonus', 'reaction'];

function itemUse(v: unknown): ItemUse | undefined {
	if (!isObj(v) || !Array.isArray(v.times)) return undefined;
	const times = USE_TIMES.filter((t) => (v.times as unknown[]).includes(t));
	return { times, ...(v.consumed === true ? { consumed: true } : {}) };
}

function abilities(v: unknown): AbilityScores {
	const raw = isObj(v) ? v : {};
	const score = (k: string) => Math.min(30, Math.max(1, Math.round(num(raw[k], 10))));
	return { str: score('str'), dex: score('dex'), con: score('con'), int: score('int'), wis: score('wis'), cha: score('cha') };
}

const ABILITY_KEYS: Ability[] = ['str', 'dex', 'con', 'int', 'wis', 'cha'];
const ARMOR_TYPES: ArmorType[] = ['light', 'medium', 'heavy', 'shield'];

function armor(v: unknown): ItemArmor | undefined {
	if (!isObj(v) || !ARMOR_TYPES.includes(v.type as ArmorType)) return undefined;
	const base = typeof v.base === 'string' && v.base ? { base: v.base } : {};
	return { type: v.type as ArmorType, ac: Math.min(30, Math.max(0, Math.round(num(v.ac, 0)))), ...base };
}

const WEAPON_PROPERTIES: WeaponProperty[] = ['ammunition', 'finesse', 'heavy', 'light', 'loading', 'reach', 'special', 'thrown', 'two-handed', 'versatile'];
const DICE = /^(\d+d\d+|\d+)?$/;

function weapon(v: unknown): ItemWeapon | undefined {
	if (!isObj(v) || typeof v.base !== 'string' || !v.base || (v.category !== 'simple' && v.category !== 'martial')) return undefined;
	const damage = str(v.damage);
	const range = Array.isArray(v.range) && v.range.length === 2 && v.range.every((n) => typeof n === 'number' && n > 0) ? v.range : undefined;
	return {
		base: v.base,
		category: v.category,
		ranged: !!v.ranged,
		damage: DICE.test(damage) ? damage : '',
		damageType: str(v.damageType),
		properties: Array.isArray(v.properties) ? v.properties.filter((p): p is WeaponProperty => WEAPON_PROPERTIES.includes(p as WeaponProperty)) : [],
		...(typeof v.versatile === 'string' && v.versatile && DICE.test(v.versatile) ? { versatile: v.versatile } : {}),
		...(range ? { range: [range[0], range[1]] as [number, number] } : {})
	};
}

function senses(v: unknown): CustomSense[] {
	if (!Array.isArray(v)) return [];
	return v
		.filter((s) => isObj(s) && typeof s.name === 'string' && s.name.trim() && typeof s.range === 'number' && s.range > 0)
		.map((s) => ({ id: str(s.id) || crypto.randomUUID(), name: (s.name as string).trim(), range: Math.min(9999, Math.round(s.range as number)) }));
}

function customDefenses(v: unknown): CustomDefense[] {
	if (!Array.isArray(v)) return [];
	return v
		.filter((d) => isObj(d) && (d.kind === 'resistance' || d.kind === 'immunity') && typeof d.name === 'string' && d.name.trim())
		.map((d) => {
			const source = typeof d.source === 'string' ? d.source.trim() : '';
			return {
				id: str(d.id) || crypto.randomUUID(),
				kind: d.kind as CustomDefense['kind'],
				name: (d.name as string).trim().toLowerCase(),
				...(source ? { source } : {})
			};
		});
}

function feats(v: unknown): CharacterFeat[] {
	if (!Array.isArray(v)) return [];
	return v
		.filter((f) => isObj(f) && typeof f.name === 'string' && f.name.trim())
		.map((f) => {
			const picked = Array.isArray(f.abilities) ? f.abilities.filter((x: unknown): x is Ability => ABILITY_KEYS.includes(x as Ability)) : [];
			const level = typeof f.level === 'number' && Number.isInteger(f.level) ? f.level : undefined;
			const hp = typeof f.hpPerLevel === 'number' && Number.isFinite(f.hpPerLevel) ? f.hpPerLevel : undefined;
			return {
				id: str(f.id) || crypto.randomUUID(),
				...(typeof f.ref === 'string' && f.ref ? { ref: f.ref } : {}),
				name: (f.name as string).trim(),
				...(level !== undefined ? { level } : {}),
				...(picked.length ? { abilities: picked } : {}),
				...(hp ? { hpPerLevel: hp } : {})
			};
		});
}

const OPTION_KINDS: ClassOptionKind[] = ['invocation', 'pact-boon', 'maneuver', 'arcane-shot', 'rune', 'infusion', 'discipline'];

function classOptions(v: unknown): ClassOption[] {
	if (!Array.isArray(v)) return [];
	const seen = new Set<string>();
	return v
		.filter(
			(o) =>
				isObj(o) && typeof o.ref === 'string' && o.ref && typeof o.name === 'string' && OPTION_KINDS.includes(o.kind as ClassOptionKind)
		)
		.filter((o) => !seen.has(o.ref as string) && !!seen.add(o.ref as string))
		.map((o) => ({ ref: o.ref as string, name: o.name as string, kind: o.kind as ClassOptionKind }));
}

const strings = (v: unknown) => (Array.isArray(v) ? [...new Set(v.filter((x): x is string => typeof x === 'string' && !!x))] : []);
const skills = (v: unknown) => strings(v).filter((x): x is Skill => (SKILL_KEYS as string[]).includes(x));

function scorePart(v: unknown): Partial<AbilityScores> | undefined {
	if (!isObj(v)) return undefined;
	const out: Partial<AbilityScores> = {};
	for (const k of ABILITY_KEYS) if (typeof v[k] === 'number' && Number.isFinite(v[k])) out[k] = v[k] as number;
	return Object.keys(out).length ? out : undefined;
}

function effects(v: unknown): ItemEffects | undefined {
	if (!isObj(v)) return undefined;
	const n = (x: unknown) => (typeof x === 'number' && Number.isFinite(x) && x !== 0 ? x : undefined);
	const list = (x: unknown) => (strings(x).length ? strings(x) : undefined);
	const e: ItemEffects = {
		set: scorePart(v.set),
		add: scorePart(v.add),
		addMax: n(v.addMax),
		ac: n(v.ac),
		spellAttack: n(v.spellAttack),
		spellDc: n(v.spellDc),
		unarmoredOnly: v.unarmoredOnly === true || undefined,
		attack: n(v.attack),
		damage: n(v.damage),
		resist: list(v.resist),
		immune: list(v.immune),
		conditionImmune: list(v.conditionImmune)
	};
	return Object.fromEntries(Object.entries(e).filter(([, x]) => x !== undefined)) as ItemEffects;
}

function coins(v: unknown): Coins {
	const raw = isObj(v) ? v : {};
	const count = (k: string) => Math.max(0, Math.floor(num(raw[k], 0)));
	return { cp: count('cp'), sp: count('sp'), ep: count('ep'), gp: count('gp'), pp: count('pp') };
}

function spellList(v: unknown): CharacterSpell[] {
	if (!Array.isArray(v)) return [];
	return v
		.filter((s) => isObj(s) && typeof s.id === 'string')
		.map((s) => ({
			id: s.id as string,
			prepared: !!s.prepared,
			...(typeof s.grant === 'string' ? { grant: s.grant } : {}),
			...(typeof s.replaces === 'string' ? { replaces: s.replaces } : {})
		}));
}

/** Text values by key, e.g. `grantVariants`; anything else is dropped. */
function stringRecord(v: unknown): Record<string, string> | undefined {
	if (!isObj(v)) return undefined;
	const out = Object.fromEntries(Object.entries(v).filter((e): e is [string, string] => typeof e[1] === 'string'));
	return Object.keys(out).length ? out : undefined;
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
	const optionalNum = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : undefined);
	const saves = isObj(raw.deathSaves) ? raw.deathSaves : {};
	const c: Character = {
		...base,
		id: raw.id,
		name: raw.name,
		image: typeof raw.image === 'string' && raw.image.startsWith('data:image/') ? raw.image : undefined,
		classKey: raw.classKey,
		subclassKey: typeof raw.subclassKey === 'string' ? raw.subclassKey : undefined,
		raceKey: typeof raw.raceKey === 'string' ? raw.raceKey : undefined,
		subraceKey: typeof raw.subraceKey === 'string' ? raw.subraceKey : undefined,
		level: Math.min(20, Math.max(1, num(raw.level, 1))),
		xp: Math.max(0, Math.floor(num(raw.xp, 0))),
		milestone: raw.milestone === true,
		abilities: abilities(raw.abilities),
		raceAbilityChoices: Array.isArray(raw.raceAbilityChoices)
			? raw.raceAbilityChoices.filter((x): x is Ability => ABILITY_KEYS.includes(x as Ability))
			: [],
		ac: num(raw.ac, base.ac),
		acAuto: !!raw.acAuto,
		acBase: num(raw.acBase, num(raw.ac, base.ac)),
		acAdjust: num(raw.acAdjust, 0),
		hpMax,
		hpBase: Math.max(1, num(raw.hpBase, hpMax)),
		hpCurrent: Math.min(hpMax, Math.max(0, num(raw.hpCurrent, hpMax))),
		tempHp: Math.max(0, num(raw.tempHp, 0)),
		deathSaves: { successes: num(saves.successes, 0), failures: num(saves.failures, 0) },
		stable: !!raw.stable,
		hitDiceUsed: Math.max(0, Math.floor(num(raw.hitDiceUsed, 0))),
		weaponProficiencies: strings(raw.weaponProficiencies),
		skillProficiencies: skills(raw.skillProficiencies),
		skillExpertise: skills(raw.skillExpertise),
		saveProficiencies: strings(raw.saveProficiencies).filter((x): x is Ability => ABILITY_KEYS.includes(x as Ability)),
		fightingStyles: strings(raw.fightingStyles),
		feats: feats(raw.feats),
		classOptions: classOptions(raw.classOptions),
		senses: senses(raw.senses),
		defenses: customDefenses(raw.defenses),
		speed: typeof raw.speed === 'number' ? raw.speed : undefined,
		initiativeModifier: optionalNum(raw.initiativeModifier),
		initiativeOverride: optionalNum(raw.initiativeOverride),
		passivePerception: optionalNum(raw.passivePerception),
		spellMod: num(raw.spellMod, 0),
		spellModOverride: optionalNum(raw.spellModOverride),
		slotsUsed: numRecord(raw.slotsUsed),
		bonusSlots: numRecord(raw.bonusSlots),
		pactSlotsUsed: num(raw.pactSlotsUsed, 0),
		arcanumUsed: Array.isArray(raw.arcanumUsed) ? raw.arcanumUsed.filter((x): x is number => typeof x === 'number') : [],
		sorceryPointsUsed: num(raw.sorceryPointsUsed, 0),
		metamagic: Array.isArray(raw.metamagic) ? raw.metamagic.filter((x): x is string => typeof x === 'string') : [],
		resourcesUsed: usedRecord(raw.resourcesUsed),
		customResources: customResources(raw.customResources),
		spells: spellList(raw.spells),
		grantVariants: stringRecord(raw.grantVariants),
		customSpells: readSpells(raw.customSpells, 'Custom'),
		spellCache: readSpells(raw.spellCache),
		concentration: typeof raw.concentration === 'string' ? raw.concentration : undefined,
		items: items(raw.items),
		itemDataVersion: optionalNum(raw.itemDataVersion),
		coins: coins(raw.coins),
		notes: str(raw.notes),
		createdAt: str(raw.createdAt, base.createdAt),
		updatedAt: str(raw.updatedAt, base.updatedAt),
		lastBackupAt: typeof raw.lastBackupAt === 'string' ? raw.lastBackupAt : undefined
	};
	// Backups from before base stats: keep what the player typed as the base or an override.
	// AC and max HP already fall back to what was typed; the spellcasting modifier and initiative become overrides.
	if (raw.hpBase === undefined) legacyToBase(c);
	c.hitDiceUsed = Math.min(c.hitDiceUsed, c.level);
	return recompute(c);
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
