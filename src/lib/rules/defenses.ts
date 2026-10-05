import type { Character } from '$lib/types';
import { RACE_MAP } from '$lib/data/races';
import { isActive } from './items';
import { RACE_ABILITIES, type RaceDefenses } from './stats';

export interface Defense {
	kind: 'resistance' | 'immunity';
	/** Lowercase damage type ("fire"), condition ("charmed"), or something wider ("damage from spells"). */
	name: string;
	/** Only some of the time: "while raging". */
	when?: string;
	/** Where it comes from: race, feature or item names. */
	sources: string[];
}

/** A feature that gives a resistance the player picks or that depends on the moment; shown as text. */
export interface DefenseNote {
	source: string;
	text: string;
}

export interface Defenses {
	resistances: Defense[];
	immunities: Defense[];
	notes: DefenseNote[];
}

type DefenseInput = Pick<Character, 'raceKey' | 'subraceKey' | 'classKey' | 'subclassKey' | 'level' | 'items' | 'defenses'>;

/** Suggestions for the player's own entries: damage types, then conditions. */
export const DEFENSE_NAMES = [
	'acid',
	'bludgeoning',
	'cold',
	'fire',
	'force',
	'lightning',
	'necrotic',
	'piercing',
	'poison',
	'psychic',
	'radiant',
	'slashing',
	'thunder',
	'blinded',
	'charmed',
	'deafened',
	'disease',
	'exhaustion',
	'frightened',
	'grappled',
	'paralyzed',
	'petrified',
	'poisoned',
	'prone',
	'restrained',
	'stunned',
	'unconscious'
];

const BPS = 'bludgeoning, piercing and slashing';

interface Feature {
	/** Class key, or 'class/subclass'. */
	from: string;
	level: number;
	source: string;
	resist?: string[];
	immune?: string[];
	when?: string;
	note?: string;
}

/** Class and subclass features that give resistances or immunities (2014 PHB, XGE, TCE and the older subclasses with keys). */
const FEATURES: Feature[] = [
	{ from: 'barbarian', level: 1, source: 'Rage', resist: [BPS], when: 'while raging' },
	{ from: 'barbarian/totem-bear', level: 3, source: 'Totem Spirit (Bear)', resist: ['all damage but psychic'], when: 'while raging' },
	{ from: 'barbarian/berserker', level: 6, source: 'Mindless Rage', immune: ['charmed', 'frightened'], when: 'while raging' },
	{ from: 'barbarian/storm-herald', level: 6, source: 'Storm Soul', note: 'Resistance to fire (desert), lightning (sea) or cold (tundra), by your storm aura.' },
	{ from: 'monk', level: 10, source: 'Purity of Body', immune: ['poison', 'poisoned', 'disease'] },
	{ from: 'paladin', level: 3, source: 'Divine Health', immune: ['disease'] },
	{ from: 'paladin/devotion', level: 7, source: 'Aura of Devotion', immune: ['charmed'], when: 'while conscious' },
	{ from: 'paladin/ancients', level: 7, source: 'Aura of Warding', resist: ['damage from spells'] },
	{ from: 'paladin/oathbreaker', level: 15, source: 'Supernatural Resistance', resist: [`nonmagical ${BPS}`] },
	{ from: 'druid/land', level: 10, source: "Nature's Ward", immune: ['poison', 'poisoned', 'disease'] },
	{ from: 'druid/land', level: 10, source: "Nature's Ward", immune: ['charmed or frightened by elementals or fey'] },
	{ from: 'druid/spores', level: 14, source: 'Fungal Body', immune: ['blinded', 'deafened', 'frightened', 'poisoned'] },
	{ from: 'cleric/forge', level: 6, source: 'Soul of the Forge', resist: ['fire'] },
	{ from: 'cleric/forge', level: 17, source: 'Saint of Forge and Fire', immune: ['fire'] },
	{ from: 'cleric/forge', level: 17, source: 'Saint of Forge and Fire', resist: [`nonmagical ${BPS}`], when: 'in heavy armor' },
	{ from: 'sorcerer/draconic', level: 6, source: 'Elemental Affinity', note: "Spend 1 sorcery point to resist your dragon ancestor's damage type for an hour." },
	{ from: 'sorcerer/storm', level: 6, source: 'Heart of the Storm', resist: ['lightning', 'thunder'] },
	{ from: 'sorcerer/storm', level: 18, source: 'Wind Soul', immune: ['lightning', 'thunder'] },
	{ from: 'sorcerer/aberrant-mind', level: 6, source: 'Psychic Defenses', resist: ['psychic'] },
	{ from: 'warlock/archfey', level: 10, source: 'Beguiling Defenses', immune: ['charmed'] },
	{ from: 'warlock/fiend', level: 10, source: 'Fiendish Resilience', note: 'Resistance to one damage type you choose after each short or long rest (not from magic or silvered weapons).' },
	{ from: 'warlock/great-old-one', level: 10, source: 'Thought Shield', resist: ['psychic'] },
	{ from: 'warlock/celestial', level: 6, source: 'Radiant Soul', resist: ['radiant'] },
	{ from: 'warlock/undead', level: 10, source: 'Necrotic Husk', resist: ['necrotic'] },
	{ from: 'warlock/fathomless', level: 6, source: 'Oceanic Soul', resist: ['cold'] },
	{ from: 'warlock/genie', level: 6, source: 'Elemental Gift', note: "Resistance to your patron's damage type: bludgeoning (dao), thunder (djinni), fire (efreeti) or cold (marid)." },
	{ from: 'wizard/abjuration', level: 14, source: 'Spell Resistance', resist: ['damage from spells'] },
	{ from: 'artificer/alchemist', level: 15, source: 'Chemical Mastery', resist: ['acid', 'poison'], immune: ['poisoned'] }
];

/** Races whose trait means magic can't put them to sleep. */
const MAGIC_SLEEP: Record<string, string> = {
	elf: 'Fey Ancestry',
	'half-elf': 'Fey Ancestry',
	eladrin: 'Trance',
	'sea-elf': 'Trance',
	'shadar-kai': 'Trance'
};

/**
 * Damage resistances, damage and condition immunities from race, class and subclass features, items in use and
 * the player's own list, plus notes for features where the player picks the type. Immunity replaces a resistance to the same thing.
 */
export function defenses(c: DefenseInput): Defenses {
	const found = new Map<string, Defense>();
	const add = (kind: Defense['kind'], name: string, source: string, when?: string) => {
		const key = `${kind}|${name}|${when ?? ''}`;
		const have = found.get(key);
		if (!have) found.set(key, { kind, name, sources: [source], ...(when ? { when } : {}) });
		else if (!have.sources.includes(source)) have.sources.push(source);
	};
	const addAll = (d: RaceDefenses | undefined, source: string) => {
		for (const n of d?.resist ?? []) add('resistance', n, source);
		for (const n of [...(d?.immune ?? []), ...(d?.conditionImmune ?? [])]) add('immunity', n, source);
	};

	const race = c.raceKey ? RACE_ABILITIES[c.raceKey] : undefined;
	const raceName = c.raceKey ? (RACE_MAP.get(c.raceKey)?.name ?? 'Race') : 'Race';
	addAll(race, raceName);
	const subrace = c.subraceKey ? race?.subraces[c.subraceKey] : undefined;
	if (subrace) {
		const subName = RACE_MAP.get(c.raceKey!)?.subraces.find((s) => s.key === c.subraceKey)?.name;
		addAll(subrace, subName ? `${subName} ${raceName}` : raceName);
	}
	if (c.raceKey && MAGIC_SLEEP[c.raceKey]) add('immunity', 'magical sleep', MAGIC_SLEEP[c.raceKey]);

	const notes: DefenseNote[] = [];
	const bear = c.classKey === 'barbarian' && c.subclassKey === 'totem-bear' && c.level >= 3;
	for (const f of FEATURES) {
		const [cls, sub] = f.from.split('/');
		if (cls !== c.classKey || (sub && sub !== c.subclassKey) || c.level < f.level) continue;
		// A bear totem barbarian resists everything but psychic while raging, which covers Rage's own resistance.
		if (bear && f.source === 'Rage') continue;
		for (const n of f.resist ?? []) add('resistance', n, f.source, f.when);
		for (const n of f.immune ?? []) add('immunity', n, f.source, f.when);
		if (f.note) notes.push({ source: f.source, text: f.note });
	}

	for (const i of c.items) if (i.effects && isActive(i)) addAll(i.effects, i.name);
	for (const d of c.defenses ?? []) add(d.kind, d.name.trim().toLowerCase(), d.source?.trim() || 'Your choice');

	const all = [...found.values()];
	const immune = new Set(all.filter((d) => d.kind === 'immunity' && !d.when).map((d) => d.name));
	return {
		resistances: all.filter((d) => d.kind === 'resistance' && !(immune.has(d.name) && !d.when)),
		immunities: all.filter((d) => d.kind === 'immunity'),
		notes
	};
}
