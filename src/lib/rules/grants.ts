import grantsJson from '$lib/data/spell-grants.json';
import type { Character, Spell } from '$lib/types';
import { ordinal } from './spellcasting';

/**
 * Spells a class, subclass, pact boon or fighting style gives on top of the ones the class picks normally
 * (see scripts/build-data.mjs). Fixed spells are worked out from class, subclass and level, never stored.
 * Picks for a grant's choices, and spells swapped into a subclass list, are stored on `Character.spells`
 * with `grant` (and `replaces` for a swap).
 */
export interface SpellFilter {
	levels?: number[];
	/** Any of these class lists. */
	classes?: string[];
	schools?: string[];
	/** One of these spells (Arcane Archer: prestidigitation or druidcraft). */
	ids?: string[];
}

export interface SpellGrant {
	/** Unique: `<owner>#<n>`. */
	key: string;
	/** `class`, `class/subclass`, `option:<ref>` (pact boon) or `style:<key>` (fighting style). */
	owner: string;
	/** "Psionic Spells", "Domain Spells". */
	name: string;
	/** Short label shown on the spell: "Psionic", "Domain". */
	tag: string;
	/** 'prepared': always prepared. 'known': always known. 'expanded': added to the list the class picks from. */
	mode: 'prepared' | 'known' | 'expanded';
	/** Doesn't count against cantrips known, spells known or prepared (all but expanded lists and Magical Secrets). */
	free: boolean;
	/** One of several lists the player picks from (Land terrain, Divine Soul affinity, Genie kind). */
	variant?: string;
	/** Fixed spells, by the class level they arrive at. */
	spells: { level: number; id: string; name: string }[];
	/** Spells the player picks: `count` matching `filter`, from class level `level` (0: as soon as the owner is). */
	choices?: { level: number; count: number; filter: SpellFilter }[];
	/** Whole lists an expanded grant adds from a class level (Divine Soul: the cleric list). */
	lists?: { level: number; filter: SpellFilter }[];
	/** At each level up one spell from this list can be traded for one of the same level matching this. */
	swap?: { schools: string[]; classes: string[] };
}

export interface GrantedSpell {
	id: string;
	grant: SpellGrant;
	/** For a fixed spell: its name and the class level it arrives at. */
	name?: string;
	level?: number;
}

/** One choice a grant offers the character now, with what's been picked for it. */
export interface GrantChoice {
	/** `<grant key>:<n>`, stored as `CharacterSpell.grant` on the picks. */
	key: string;
	grant: SpellGrant;
	count: number;
	filter: SpellFilter;
	picked: string[];
}

/** What grants are worked out from. Only class, subclass and level are needed for class and subclass grants. */
export type GrantCharacter = Pick<Character, 'classKey' | 'subclassKey' | 'level'> &
	Partial<Pick<Character, 'classOptions' | 'fightingStyles' | 'grantVariants' | 'spells'>>;

/** By owner. */
const GRANTS = grantsJson as Record<string, SpellGrant[]>;

/** What the player picks between, for owners with variant lists. */
const VARIANT_LABELS: Record<string, string> = {
	'druid/land': 'Land',
	'sorcerer/divine-soul': 'Divine affinity',
	'warlock/genie': 'Genie kind'
};

function owners(c: GrantCharacter): string[] {
	return [
		c.classKey,
		...(c.subclassKey ? [`${c.classKey}/${c.subclassKey}`] : []),
		...(c.classOptions ?? []).map((o) => `option:${o.ref}`),
		...(c.fightingStyles ?? []).map((k) => `style:${k}`)
	];
}

/** Grants the character's class, subclass, pact boon and fighting styles give, whatever their level. Variant lists only once picked. */
export function grantsFor(c: GrantCharacter): SpellGrant[] {
	return owners(c).flatMap((o) => (GRANTS[o] ?? []).filter((g) => !g.variant || c.grantVariants?.[o] === g.variant));
}

/** Owners with lists to pick between (Land terrain), and what's picked. */
export function variantPicks(c: GrantCharacter): { owner: string; label: string; variants: string[]; picked?: string }[] {
	return owners(c).flatMap((owner) => {
		const variants = [...new Set((GRANTS[owner] ?? []).flatMap((g) => (g.variant ? [g.variant] : [])))];
		if (!variants.length) return [];
		return [{ owner, label: VARIANT_LABELS[owner] ?? 'Spell list', variants, picked: c.grantVariants?.[owner] }];
	});
}

const arrived = (level: number, c: GrantCharacter) => level <= c.level;

/**
 * Spells the character has from grants at their level, one per spell (the first grant wins): fixed spells
 * (less any swapped out), spells swapped in, and picks for choices. Expanded lists aren't spells they have.
 */
export function grantedSpells(c: GrantCharacter): GrantedSpell[] {
	const out = new Map<string, GrantedSpell>();
	const spells = c.spells ?? [];
	for (const grant of grantsFor(c)) {
		if (grant.mode === 'expanded') continue;
		for (const s of grant.spells) {
			if (!arrived(s.level, c)) continue;
			const swapped = spells.find((x) => x.grant === grant.key && x.replaces === s.id);
			const id = swapped?.id ?? s.id;
			if (!out.has(id)) out.set(id, swapped ? { id, grant } : { ...s, grant });
		}
	}
	for (const choice of grantChoices(c)) {
		for (const id of choice.picked) if (!out.has(id)) out.set(id, { id, grant: choice.grant });
	}
	return [...out.values()];
}

/** Ids of free granted spells, which don't count against what the character can know or prepare. */
export function grantedIds(c: GrantCharacter): Set<string> {
	return new Set(grantedSpells(c).flatMap((s) => (s.grant.free ? [s.id] : [])));
}

/** Spells the player picked that count against their limits: everything except free granted spells. */
export function pickedSpells<T extends { id: string }>(c: GrantCharacter, spells: T[]): T[] {
	const granted = grantedIds(c);
	return spells.filter((s) => !granted.has(s.id));
}

/** Choices the character's grants offer at their level. */
export function grantChoices(c: GrantCharacter): GrantChoice[] {
	const spells = c.spells ?? [];
	return grantsFor(c).flatMap((grant) =>
		(grant.choices ?? []).flatMap((ch, i) => {
			if (!arrived(ch.level, c)) return [];
			const key = `${grant.key}:${i}`;
			const picked = spells.filter((s) => s.grant === key && !s.replaces).map((s) => s.id);
			return [{ key, grant, count: ch.count, filter: ch.filter, picked }];
		})
	);
}

/** Choices `next` has that `prev` didn't (a level, subclass, pact boon or fighting style brought them). */
export function newGrantChoices(prev: GrantCharacter | null, next: GrantCharacter): GrantChoice[] {
	const had = new Set(prev ? grantChoices(prev).map((ch) => ch.key) : []);
	return grantChoices(next).filter((ch) => !had.has(ch.key));
}

export function matchesFilter(spell: Pick<Spell, 'id' | 'level' | 'classes' | 'school'>, f: SpellFilter): boolean {
	return (
		(!f.ids || f.ids.includes(spell.id)) &&
		(!f.levels || f.levels.includes(spell.level)) &&
		(!f.classes || f.classes.some((k) => spell.classes.includes(k))) &&
		(!f.schools || f.schools.includes(spell.school))
	);
}

/** The expanded grant that puts `spell` on the character's list (a warlock patron's, Divine Soul's cleric list), if any. */
export function expandedBy(c: GrantCharacter, spell: Pick<Spell, 'id' | 'level' | 'classes' | 'school'>): SpellGrant | undefined {
	return grantsFor(c).find(
		(g) =>
			g.mode === 'expanded' &&
			(g.spells.some((s) => s.id === spell.id && arrived(s.level, c)) ||
				(g.lists ?? []).some((l) => arrived(l.level, c) && matchesFilter(spell, l.filter)))
	);
}

/** Spells in a swappable subclass list now (after earlier swaps), with the fixed spell each stands for. */
export function swappable(c: GrantCharacter): { grant: SpellGrant; id: string; original: string }[] {
	const spells = c.spells ?? [];
	return grantsFor(c).flatMap((grant) =>
		grant.swap
			? grant.spells
					.filter((s) => arrived(s.level, c))
					.map((s) => ({ grant, original: s.id, id: spells.find((x) => x.grant === grant.key && x.replaces === s.id)?.id ?? s.id }))
			: []
	);
}

/** A spell that can replace `current` (same level, the grant's schools and lists). */
export function canSwapTo(grant: SpellGrant, current: Pick<Spell, 'level'>, spell: Pick<Spell, 'id' | 'level' | 'classes' | 'school'>): boolean {
	return !!grant.swap && spell.level === current.level && matchesFilter(spell, { schools: grant.swap.schools, classes: grant.swap.classes });
}

/** Granted spells new at `next` compared with `prev`, by grant: { name: 'Psionic Spells', spells: ['Calm Emotions', 'Detect Thoughts'] }. */
export function newGrants(prev: GrantCharacter, next: GrantCharacter): { name: string; spells: string[] }[] {
	const had = new Set(grantedSpells(prev).map((s) => s.id));
	const groups = new Map<string, string[]>();
	for (const s of grantedSpells(next)) {
		if (had.has(s.id) || !s.name) continue;
		groups.set(s.grant.name, [...(groups.get(s.grant.name) ?? []), s.name]);
	}
	return [...groups.entries()].map(([name, spells]) => ({ name, spells }));
}

/**
 * Eldritch Knights (abjuration, evocation) and Arcane Tricksters (enchantment, illusion) learn levelled spells
 * from two schools, except one from any school at 3rd, 8th, 14th and 20th level.
 */
export function schoolLimit(c: Pick<Character, 'classKey' | 'subclassKey' | 'level'>): { schools: string[]; anyMax: number } | null {
	const schools =
		c.subclassKey === 'eldritch-knight' && c.classKey === 'fighter'
			? ['Abjuration', 'Evocation']
			: c.subclassKey === 'arcane-trickster' && c.classKey === 'rogue'
				? ['Enchantment', 'Illusion']
				: null;
	if (!schools || c.level < 3) return null;
	return { schools, anyMax: [3, 8, 14, 20].filter((l) => c.level >= l).length };
}

const CLASS_NAMES: Record<string, string> = {
	artificer: 'Artificer',
	bard: 'Bard',
	cleric: 'Cleric',
	druid: 'Druid',
	paladin: 'Paladin',
	ranger: 'Ranger',
	sorcerer: 'Sorcerer',
	warlock: 'Warlock',
	wizard: 'Wizard'
};

/** What a choice asks for: "druid cantrip", "wizard 6th-level spell", "spell up to 5th level, any class". */
export function filterLabel(f: SpellFilter, names?: (id: string) => string): string {
	if (f.ids) return f.ids.map((id) => names?.(id) ?? id).join(' or ');
	const lv = f.levels ?? [];
	const max = Math.max(...lv);
	const what =
		lv.length === 1 && lv[0] === 0
			? 'cantrip'
			: lv.length === 1
				? `${ordinal(lv[0])}-level spell`
				: lv.length
					? `${lv.includes(0) ? 'cantrip or spell' : 'spell'} up to ${ordinal(max)} level`
					: 'spell of any level';
	const schools = f.schools ? `${f.schools.join(' or ').toLowerCase()} ` : '';
	const classes = f.classes ? `${f.classes.map((k) => CLASS_NAMES[k] ?? k).join(' or ')} ` : '';
	return `${classes}${schools}${what}${f.classes ? '' : ', any class'}`;
}
