import grantsJson from '$lib/data/spell-grants.json';
import type { Ability, Character, Spell } from '$lib/types';
import { abilityMod } from './abilities';
import { resourceLeft, resourcesFor, spendResource, type ResourceDef } from './features';
import { ordinal, pactSlots, spellAbility, spellAttack, spellSaveDC } from './spellcasting';
import { abilityScores } from './stats';

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
	/** Rituals only (Book of Ancient Secrets, Ritual Caster). */
	ritual?: boolean;
}

/**
 * A way to cast a granted spell other than with a spell slot.
 *   will    At will
 *   rest    `uses` times per long or short rest; `pool` shares the uses between spells (Consult the Spirits)
 *   points  For ki, sorcery points or a psionic energy die; `cost: 'level'` is the spell's level. `from` is the
 *           level it starts at (Psionic Sorcery, 6th); `upcast` lets more ki cast it at a higher level.
 *   pact    With a warlock slot, once per long rest (Bewitching Whispers and other invocations)
 *   ritual  Only as a ritual
 */
export interface SpellCast {
	kind: 'will' | 'rest' | 'points' | 'pact' | 'ritual';
	per?: 'long' | 'short';
	uses?: number;
	pool?: string;
	points?: 'ki' | 'sorcery' | 'psionic';
	cost?: number | 'level';
	from?: number;
	upcast?: 'half-level' | 'elemental';
	note?: string;
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
	/**
	 * 'prepared': always prepared. 'known': always known. 'innate': cast only its own ways (`cast`), not
	 * with slots unless `slots`. 'expanded': added to the list the class picks from.
	 */
	mode: 'prepared' | 'known' | 'innate' | 'expanded';
	/** An innate grant's spells can also be cast with the character's slots (TCE feats, MPMM races). */
	slots?: boolean;
	/**
	 * The ability its spells are cast with: an ability, 'feat' (the one the feat raised: Fey Touched) or a
	 * list to choose from (MPMM races; the highest is used). Absent: the class's spellcasting ability.
	 */
	ability?: Ability | 'feat' | Ability[];
	/** Ways to cast every spell of this grant besides its own (Psionic Sorcery). */
	cast?: SpellCast[];
	/** Doesn't count against cantrips known, spells known or prepared (all but expanded lists and Magical Secrets). */
	free: boolean;
	/** One of several lists the player picks from (Land terrain, Divine Soul affinity, Genie kind). */
	variant?: string;
	/** Fixed spells, by the class (or character, for races) level they arrive at; `castLevel` when cast higher (Hellish Rebuke at 2nd). */
	spells: { level: number; id: string; name: string; castLevel?: number; cast?: SpellCast[] }[];
	/** Spells the player picks: `count` matching `filter`, from class level `level` (0: as soon as the owner is). */
	choices?: { level: number; count: number; filter: SpellFilter; cast?: SpellCast[] }[];
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
	/** Ways to cast it besides a slot, at the character's level. */
	cast: SpellCast[];
	castLevel?: number;
}

/** One choice a grant offers the character now, with what's been picked for it. */
export interface GrantChoice {
	/** `<grant key>:<n>`, stored as `CharacterSpell.grant` on the picks. */
	key: string;
	grant: SpellGrant;
	count: number;
	filter: SpellFilter;
	picked: string[];
	cast?: SpellCast[];
}

/** What grants are worked out from. Only class, subclass and level are needed for class and subclass grants. */
export type GrantCharacter = Pick<Character, 'classKey' | 'subclassKey' | 'level'> &
	Partial<Pick<Character, 'classOptions' | 'fightingStyles' | 'grantVariants' | 'spells' | 'feats' | 'raceKey' | 'subraceKey'>>;

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
		...(c.fightingStyles ?? []).map((k) => `style:${k}`),
		...(c.feats ?? []).flatMap((f) => (f.ref ? [`feat:${f.ref}`] : [])),
		...(c.raceKey ? [`race:${c.raceKey}`] : []),
		...(c.raceKey && c.subraceKey ? [`subrace:${c.raceKey}/${c.subraceKey}`] : [])
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
		// A feat's lists are one per class (Magic Initiate: Bard Spells, Cleric Spells…).
		const label = VARIANT_LABELS[owner] ?? (owner.startsWith('feat:') ? `${GRANTS[owner][0].name} class` : 'Spell list');
		return [{ owner, label, variants, picked: c.grantVariants?.[owner] }];
	});
}

const arrived = (level: number, c: GrantCharacter) => level <= c.level;
/** Ways to cast that apply at the character's level. */
const castNow = (c: GrantCharacter, cast: SpellCast[] | undefined) => (cast ?? []).filter((x) => !x.from || x.from <= c.level);

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
			const cast = castNow(c, swapped ? grant.cast : (s.cast ?? grant.cast));
			if (!out.has(id)) out.set(id, swapped ? { id, grant, cast } : { ...s, grant, cast });
		}
	}
	for (const choice of grantChoices(c)) {
		const cast = castNow(c, choice.cast ?? choice.grant.cast);
		for (const id of choice.picked) if (!out.has(id)) out.set(id, { id, grant: choice.grant, cast });
	}
	return [...out.values()];
}

/** An innate spell can't be cast with slots, unless its grant allows it or the character also knows it normally. */
export function slotsAllowed(c: GrantCharacter, g: GrantedSpell): boolean {
	return g.grant.mode !== 'innate' || !!g.grant.slots || (c.spells ?? []).some((s) => s.id === g.id && !s.grant);
}

/**
 * Ids of free granted spells, which don't count against what the character can know or prepare. An innate
 * spell the character also picked normally (a sorcerer's Misty Step with Fey Touched) still counts.
 */
export function grantedIds(c: GrantCharacter): Set<string> {
	const picked = new Set((c.spells ?? []).filter((s) => !s.grant).map((s) => s.id));
	return new Set(grantedSpells(c).flatMap((s) => (s.grant.free && !(s.grant.mode === 'innate' && picked.has(s.id)) ? [s.id] : [])));
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
			return [{ key, grant, count: ch.count, filter: ch.filter, picked, cast: ch.cast }];
		})
	);
}

/** Choices `next` has that `prev` didn't (a level, subclass, pact boon or fighting style brought them). */
export function newGrantChoices(prev: GrantCharacter | null, next: GrantCharacter): GrantChoice[] {
	const had = new Set(prev ? grantChoices(prev).map((ch) => ch.key) : []);
	return grantChoices(next).filter((ch) => !had.has(ch.key));
}

export function matchesFilter(
	spell: Pick<Spell, 'id' | 'level' | 'classes' | 'school'> & Partial<Pick<Spell, 'ritual'>>,
	f: SpellFilter
): boolean {
	return (
		(!f.ids || f.ids.includes(spell.id)) &&
		(!f.ritual || !!spell.ritual) &&
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
	const schools = `${f.schools ? `${f.schools.join(' or ').toLowerCase()} ` : ''}${f.ritual ? 'ritual ' : ''}`;
	const classes = f.classes ? `${f.classes.map((k) => CLASS_NAMES[k] ?? k).join(' or ')} ` : '';
	return `${classes}${schools}${what}${f.classes ? '' : ', any class'}`;
}

// ---- Casting granted spells -------------------------------------------------------------------

/** How a cast is paid for. `counter` is a `resourcesUsed` key: a racial counter, or `cast:<grant>:<spell>` / `cast:<pool>`. */
export type CastSpend =
	| { kind: 'free' }
	| { kind: 'counter'; counter: string; max: number }
	| { kind: 'points'; points: 'ki' | 'sorcery' | 'psionic'; cost: number }
	| { kind: 'pact'; counter: string };

export interface CastOption {
	key: string;
	label: string;
	detail: string;
	/** Casts left this way (1 or 0 for points and at will). */
	left: number;
	/** Level it's cast at. */
	level: number;
	spend: CastSpend;
}

/** A race's own counter for a racial spell of the same name (rules/features.ts), so both stay in step. */
function racialCounter(c: Character, g: GrantedSpell, name: string): ResourceDef | undefined {
	const [kind, key] = g.grant.owner.split(':');
	if (kind !== 'race' && kind !== 'subrace') return undefined;
	return resourcesFor(c).find((r) => r.owner.kind === kind && r.owner.key === key && r.name.toLowerCase() === name.toLowerCase());
}

const counterKey = (g: GrantedSpell, x: SpellCast) => `cast:${x.pool ?? `${g.grant.key}:${g.id}`}`;

/** Most ki an elemental discipline (by monk level) or Searing Arc Strike (half the monk level) can take. */
function maxKi(c: Character, upcast: SpellCast['upcast']): number {
	if (upcast === 'half-level') return Math.floor(c.level / 2);
	return c.level >= 17 ? 6 : c.level >= 13 ? 5 : c.level >= 9 ? 4 : 3;
}

function pointsLeft(c: Character, points: 'ki' | 'sorcery' | 'psionic'): number {
	if (points === 'sorcery') return Math.max(0, (c.classKey === 'sorcerer' && c.level >= 2 ? c.level : 0) - c.sorceryPointsUsed);
	const def = resourcesFor(c).find((r) => r.key === (points === 'ki' ? 'ki' : 'psionic-energy'));
	return def ? resourceLeft(c, def) : 0;
}

const POINT_NAMES = {
	ki: 'ki',
	sorcery: 'sorcery points',
	psionic: 'psionic energy die'
};

/** Ways to cast `spell` from the character's grants besides a spell slot, cheapest first. */
export function grantCastOptions(c: Character, spell: Pick<Spell, 'id' | 'name' | 'level'> & Partial<Pick<Spell, 'higher'>>): CastOption[] {
	const g = grantedSpells(c).find((x) => x.id === spell.id);
	if (!g) return [];
	const base = g.castLevel ?? spell.level;
	const out: CastOption[] = [];
	g.cast.forEach((x, i) => {
		const key = `grant-${i}`;
		const note = x.note ?? '';
		// A race's counter wins over what 5etools says (MPMM spells it gives as at will are once per long rest).
		const racial = x.kind === 'will' || x.kind === 'rest' ? racialCounter(c, g, spell.name) : undefined;
		if (x.kind === 'will' && !racial)
			out.push({
				key,
				label: 'At will',
				detail: note,
				left: 1,
				level: base,
				spend: { kind: 'free' }
			});
		else if (x.kind === 'will' || x.kind === 'rest') {
			const counter = racial?.key ?? counterKey(g, x);
			const max = racial ? racial.max(c) : (x.uses ?? 1);
			const per = racial ? racial.reset(c) : (x.per ?? 'long');
			const left = racial ? resourceLeft(c, racial) : Math.max(0, max - (c.resourcesUsed[counter] ?? 0));
			out.push({
				key,
				label: 'Free',
				detail: `${max} / ${per} rest`,
				left,
				level: base,
				spend: { kind: 'counter', counter, max }
			});
		} else if (x.kind === 'pact') {
			const pact = pactSlots(c);
			if (!pact) return;
			const counter = counterKey(g, x);
			const left = c.resourcesUsed[counter] ? 0 : Math.min(1, pact.count - c.pactSlotsUsed);
			out.push({
				key,
				label: `Pact slot (${ordinal(pact.level)})`,
				detail: '1 / long rest',
				left,
				level: pact.level,
				spend: { kind: 'pact', counter }
			});
		} else if (x.kind === 'points' && x.points) {
			const cost = x.cost === 'level' ? spell.level : (x.cost ?? 1);
			const have = pointsLeft(c, x.points);
			const unit = POINT_NAMES[x.points];
			const name = x.points === 'psionic' ? unit : `${cost} ${unit}`;
			out.push({
				key,
				label: name,
				detail: note,
				left: have >= cost ? 1 : 0,
				level: base,
				spend: { kind: 'points', points: x.points, cost }
			});
			// More ki casts it a level higher per point, for spells that get better at higher levels.
			if (x.upcast && spell.higher) {
				for (let extra = 1; cost + extra <= maxKi(c, x.upcast) && base + extra <= 9; extra++) {
					out.push({
						key: `${key}-${extra}`,
						label: `${cost + extra} ${unit}`,
						detail: `${ordinal(base + extra)} level`,
						left: have >= cost + extra ? 1 : 0,
						level: base + extra,
						spend: { kind: 'points', points: x.points, cost: cost + extra }
					});
				}
			}
		}
	});
	return out;
}

/** Pay for a cast. Returns false if there's not enough left. */
export function spendCast(c: Character, spend: CastSpend): boolean {
	switch (spend.kind) {
		case 'free':
			return true;
		case 'counter': {
			if (resourcesFor(c).some((r) => r.key === spend.counter)) return spendResource(c, spend.counter);
			const used = c.resourcesUsed[spend.counter] ?? 0;
			if (used >= spend.max) return false;
			c.resourcesUsed[spend.counter] = used + 1;
			return true;
		}
		case 'pact': {
			const pact = pactSlots(c);
			if (!pact || c.pactSlotsUsed >= pact.count || c.resourcesUsed[spend.counter]) return false;
			c.pactSlotsUsed += 1;
			c.resourcesUsed[spend.counter] = 1;
			return true;
		}
		case 'points': {
			if (pointsLeft(c, spend.points) < spend.cost) return false;
			if (spend.points === 'sorcery') c.sorceryPointsUsed += spend.cost;
			else spendResource(c, spend.points === 'ki' ? 'ki' : 'psionic-energy', spend.cost);
			return true;
		}
	}
}

/** Give back free casts that come back on a short rest (a long rest clears every counter). */
export function shortRestCasts(c: Character): void {
	for (const g of grantedSpells(c)) {
		for (const x of g.cast) if (x.kind === 'rest' && x.per === 'short') delete c.resourcesUsed[counterKey(g, x)];
	}
}

/** A short summary of the ways a granted spell is cast: "At will", "1 / long rest", "2 ki". */
export function castSummary(c: Character, g: GrantedSpell): string {
	const racial = g.name ? racialCounter(c, g, g.name) : undefined;
	const one = (x: SpellCast): string => {
		if (racial && (x.kind === 'will' || x.kind === 'rest')) return `${racial.max(c)} / ${racial.reset(c)} rest`;
		switch (x.kind) {
			case 'will':
				return 'At will';
			case 'rest':
				return `${x.uses ?? 1} / ${x.per ?? 'long'} rest`;
			case 'pact':
				return 'Pact slot 1 / long rest';
			case 'ritual':
				return 'Ritual only';
			case 'points':
				if (x.points === 'psionic') return 'Psionic die';
				return x.cost === 'level' ? 'Sorcery points' : `${x.cost} ${x.points === 'ki' ? 'ki' : 'SP'}`;
		}
	};
	return g.cast.map(one).join(' · ');
}

// ---- Spellcasting ability ---------------------------------------------------------------------

const ABILITY_NAMES: Record<Ability, string> = {
	str: 'Strength',
	dex: 'Dexterity',
	con: 'Constitution',
	int: 'Intelligence',
	wis: 'Wisdom',
	cha: 'Charisma'
};

/**
 * Spell attack and save DC for a granted spell cast with another ability than the class's (a tiefling
 * fighter's Hellish Rebuke with Charisma, a Shadow monk's Darkness with Wisdom). Null when it's the class's.
 */
export function grantCasting(c: Character, g: GrantedSpell): { ability: Ability; name: string; attack: number; dc: number } | null {
	const scores = abilityScores(c);
	const own = g.grant.ability;
	let ability: Ability | undefined;
	if (own === 'feat') {
		const ref = g.grant.owner.replace(/^feat:/, '');
		ability = c.feats.find((f) => f.ref === ref)?.abilities?.[0];
	} else if (Array.isArray(own)) {
		// MPMM races let the player choose; most pick their best, so that's what's used.
		ability = [...own].sort((a, b) => scores[b] - scores[a])[0];
	} else ability = own;
	if (!ability || ability === spellAbility(c.classKey)) return null;
	const spellMod = abilityMod(scores[ability]);
	return { ability, name: ABILITY_NAMES[ability], attack: spellAttack({ ...c, spellMod }), dc: spellSaveDC({ ...c, spellMod }) };
}
