// Builds game data from a local 5etools (2014) checkout. All outputs are committed and bundled in the app:
//   src/lib/data/spells.json    Every PHB/XGE/TCE spell
//   src/lib/data/classes.json   Class and subclass features (PHB/XGE/TCE + three older subclasses)
//   src/lib/data/races.json     PHB, VGM and MPMM races, and Custom Lineage
//   src/lib/data/items.json     DMG/XGE/TCE magic items, including generic variants (+1 Weapon, Flame Tongue)
//   src/lib/data/gear.json      PHB weapons, armor, tools, adventuring gear and packs; DMG poisons, gems and art objects
//   src/lib/data/feats.json     PHB/XGE/TCE feats, with the ability increases, saves, skills, expertise and weapons they give
//   src/lib/data/options.json   Invocations, pact boons, maneuvers, arcane shots, runes, infusions and elemental disciplines
//   src/lib/data/race-abilities.json  Racial ability score increases, darkvision and defenses, small enough to bundle with the app shell
// Usage: npm run data            (expects ../5etools-2014-src)
//        FIVETOOLS_DIR=/path npm run data
import { readFileSync, writeFileSync } from 'node:fs';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const toolsDir = resolve(process.env.FIVETOOLS_DIR ?? join(root, '..', '5etools-2014-src'));
const SOURCES = ['PHB', 'XGE', 'TCE'];

const SCHOOLS = {
	A: 'Abjuration',
	C: 'Conjuration',
	D: 'Divination',
	E: 'Enchantment',
	V: 'Evocation',
	I: 'Illusion',
	N: 'Necromancy',
	T: 'Transmutation'
};

function fail(msg) {
	console.error(msg);
	process.exit(1);
}

const readJson = (p) => JSON.parse(readFileSync(join(toolsDir, 'data', p), 'utf8'));

/** Replace 5etools inline tags ({@damage 8d6}, {@spell fireball|phb|text}) with their display text. */
function stripTags(text) {
	const tag = /\{@(\w+) ?([^{}]*)\}/g;
	let prev;
	do {
		prev = text;
		text = text.replace(tag, (_, name, body) => {
			const parts = body.split('|');
			switch (name) {
				case 'scaledamage':
				case 'scaledice':
					return parts[2] ?? parts[0];
				case 'hit':
					return `+${parts[0]}`;
				case 'dc':
					return `DC ${parts[0]}`;
				case 'chance':
					return `${parts[0]} percent`;
				case 'book':
				case 'filter':
				case '5etools':
					return parts[0];
				case 'quickref':
					return parts[4] || parts[0];
				default:
					return parts[2] || parts[0];
			}
		});
	} while (text !== prev);
	return text;
}

/** Flatten 5etools entry trees into plain paragraphs. */
function flatten(entries, out = []) {
	for (const e of entries ?? []) {
		if (typeof e === 'string') out.push(stripTags(e));
		else if (e.type === 'entries' || e.type === 'inset' || e.type === 'section') {
			const inner = flatten(e.entries);
			if (e.name && inner.length) inner[0] = `${stripTags(e.name)}. ${inner[0]}`;
			out.push(...inner);
		} else if (e.type === 'list') {
			for (const item of e.items ?? []) {
				if (typeof item === 'string') out.push(`• ${stripTags(item)}`);
				else if (item.type === 'item') {
					const body = item.entry ? stripTags(item.entry) : flatten(item.entries).join(' ');
					// Most item names end in a period already ("Fiend."); MPMM's don't ("Radiant Soul").
					const name = item.name ? stripTags(item.name).replace(/([^.:!?])$/, '$1.') + ' ' : '';
					out.push(`• ${name}${body}`);
				} else out.push(...flatten([item]).map((t) => `• ${t}`));
			}
		} else if (e.type === 'table') {
			if (e.caption) out.push(stripTags(e.caption));
			if (e.colLabels) out.push(e.colLabels.map(stripTags).join(' | '));
			for (const row of e.rows ?? []) {
				const cells = Array.isArray(row) ? row : (row.row ?? []);
				out.push(cells.map((c) => (typeof c === 'string' ? stripTags(c) : flatten([c]).join(' '))).join(' | '));
			}
		} else if (e.type === 'refClassFeature' || e.type === 'refSubclassFeature') {
			const id = e.classFeature ?? e.subclassFeature;
			const rec = e.classFeature ? findClassFeature(id) : findSubclassFeature(id);
			if (!refSources.has(rec.source)) continue;
			const inner = flatten(rec.entries);
			if (inner.length) inner[0] = `${stripTags(rec.name)}. ${inner[0]}`;
			out.push(...inner);
		} else if (e.type === 'refOptionalfeature') {
			const [name, src = 'PHB'] = e.optionalfeature.split('|');
			if (!SOURCES.includes(src.toUpperCase())) continue;
			const rec = optionalFeatureIndex.get(`${name}|${src}`.toLowerCase());
			if (!rec) fail(`Optional feature not found: ${e.optionalfeature}`);
			out.push(`• ${stripTags(rec.name)}. ${flatten(rec.entries).join(' ')}`);
		} else if (e.type === 'abilityDc') {
			out.push(`${e.name} save DC = 8 + your proficiency bonus + your ${abilityNames(e.attributes)} modifier`);
		} else if (e.type === 'abilityAttackMod') {
			out.push(`${e.name} attack modifier = your proficiency bonus + your ${abilityNames(e.attributes)} modifier`);
		} else if (e.type === 'quote') {
			out.push(...flatten(e.entries));
		} else if (e.entries) {
			out.push(...flatten(e.entries));
		}
	}
	return out;
}

const ABILITIES = { str: 'Strength', dex: 'Dexterity', con: 'Constitution', int: 'Intelligence', wis: 'Wisdom', cha: 'Charisma' };
const abilityNames = (attrs) => attrs.map((a) => ABILITIES[a] ?? a).join(' or ');

// Class/subclass feature records from every class file, for resolving refClassFeature/refSubclassFeature.
// Ids: Name|Class|ClassSource|Level[|Source] and Name|Class|ClassSource|SubclassShort|SubclassSource|Level[|Source];
// empty sources default to PHB, and a missing feature source to the class (or subclass) source.
const classFeatureIndex = new Map();
const subclassFeatureIndex = new Map();
const classFiles = {};
// Maneuvers, fighting styles, invocations, metamagic, infusions…, keyed by name|source.
const optionalFeatureIndex = new Map();
for (const f of readJson('optionalfeatures.json').optionalfeature)
	if (SOURCES.includes(f.source)) addToIndex(optionalFeatureIndex, `${f.name}|${f.source}`.toLowerCase(), f);

function addToIndex(index, key, rec) {
	if (index.has(key)) fail(`Duplicate 5etools record: ${key}`);
	index.set(key, rec);
}
// Sources a ref may pull text from; widened per subclass so SCAG/DMG/VRGR subclasses keep their own features.
let refSources = new Set(SOURCES);

const classFeatureKey = (name, cls, clsSrc, level, src) => [name, cls, clsSrc, level, src].join('|').toLowerCase();
const subclassFeatureKey = (name, cls, clsSrc, sub, subSrc, level, src) =>
	[name, cls, clsSrc, sub, subSrc, level, src].join('|').toLowerCase();

function findClassFeature(id) {
	const [name, cls, clsSrc = '', level, src = ''] = id.split('|');
	const classSource = clsSrc || 'PHB';
	const rec = classFeatureIndex.get(classFeatureKey(name, cls, classSource, level, src || classSource));
	if (!rec) fail(`Class feature not found: ${id}`);
	return rec;
}

function findSubclassFeature(id) {
	const [name, cls, clsSrc = '', sub, subSrc = '', level, src = ''] = id.split('|');
	const subclassSource = subSrc || 'PHB';
	const key = subclassFeatureKey(name, cls, clsSrc || 'PHB', sub, subclassSource, level, src || subclassSource);
	const rec = subclassFeatureIndex.get(key);
	if (!rec) fail(`Subclass feature not found: ${id}`);
	return rec;
}

function castingTime(time) {
	const t = time?.[0];
	if (!t) return '';
	const unit = t.unit === 'bonus' ? 'bonus action' : t.unit;
	const plural = t.number > 1 && !['action', 'bonus action', 'reaction'].includes(unit) ? 's' : '';
	return `${t.number} ${unit}${plural}`;
}

function distance(d) {
	if (!d) return '';
	if (['self', 'touch', 'sight', 'unlimited'].includes(d.type)) return d.type[0].toUpperCase() + d.type.slice(1);
	const unit = d.type === 'feet' ? 'ft' : d.type === 'miles' ? (d.amount === 1 ? 'mile' : 'miles') : d.type;
	return `${d.amount} ${unit}`;
}

function range(r) {
	if (!r) return '';
	if (r.type === 'point') return distance(r.distance);
	if (r.type === 'special') return 'Special';
	// Area shapes centred on the caster: radius, cone, line, cube, sphere, hemisphere, cylinder.
	const size = r.distance ? `${r.distance.amount}-${r.distance.type === 'feet' ? 'ft' : r.distance.type}` : '';
	return `Self (${size} ${r.type})`;
}

function duration(list) {
	const d = list?.[0];
	if (!d) return '';
	switch (d.type) {
		case 'instant':
			return 'Instantaneous';
		case 'permanent':
			return d.ends?.includes('trigger') ? 'Until dispelled or triggered' : 'Until dispelled';
		case 'special':
			return 'Special';
		case 'timed': {
			const { type, amount } = d.duration;
			const text = `${amount} ${type}${amount > 1 ? 's' : ''}`;
			return d.concentration ? `Concentration, up to ${text}` : text;
		}
		default:
			return '';
	}
}

function components(c) {
	if (!c) return '';
	const parts = [];
	if (c.v) parts.push('V');
	if (c.s) parts.push('S');
	if (c.m) parts.push(`M (${typeof c.m === 'string' ? c.m : c.m.text})`);
	return parts.join(', ');
}

const lookup = readJson('generated/gendata-spell-source-lookup.json');

function classesFor(source, name) {
	const entry = lookup[source.toLowerCase()]?.[name.toLowerCase()];
	const names = new Set();
	for (const bySource of [entry?.class, entry?.classVariant]) {
		for (const classes of Object.values(bySource ?? {})) {
			for (const cls of Object.keys(classes)) names.add(cls.toLowerCase());
		}
	}
	return [...names].sort();
}

function convert(s, name = s.name) {
	const higher = flatten(s.entriesHigherLevel?.flatMap((e) => e.entries) ?? []).join('\n');
	return {
			id: `${s.name}|${s.source}`.toLowerCase(),
			name,
			source: s.source,
			level: s.level,
			school: SCHOOLS[s.school] ?? s.school,
			time: castingTime(s.time),
			range: range(s.range),
			components: components(s.components),
			duration: duration(s.duration),
			concentration: !!s.duration?.some((d) => d.concentration),
			ritual: !!s.meta?.ritual,
			classes: classesFor(s.source, s.name),
			text: flatten(s.entries).join('\n'),
			...(higher ? { higher } : {})
	};
}

const bySort = (a, b) => a.level - b.level || a.name.localeCompare(b.name);
const MIN_SPELLS = 477;
const all = [];
for (const source of SOURCES) {
	const file = readJson(`spells/spells-${source.toLowerCase()}.json`);
	for (const s of file.spell) all.push(convert(s));
}
all.sort(bySort);
if (all.length < MIN_SPELLS) fail(`Expected at least ${MIN_SPELLS} spells, found ${all.length}. Is the 5etools checkout up to date?`);

const out = join(root, 'src/lib/data/spells.json');
writeFileSync(out, JSON.stringify(all));
console.log(`Wrote ${all.length} spells to ${out}`);

// ---------------------------------------------------------------------------------------------
// Classes

// 5etools class files, keyed by our class key. The class entry used is the PHB one (artificer: TCE).
const CLASS_SOURCES = {
	artificer: 'TCE',
	barbarian: 'PHB',
	bard: 'PHB',
	cleric: 'PHB',
	druid: 'PHB',
	fighter: 'PHB',
	monk: 'PHB',
	paladin: 'PHB',
	ranger: 'PHB',
	rogue: 'PHB',
	sorcerer: 'PHB',
	warlock: 'PHB',
	wizard: 'PHB'
};

// 5etools `shortName|source` → our subclass key(s) in src/lib/data/classes.ts. Existing keys never change.
// Every PHB/XGE/TCE subclass must appear; older sources only where we already had a key.
const SUBCLASS_KEYS = {
	Artificer: { 'Alchemist|TCE': 'alchemist', 'Armorer|TCE': 'armorer', 'Artillerist|TCE': 'artillerist', 'Battle Smith|TCE': 'battle-smith' },
	Barbarian: {
		'Berserker|PHB': 'berserker',
		'Totem Warrior|PHB': ['totem-bear', 'totem-eagle', 'totem-wolf'],
		'Ancestral Guardian|XGE': 'ancestral',
		'Storm Herald|XGE': 'storm-herald',
		'Zealot|XGE': 'zealot',
		'Beast|TCE': 'beast',
		'Wild Magic|TCE': 'wild-magic'
	},
	Bard: {
		'Lore|PHB': 'lore',
		'Valor|PHB': 'valor',
		'Glamour|XGE': 'glamour',
		'Swords|XGE': 'swords',
		'Whispers|XGE': 'whispers',
		'Creation|TCE': 'creation',
		'Eloquence|TCE': 'eloquence'
	},
	Cleric: {
		'Knowledge|PHB': 'knowledge',
		'Life|PHB': 'life',
		'Light|PHB': 'light',
		'Nature|PHB': 'nature',
		'Tempest|PHB': 'tempest',
		'Trickery|PHB': 'trickery',
		'War|PHB': 'war',
		'Arcana|SCAG': 'arcana',
		'Forge|XGE': 'forge',
		'Grave|XGE': 'grave',
		'Order|TCE': 'order',
		'Peace|TCE': 'peace',
		'Twilight|TCE': 'twilight'
	},
	Druid: {
		'Land|PHB': 'land',
		'Moon|PHB': 'moon',
		'Dreams|XGE': 'dreams',
		'Shepherd|XGE': 'shepherd',
		'Spores|TCE': 'spores',
		'Stars|TCE': 'stars',
		'Wildfire|TCE': 'wildfire'
	},
	Fighter: {
		'Battle Master|PHB': 'battle-master',
		'Champion|PHB': 'champion',
		'Eldritch Knight|PHB': 'eldritch-knight',
		'Arcane Archer|XGE': 'arcane-archer',
		'Cavalier|XGE': 'cavalier',
		'Samurai|XGE': 'samurai',
		'Psi Warrior|TCE': 'psi-warrior',
		'Rune Knight|TCE': 'rune-knight'
	},
	Monk: {
		'Shadow|PHB': 'shadow',
		'Four Elements|PHB': 'four-elements',
		'Open Hand|PHB': 'open-hand',
		'Drunken Master|XGE': 'drunken-master',
		'Kensei|XGE': 'kensei',
		'Sun Soul|XGE': 'sun-soul',
		'Mercy|TCE': 'mercy',
		'Astral Self|TCE': 'astral-self'
	},
	Paladin: {
		'Devotion|PHB': 'devotion',
		'Ancients|PHB': 'ancients',
		'Vengeance|PHB': 'vengeance',
		'Oathbreaker|DMG': 'oathbreaker',
		'Conquest|XGE': 'conquest',
		'Redemption|XGE': 'redemption',
		'Glory|TCE': 'glory',
		'Watchers|TCE': 'watchers'
	},
	Ranger: {
		'Beast Master|PHB': 'beast-master',
		'Hunter|PHB': 'hunter',
		'Gloom Stalker|XGE': 'gloom-stalker',
		'Horizon Walker|XGE': 'horizon-walker',
		'Monster Slayer|XGE': 'monster-slayer',
		'Fey Wanderer|TCE': 'fey-wanderer',
		'Swarmkeeper|TCE': 'swarmkeeper'
	},
	Rogue: {
		'Arcane Trickster|PHB': 'arcane-trickster',
		'Assassin|PHB': 'assassin',
		'Thief|PHB': 'thief',
		'Inquisitive|XGE': 'inquisitive',
		'Mastermind|XGE': 'mastermind',
		'Scout|XGE': 'scout',
		'Swashbuckler|XGE': 'swashbuckler',
		'Phantom|TCE': 'phantom',
		'Soulknife|TCE': 'soulknife'
	},
	Sorcerer: {
		'Draconic|PHB': 'draconic',
		'Wild|PHB': 'wild-magic',
		'Divine Soul|XGE': 'divine-soul',
		'Shadow|XGE': 'shadow',
		'Storm|XGE': 'storm',
		'Aberrant Mind|TCE': 'aberrant-mind',
		'Clockwork Soul|TCE': 'clockwork-soul'
	},
	Warlock: {
		'Archfey|PHB': 'archfey',
		'Fiend|PHB': 'fiend',
		'Great Old One|PHB': 'great-old-one',
		'Celestial|XGE': 'celestial',
		'Hexblade|XGE': 'hexblade',
		'Fathomless|TCE': 'fathomless',
		'Genie|TCE': 'genie',
		'Undead|VRGR': 'undead'
	},
	Wizard: {
		'Abjuration|PHB': 'abjuration',
		'Conjuration|PHB': 'conjuration',
		'Divination|PHB': 'divination',
		'Enchantment|PHB': 'enchantment',
		'Evocation|PHB': 'evocation',
		'Illusion|PHB': 'illusion',
		'Necromancy|PHB': 'necromancy',
		'Transmutation|PHB': 'transmutation',
		'War|XGE': 'war-magic',
		'Bladesinging|TCE': 'bladesinging',
		'Scribes|TCE': 'scribes'
	}
};

for (const key of Object.keys(CLASS_SOURCES)) {
	const file = readJson(`class/class-${key}.json`);
	classFiles[key] = file;
	for (const f of file.classFeature ?? [])
		addToIndex(classFeatureIndex, classFeatureKey(f.name, f.className, f.classSource, f.level, f.source), f);
	for (const f of file.subclassFeature ?? [])
		addToIndex(
			subclassFeatureIndex,
			subclassFeatureKey(f.name, f.className, f.classSource, f.subclassShortName, f.subclassSource, f.level, f.source),
			f
		);
}

const featureText = (rec) => flatten(rec.entries).join('\n');

const classesOut = {};
for (const [key, source] of Object.entries(CLASS_SOURCES)) {
	const file = classFiles[key];
	const cls = file.class.find((c) => c.source === source);
	if (!cls) fail(`No ${source} class entry in class-${key}.json`);

	refSources = new Set(SOURCES);
	// Only the first gainSubclassFeature row (the subclass choice) is kept; later ones are "Path feature" placeholders.
	const firstSubclassRow = cls.classFeatures.findIndex((ref) => ref.gainSubclassFeature);
	const classFeatureRefs = cls.classFeatures.filter((ref, i) => !ref.gainSubclassFeature || i === firstSubclassRow);
	const features = classFeatureRefs.map((ref) => {
		const rec = findClassFeature(typeof ref === 'string' ? ref : ref.classFeature);
		return {
			name: stripTags(rec.name),
			level: rec.level,
			text: featureText(rec),
			...(rec.isClassFeatureVariant ? { optional: true } : {})
		};
	});

	const table = SUBCLASS_KEYS[cls.name];
	if (!table) fail(`No subclass keys for ${cls.name}`);
	const subclasses = {};
	const seen = new Set();
	for (const sc of file.subclass) {
		if (sc.className !== cls.name || sc.classSource !== cls.source) continue;
		const id = `${sc.shortName}|${sc.source}`;
		const keys = table[id];
		if (!keys) {
			if (SOURCES.includes(sc.source)) fail(`${cls.name} subclass ${id} has no key in SUBCLASS_KEYS`);
			continue;
		}
		seen.add(id);
		refSources = new Set([...SOURCES, sc.source]);
		const list = sc.subclassFeatures.map((ref) => {
			const rec = findSubclassFeature(typeof ref === 'string' ? ref : ref.subclassFeature);
			return { name: stripTags(rec.name), level: rec.level, text: featureText(rec) };
		});
		for (const k of [keys].flat()) subclasses[k] = list;
	}
	for (const id of Object.keys(table)) if (!seen.has(id)) fail(`${cls.name} subclass ${id} is not in the 5etools data`);

	classesOut[key] = { name: cls.name, features, subclasses };
}
refSources = new Set(SOURCES);

const MIN_CLASSES = 13;
const classCount = Object.keys(classesOut).length;
if (classCount < MIN_CLASSES) fail(`Expected at least ${MIN_CLASSES} classes, found ${classCount}.`);
const classesPath = join(root, 'src/lib/data/classes.json');
writeFileSync(classesPath, JSON.stringify(classesOut));
const subclassCount = Object.values(classesOut).reduce((n, c) => n + Object.keys(c.subclasses).length, 0);
console.log(`Wrote ${classCount} classes (${subclassCount} subclass keys) to ${classesPath}`);


// ---------------------------------------------------------------------------------------------
// Races

const raceFile = readJson('races.json');
const slug = (name) => name.toLowerCase().replace(/[^a-z0-9]+/g, '-');
const traitsOf = (entries) =>
	(entries ?? [])
		.filter((e) => typeof e === 'object' && e.name)
		.map((e) => ({ name: stripTags(e.name), text: flatten(e.entries).join('\n') }));

const NUMBERS = ['', 'One', 'Two', 'Three'];

/** "Your Constitution score increases by 2, and your Wisdom score increases by 1." from 5etools `ability`. */
function abilityText(ability) {
	const parts = [];
	for (const set of ability ?? []) {
		const fixed = Object.entries(set).filter(([k]) => k !== 'choose');
		if (fixed.length === 6 && fixed.every(([, n]) => n === fixed[0][1])) parts.push(`Your ability scores each increase by ${fixed[0][1]}`);
		else for (const [k, n] of fixed) parts.push(`Your ${ABILITIES[k]} score increases by ${n}`);
		if (set.choose) {
			const { from, count = 1, amount = 1 } = set.choose;
			const names = from.map((a) => ABILITIES[a]);
			const any = from.length === 6 ? '' : ` (from ${names.slice(0, -1).join(', ')} or ${names.at(-1)})`;
			const which = count === 1 ? 'One ability score' : `${NUMBERS[count] ?? count} different ability scores`;
			parts.push(`${which} of your choice${any} ${count === 1 ? 'increases' : 'increase'} by ${amount}`);
		}
	}
	const lower = (t) => t[0].toLowerCase() + t.slice(1);
	return parts.length ? `${[parts[0], ...parts.slice(1).map(lower)].join(', and ')}.` : '';
}

const walkSpeed = (speed) => (typeof speed === 'number' ? speed : speed?.walk);

/** Named entries, plus Ability Score Increase and Speed from structured fields when no entry covers them. */
function traitsWithStats(entries, { ability, asiText, speed, speedText, abilityPrefix = '' }) {
	const traits = traitsOf(entries);
	const extra = [];
	const asi = asiText ?? abilityText(ability);
	if (asi && !traits.some((t) => t.name === 'Ability Score Increase'))
		extra.push({ name: 'Ability Score Increase', text: abilityPrefix ? abilityPrefix + asi[0].toLowerCase() + asi.slice(1) : asi });
	const named = traits.find((t) => t.name === 'Speed');
	// Dwarf's named Speed entry only says heavy armor doesn't slow you, so it still gets the number.
	if (named && speed && !named.text.includes('feet')) named.text = `${speedText}\n${named.text}`;
	else if (!named && speed && speedText) extra.push({ name: 'Speed', text: speedText });
	return [...extra, ...traits];
}

const SAVES = { Dex: 'Dexterity', Con: 'Constitution' };
function dragonAncestries(race) {
	const ancestry = race.entries.find((e) => e.name === 'Draconic Ancestry');
	const table = ancestry?.entries.find((e) => e.type === 'table');
	if (!table) fail('Dragonborn has no Draconic Ancestry table');
	return table.rows.map(([dragon, damage, breath]) => {
		const m = /^(.*) \((Dex|Con)\. save\)$/.exec(breath);
		if (!m) fail(`Unexpected breath weapon: ${breath}`);
		const type = damage.toLowerCase();
		return {
			key: dragon.toLowerCase(),
			name: dragon,
			traits: [
				{
					name: 'Draconic Ancestry',
					text: `${dragon} dragon. You have resistance to ${type} damage. Your breath weapon deals ${type} damage in a ${m[1]} (${SAVES[m[2]]} saving throw).`
				}
			]
		};
	});
}

// PHB races, Custom Lineage (TCE), then Volo's and Monsters of the Multiverse. MPMM reprints every VGM race,
// so the MPMM version takes the plain key and the VGM one gets a -vgm suffix. Keys are stored on characters.
const RACE_BOOKS = ['PHB', 'TCE', 'VGM', 'MPMM'];
const raceKey = (r) => slug(r.name) + (r.source === 'VGM' ? '-vgm' : '');
const subraceKey = (s) => s.name.split(/[ ;]/)[0].toLowerCase();
const raceList = raceFile.race
	.filter((r) => (['PHB', 'VGM', 'MPMM'].includes(r.source) && !r._copy) || (r.name === 'Custom Lineage' && r.source === 'TCE'))
	.sort((a, b) => RACE_BOOKS.indexOf(a.source) - RACE_BOOKS.indexOf(b.source) || a.name.localeCompare(b.name));
const subracesOf = (r) => raceFile.subrace.filter((s) => s.source === r.source && s.raceName === r.name && s.raceSource === r.source);

// MPMM races (lineage "VRGR") have no fixed increases: +2 and +1, or +1 to three different scores.
const ALL_ABILITIES = Object.keys(ABILITIES);
const LINEAGE_ASI = { fixed: {}, choose: { from: ALL_ABILITIES, count: 3, amount: 1, max: 2 } };
const LINEAGE_TEXT = 'Increase one ability score by 2 and a different one by 1, or increase three different ability scores by 1.';
const flexible = (r) => r.lineage === 'VRGR';

const racesOut = raceList.map((r) => {
	const subraces = subracesOf(r);
	// The unnamed PHB subrace holds the standard version's stats (e.g. Human's +1 to every score).
	const standard = subraces.find((s) => !s.name);
	const ability = r.ability ?? standard?.ability;
	const speed = walkSpeed(r.speed);
	const words = (text) => text.split('\n').join(' ').toLowerCase();
	return {
		key: raceKey(r),
		name: r.name,
		source: r.source,
		traits: traitsWithStats(r.entries, {
			ability,
			asiText: flexible(r) ? LINEAGE_TEXT : undefined,
			speed,
			speedText: `Your base walking speed is ${speed} feet.`
		}),
		subraces:
			r.name === 'Dragonborn'
				? dragonAncestries(r)
				: subraces
						.filter((s) => s.name)
						.map((s) => {
							const subSpeed = walkSpeed(s.speed);
							// Wood Elf's Fleet of Foot already says it; only add a Speed trait when nothing mentions it.
							const mentionsSpeed = traitsOf(s.entries).some((t) => words(t.text).includes('walking speed'));
							return {
								key: subraceKey(s),
								name: s.name,
								traits: traitsWithStats(s.entries, {
									ability: s.ability,
									abilityPrefix: !r.ability && standard?.ability ? 'Instead of the standard increase, ' : '',
									speed: subSpeed !== speed && !mentionsSpeed ? subSpeed : undefined,
									speedText: `Your base walking speed is ${subSpeed} feet.`
								})
							};
						})
	};
});

// Racial ability score increases, darkvision, damage resistances and immunities and Powerful Build, by race key then subrace
// key. `replaces` marks subraces whose increase is instead of the race's (Variant Human), not on top of it.
// `resist`, `immune` and `conditionImmune` are lowercase damage types and conditions, on top of the race's.
function asiOf(ability) {
	const set = ability?.[0];
	if (!set) return undefined;
	const fixed = Object.fromEntries(Object.entries(set).filter(([k]) => k !== 'choose'));
	const out = { fixed };
	if (set.choose) out.choose = { from: set.choose.from, count: set.choose.count ?? 1, amount: set.choose.amount ?? 1 };
	return out;
}

/**
 * `{ resist, immune, conditionImmune }` from a 5etools race, subrace or item, keeping only fixed entries
 * (choices like a Dragonborn's are worked out elsewhere).
 */
function defensesOf(x) {
	const out = {};
	for (const k of ['resist', 'immune', 'conditionImmune']) {
		const fixed = (x[k] ?? []).filter((v) => typeof v === 'string');
		if (fixed.length) out[k] = fixed;
	}
	return out;
}

const raceAbilities = {};
for (const r of raceList) {
	const subraces = subracesOf(r);
	const standard = subraces.find((s) => !s.name);
	const entry = { asi: flexible(r) ? LINEAGE_ASI : asiOf(r.ability ?? standard?.ability), subraces: {} };
	// Custom Lineage's darkvision is one of two choices, so the player adds it themselves.
	if (r.darkvision && r.name !== 'Custom Lineage') entry.darkvision = r.darkvision;
	Object.assign(entry, defensesOf(r));
	// Powerful Build, Little Giant, Equine Build: one size larger for carrying capacity.
	const traits = racesOut.find((x) => x.key === raceKey(r)).traits;
	if (traits.some((t) => /count as one size larger when determining your carrying/.test(t.text))) entry.powerfulBuild = true;
	for (const s of subraces.filter((s) => s.name && (s.ability || s.darkvision || Object.keys(defensesOf(s)).length))) {
		entry.subraces[subraceKey(s)] = {
			...(s.ability ? { asi: asiOf(s.ability) } : {}),
			...(s.ability && !r.ability && standard?.ability ? { replaces: true } : {}),
			...(s.darkvision ? { darkvision: s.darkvision } : {}),
			...defensesOf(s)
		};
	}
	// Dragonborn resist their ancestry's damage type (5etools has it as a choice, the ancestry table has the answer).
	if (r.name === 'Dragonborn') {
		for (const a of racesOut.find((x) => x.key === raceKey(r)).subraces) {
			const type = /resistance to (\w+) damage/.exec(a.traits[0].text)?.[1] ?? fail(`No resistance for ${a.name} dragonborn`);
			entry.subraces[a.key] = { resist: [type] };
		}
	}
	raceAbilities[raceKey(r)] = entry;
}
const raceAbilitiesPath = join(root, 'src/lib/data/race-abilities.json');
writeFileSync(raceAbilitiesPath, JSON.stringify(raceAbilities));
console.log(`Wrote racial ability increases, darkvision and defenses to ${raceAbilitiesPath}`);

const MIN_RACES = 53;
if (racesOut.length < MIN_RACES) fail(`Expected at least ${MIN_RACES} races, found ${racesOut.length}.`);
const racesPath = join(root, 'src/lib/data/races.json');
writeFileSync(racesPath, JSON.stringify(racesOut));
console.log(`Wrote ${racesOut.length} races to ${racesPath}`);

// ---------------------------------------------------------------------------------------------
// Magic items

const ITEM_SOURCES = ['DMG', 'XGE', 'TCE'];
const ITEM_TYPES = {
	RG: 'Ring',
	WD: 'Wand',
	RD: 'Rod',
	SC: 'Scroll',
	P: 'Potion',
	A: 'Ammunition',
	S: 'Armor (shield)'
};
const baseName = (ref) => ref?.split('|')[0].toLowerCase();

function itemType(i) {
	const code = i.type?.split('|')[0];
	if (i.staff) return 'Staff';
	if (ITEM_TYPES[code]) return ITEM_TYPES[code];
	if (code === 'M' || code === 'R') return i.baseItem ? `Weapon (${baseName(i.baseItem)})` : 'Weapon';
	if (['LA', 'MA', 'HA'].includes(code)) return i.baseItem ? `Armor (${baseName(i.baseItem)})` : 'Armor';
	if (i.wondrous) return i.tattoo ? 'Wondrous item (tattoo)' : 'Wondrous item';
	if (code === 'SCF') return 'Spellcasting focus';
	if (code === 'INS') return 'Instrument';
	fail(`No type label for item ${i.name} (${i.type})`);
}

// Generic variants say what they apply to in `requires`, e.g. [{ sword: true }] → "Weapon (any sword)".
function variantType(v) {
	const req = v.requires ?? [];
	const has = (k) => req.some((r) => r[k]);
	const types = req.map((r) => r.type?.split('|')[0]);
	if (has('weapon')) return 'Weapon (any)';
	if (has('axe') && has('sword')) return 'Weapon (any axe or sword)';
	if (has('sword')) return req.some((r) => r.dmgType === 'S') ? 'Weapon (any sword that deals slashing damage)' : 'Weapon (any sword)';
	if (has('axe')) return 'Weapon (any axe)';
	if (has('armor')) return 'Armor (any)';
	if (types.includes('HA') && types.includes('MA')) return 'Armor (medium or heavy)';
	if (types.includes('S')) return 'Armor (shield)';
	if (has('arrow') && has('bolt')) return 'Ammunition (arrow or bolt)';
	if (types.includes('A')) return 'Ammunition (any)';
	fail(`No type label for variant ${v.name}: ${JSON.stringify(req)}`);
}

function attunement(req) {
	if (!req) return undefined;
	return req === true ? '' : stripTags(req);
}

/** "all" when every charge comes back, else the amount ("3", "1d6 + 1"). */
function regain(i) {
	if (!i.recharge) return undefined;
	if (i.rechargeAmount === undefined) return 'all';
	return String(typeof i.rechargeAmount === 'number' ? i.rechargeAmount : stripTags(i.rechargeAmount));
}

// Shared text some items pull in with `{#itemEntry Name|Source}`, with `{{item.resist}}` placeholders for their own fields.
const itemEntries = new Map(readJson('items-base.json').itemEntry.map((e) => [e.name, e.entriesTemplate]));
const itemField = (i, k) => {
	if (i[k] === undefined) fail(`Item ${i.name} has no ${k}`);
	return [i[k]].flat().join(', ');
};

function itemEntriesOf(i) {
	return (i.entries ?? []).flatMap((e) => {
		const ref = typeof e === 'string' && /^\{#itemEntry ([^|}]+)(?:\|[^}]*)?\}$/.exec(e);
		if (!ref) return [e];
		const template = itemEntries.get(ref[1]) ?? fail(`Item ${i.name}: no itemEntry ${ref[1]}`);
		return template.map((t) => (typeof t === 'string' ? t.replace(/\{\{item\.(\w+)\}\}/g, (_, k) => itemField(i, k)) : t));
	});
}

const ARMOR_KINDS = { LA: 'light', MA: 'medium', HA: 'heavy', S: 'shield' };

/** `{ type: 'medium', ac: 14 }` for armor and shields with a known base AC. */
function armorOf(i) {
	const kind = ARMOR_KINDS[i.type?.split('|')[0]];
	return kind && typeof i.ac === 'number' ? { type: kind, ac: i.ac } : undefined;
}

const bonus = (v) => (v ? Number(String(v).replace('+', '')) : 0);

const WEAPON_DAMAGE = { S: 'slashing', P: 'piercing', B: 'bludgeoning' };
const WEAPON_PROPERTIES = {
	A: 'ammunition',
	F: 'finesse',
	H: 'heavy',
	L: 'light',
	LD: 'loading',
	R: 'reach',
	S: 'special',
	T: 'thrown',
	'2H': 'two-handed',
	V: 'versatile'
};
// Arcane and druidic focus staffs fight as quarterstaffs.
const WEAPON_BASE = { staff: 'quarterstaff', 'wooden staff': 'quarterstaff' };

/**
 * Structured weapon stats for attacks: `{ base, category, ranged, damage, damageType, properties, versatile?, range? }`.
 * `base` is the PHB weapon's lowercase name, which proficiency is checked against.
 */
/**
 * What a container holds: `lb` of gear (coins at 50 to the pound) and whether its contents weigh nothing
 * (Bag of Holding). Containers that only list item counts (quivers, map cases) are left out unless weightless.
 * A Portable Hole has no listed limit, just room.
 */
function containerOf(i) {
	if (i.name === 'Portable Hole') return { weightless: true };
	const cap = i.containerCapacity;
	if (!cap) return undefined;
	const lb = (cap.weight ?? []).reduce((n, w) => n + w, 0);
	if (!lb && !cap.weightless) return undefined;
	return { ...(lb ? { lb } : {}), ...(cap.weightless ? { weightless: true } : {}) };
}

function weaponOf(i) {
	if (!i.weaponCategory) return undefined;
	const code = i.type?.split('|')[0];
	if (code === 'A') return undefined;
	const name = i.name.toLowerCase();
	const range = /^(\d+)\/(\d+)$/.exec(i.range ?? '');
	const properties = (i.property ?? []).map((p) => WEAPON_PROPERTIES[p.split('|')[0]] ?? fail(`Unknown weapon property ${p} on ${i.name}`));
	return {
		base: WEAPON_BASE[name] ?? name,
		category: i.weaponCategory,
		ranged: code === 'R',
		damage: i.dmg1 ?? '',
		damageType: i.dmg1 ? (WEAPON_DAMAGE[i.dmgType] ?? fail(`Unknown damage type ${i.dmgType} on ${i.name}`)) : '',
		properties,
		...(i.dmg2 ? { versatile: i.dmg2 } : {}),
		...(range ? { range: [Number(range[1]), Number(range[2])] } : {})
	};
}

const baseWeapons = new Map(
	readJson('items-base.json')
		.baseitem.filter((i) => i.source === 'PHB')
		.map((i) => [i.name.toLowerCase(), weaponOf(i)])
		.filter(([, w]) => w)
);

/**
 * What an item does to the character's numbers while it's in use (attuned, or worn for armor).
 * Ability changes only count for items you attune to; tomes, manuals and potions are one-offs the
 * player adds to their base scores.
 */
function itemEffects(i, type, text) {
	const e = {};
	const ab = i.ability;
	if (ab && i.reqAttune) {
		if (ab.static) e.set = { ...ab.static };
		const add = Object.fromEntries(Object.entries(ab).filter(([k, v]) => ABILITIES[k] && typeof v === 'number'));
		if (Object.keys(add).length) {
			e.add = add;
			e.addMax = Number(/maximum of (\d+)/.exec(text)?.[1] ?? 20);
		}
	}
	// A Defender's AC bonus is whatever the wielder moves over, so weapons are left to the player. A Rod of
	// Alertness only gives its bonus for 10 minutes after it's planted, so that's a note, not an effect.
	if (bonus(i.bonusAc) && !type.startsWith('Weapon') && i.name !== 'Rod of Alertness') e.ac = bonus(i.bonusAc);
	// Attack and damage bonuses only count on weapons; ammunition's goes on the shot, which the player adds themselves.
	if (type.startsWith('Weapon')) {
		const attack = bonus(i.bonusWeapon) + bonus(i.bonusWeaponAttack);
		const damage = bonus(i.bonusWeapon) + bonus(i.bonusWeaponDamage);
		if (attack) e.attack = attack;
		if (damage) e.damage = damage;
	}
	if (bonus(i.bonusSpellAttack)) e.spellAttack = bonus(i.bonusSpellAttack);
	if (bonus(i.bonusSpellSaveDc)) e.spellDc = bonus(i.bonusSpellSaveDc);
	if (i.name === 'Bracers of Defense') e.unarmoredOnly = true;
	// Damage resistances and immunities while the item is in use. Potions last an hour after drinking, so
	// carrying one doesn't count.
	if (i.type?.split('|')[0] !== 'P') Object.assign(e, defensesOf(i));
	return e;
}

function convertItem(i, type) {
	const attune = attunement(i.reqAttune);
	const charges = typeof i.charges === 'number' ? i.charges : undefined;
	const text = flatten(itemEntriesOf(i)).join('\n');
	const effects = itemEffects(i, type, text);
	const armor = armorOf(i) ?? (type === 'Armor (shield)' ? { type: 'shield', ac: 2 } : undefined);
	// Magic weapons of a set kind (Dagger of Venom) fight as that weapon; generic ones (+1 Weapon) wait for the player to pick.
	const weapon = type.startsWith('Weapon') && i.baseItem ? baseWeapons.get(baseName(i.baseItem)) : undefined;
	if (type.startsWith('Weapon') && i.baseItem && !weapon) fail(`${i.name}: no PHB weapon ${i.baseItem}`);
	return {
		id: `${i.name}|${i.source}`.toLowerCase(),
		name: i.name,
		source: i.source,
		type,
		// Adamantine weapons and ammunition aren't magic, so 5etools gives them no rarity.
		rarity: i.rarity === 'unknown' ? '' : i.rarity,
		...(attune !== undefined ? { attunement: attune } : {}),
		...(i.weight ? { weight: i.weight } : {}),
		...(charges ? { charges } : {}),
		...(charges && regain(i) ? { regain: regain(i) } : {}),
		...(Object.keys(effects).length ? { effects } : {}),
		...(armor ? { armor } : {}),
		...(weapon ? { weapon: { ...weapon } } : {}),
		...(containerOf(i) ? { container: containerOf(i) } : {}),
		text
	};
}

const itemFile = readJson('items.json');
const itemsOut = itemFile.item
	.filter((i) => ITEM_SOURCES.includes(i.source) && i.rarity && i.rarity !== 'none')
	.map((i) => convertItem(i, itemType(i)));

const variants = readJson('magicvariants.json').magicvariant.filter(
	// "(no damage)" variants are the same item for nets; skip them.
	(v) => ITEM_SOURCES.includes(v.inherits?.source) && !v.name.includes('(no damage)')
);
for (const v of variants) {
	const { inherits } = v;
	const name = v.name.replace(/ \(\*\)$/, '');
	// Generic text stands in for the base item the DM picks: "an arrow of slaying", "damage of the weapon's type".
	const base = name.split(' ')[0].toLowerCase();
	const article = /^[aeiou]/.test(base) ? 'an' : 'a';
	const fill = (e) =>
		e
			.replace(/(\S+) \{=dmgType\} damage/g, "$1 damage of the weapon's type")
			.replace(/\{=baseName\/at\}/g, article[0].toUpperCase() + article.slice(1))
			.replace(/\{=baseName\/a\}/g, article)
			.replace(/\{=baseName\/l\}/g, base)
			.replace(/\{=(\w+)\}/g, (_, k) => itemField(inherits, k));
	const entries = inherits.entries.map((e) => (typeof e === 'string' ? fill(e) : e));
	itemsOut.push(convertItem({ ...inherits, name, entries }, variantType(v)));
}

itemsOut.sort((a, b) => a.name.localeCompare(b.name));
const itemIds = new Set();
for (const i of itemsOut) {
	if (itemIds.has(i.id)) fail(`Duplicate item id: ${i.id}`);
	itemIds.add(i.id);
	if (/\{[@=#]/.test(i.text)) fail(`Unresolved 5etools tag in ${i.name}: ${i.text.match(/\{[@=#][^}]*\}/)[0]}`);
}

const MIN_ITEMS = 500;
if (itemsOut.length < MIN_ITEMS) fail(`Expected at least ${MIN_ITEMS} magic items, found ${itemsOut.length}.`);
const itemsPath = join(root, 'src/lib/data/items.json');
writeFileSync(itemsPath, JSON.stringify(itemsOut));
console.log(`Wrote ${itemsOut.length} magic items to ${itemsPath}`);

// ---------------------------------------------------------------------------------------------
// Mundane gear

const DAMAGE_TYPES = { S: 'slashing', P: 'piercing', B: 'bludgeoning' };
const PROPERTIES = { F: 'Finesse', H: 'Heavy', L: 'Light', LD: 'Loading', R: 'Reach', S: 'Special', '2H': 'Two-handed' };
const FOCUS_TYPES = { arcane: 'Arcane focus', druid: 'Druidic focus', holy: 'Holy symbol' };
const GEAR_TYPES = {
	A: ['Ammunition', 'weapon'],
	LA: ['Light armor', 'armor'],
	MA: ['Medium armor', 'armor'],
	HA: ['Heavy armor', 'armor'],
	S: ['Shield', 'armor'],
	AT: ["Artisan's tools", 'tool'],
	T: ['Tool', 'tool'],
	GS: ['Gaming set', 'tool'],
	INS: ['Musical instrument', 'tool'],
	G: ['Adventuring gear', 'gear'],
	FD: ['Food and drink', 'gear'],
	TAH: ['Tack and harness', 'gear'],
	SCF: ['Spellcasting focus', 'gear'],
	$G: ['Gemstone', 'treasure'],
	$A: ['Art object', 'treasure']
};

function gearType(i) {
	const code = i.type.split('|')[0];
	if (code === 'M' || code === 'R') {
		const cat = i.weaponCategory[0].toUpperCase() + i.weaponCategory.slice(1);
		return [`${cat} ${code === 'M' ? 'melee' : 'ranged'} weapon`, 'weapon'];
	}
	if (code === 'SCF') return [FOCUS_TYPES[i.scfType] ?? 'Spellcasting focus', 'gear'];
	// DMG poisons are adventuring gear in 5etools.
	if (code === 'G' && i.poison) return ['Poison', 'gear'];
	return GEAR_TYPES[code] ?? fail(`No gear type for ${i.name} (${i.type})`);
}

/** "1d8 slashing · Versatile (1d10)" for weapons, "AC 16 · Str 13 · Stealth disadvantage" for armor. */
function gearStats(i) {
	const parts = [];
	if (i.dmg1) parts.push(`${i.dmg1} ${DAMAGE_TYPES[i.dmgType] ?? i.dmgType}`);
	for (const code of i.property ?? []) {
		const p = code.split('|')[0];
		if (p === 'V') parts.push(`Versatile (${i.dmg2})`);
		else if (p === 'T') parts.push(`Thrown (${i.range} ft)`);
		else if (p === 'A') parts.push(`Ammunition (${i.range} ft)`);
		else if (PROPERTIES[p]) parts.push(PROPERTIES[p]);
	}
	if (i.ac !== undefined) {
		const code = i.type.split('|')[0];
		const dex = code === 'LA' ? ' + Dex' : code === 'MA' ? ' + Dex (max 2)' : '';
		parts.push(code === 'S' ? `AC +${i.ac}` : `AC ${i.ac}${dex}`);
	}
	if (i.strength) parts.push(`Str ${i.strength}`);
	if (i.stealth) parts.push('Stealth disadvantage');
	return parts.join(' · ');
}

const phbBase = readJson('items-base.json').baseitem.filter((i) => i.source === 'PHB');
const GEAR_CODES = new Set(['G', 'FD', 'TAH', 'SCF', 'T', 'GS', 'AT', 'INS', 'A']);
const gearSource = [
	...phbBase,
	...itemFile.item.filter((i) => i.source === 'PHB' && GEAR_CODES.has(i.type)),
	// Poisons, gemstones and art objects; the DMG's explosives and futuristic gear are left out.
	...itemFile.item.filter(
		(i) => i.source === 'DMG' && i.rarity === 'none' && i.value !== undefined && ['G', '$G|DMG', '$A|DMG'].includes(i.type)
	)
];

// Bundles of one thing ("Arrows (20)") become a default quantity on the single item.
const bundles = new Map();
for (const i of gearSource) {
	const c = i.packContents;
	if (c?.length === 1 && c[0].item) bundles.set(`${i.name}|${i.source}`.toLowerCase(), { ref: c[0].item.toLowerCase(), quantity: c[0].quantity });
}

const gearOut = gearSource
	.filter((i) => !bundles.has(`${i.name}|${i.source}`.toLowerCase()))
	.map((i) => {
		const id = `${i.name}|${i.source}`.toLowerCase();
		const [type, category] = gearType(i);
		const bundle = [...bundles.values()].find((b) => b.ref === id)?.quantity;
		const stats = gearStats(i);
		const isPack = (i.packContents?.length ?? 0) > 1;
		return {
			id,
			name: i.name,
			source: i.source,
			type: isPack ? 'Equipment pack' : type,
			category: isPack ? 'pack' : category,
			...(i.weight ? { weight: i.weight } : {}),
			...(i.value ? { value: i.value } : {}),
			...(stats ? { stats } : {}),
			...(armorOf(i) ? { armor: armorOf(i) } : {}),
			...(weaponOf(i) ? { weapon: weaponOf(i) } : {}),
			...(bundle ? { bundle } : {}),
			...(containerOf(i) ? { container: containerOf(i) } : {}),
			...(isPack
				? {
						contents: i.packContents.map((c) => {
							if (typeof c === 'string') return { ref: c.toLowerCase(), quantity: 1 };
							if (c.special) return { name: c.special[0].toUpperCase() + c.special.slice(1), quantity: c.quantity ?? 1 };
							return { ref: c.item.toLowerCase(), quantity: c.quantity ?? 1 };
						})
					}
				: {}),
			text: flatten(i.entries).join('\n')
		};
	});

const gearIds = new Set();
for (const g of gearOut) {
	if (gearIds.has(g.id)) fail(`Duplicate gear id: ${g.id}`);
	gearIds.add(g.id);
}
// Pack contents point at single items, so bundles in a pack ("bag of 1,000 ball bearings") unfold.
for (const g of gearOut) {
	for (const c of g.contents ?? []) {
		if (!c.ref) continue;
		const b = bundles.get(c.ref);
		if (b) Object.assign(c, { ref: b.ref, quantity: c.quantity * b.quantity });
		if (!gearIds.has(c.ref)) fail(`${g.name} contains unknown item ${c.ref}`);
	}
	if (/\{[@=#]/.test(g.text)) fail(`Unresolved 5etools tag in ${g.name}`);
}
gearOut.sort((a, b) => a.name.localeCompare(b.name));

const MIN_GEAR = 250;
if (gearOut.length < MIN_GEAR) fail(`Expected at least ${MIN_GEAR} gear items, found ${gearOut.length}.`);
const gearPath = join(root, 'src/lib/data/gear.json');
writeFileSync(gearPath, JSON.stringify(gearOut));
console.log(`Wrote ${gearOut.length} gear items to ${gearPath}`);

// ---------------------------------------------------------------------------------------------
// Feats (PHB/XGE/TCE), with the parts the app applies when one is taken at level up

const titleCase = (s) => s.replace(/\b\w/g, (ch) => ch.toUpperCase());
const skillKey = (name) => name.replace(/ /g, '-');

/** "Level 5", "Pact of the Blade", "Eldritch Blast cantrip": the prerequisite as the player reads it. */
function prerequisiteText(list) {
	if (!list?.length) return undefined;
	const alternatives = list.map((p) => {
		const parts = [];
		if (p.level) parts.push(`Level ${typeof p.level === 'number' ? p.level : p.level.level}`);
		if (p.pact) parts.push(`Pact of the ${p.pact}`);
		for (const s of p.spell ?? []) {
			const [name, kind] = s.split('#');
			parts.push(name === 'hex/curse' ? 'Hex spell or a warlock feature that curses' : `${titleCase(name)}${kind === 'c' ? ' cantrip' : ''}`);
		}
		// Races and abilities listed together are alternatives: "Elf or Half-Elf", "Intelligence or Wisdom 13 or higher".
		if (p.race) parts.push(p.race.map((r) => titleCase(r.subrace ? `${r.subrace} ${r.name}` : r.name)).join(' or '));
		if (p.ability) {
			const scores = p.ability.flatMap((a) => Object.entries(a));
			const same = scores.every(([, v]) => v === scores[0][1]);
			parts.push(
				same
					? `${scores.map(([k]) => ABILITIES[k]).join(' or ')} ${scores[0][1]} or higher`
					: scores.map(([k, v]) => `${ABILITIES[k]} ${v} or higher`).join(' or ')
			);
		}
		for (const pr of p.proficiency ?? []) for (const [k, v] of Object.entries(pr)) parts.push(`Proficiency with ${v} ${k === 'weapon' ? 'weapons' : k}`);
		if (p.spellcasting || p.spellcasting2020) parts.push('The ability to cast at least one spell');
		for (const i of p.item ?? []) parts.push(i);
		return parts.join(', ');
	});
	return alternatives.filter(Boolean).join(' or ') || undefined;
}

function featAbility(list) {
	if (!list?.length) return undefined;
	const [a] = list;
	if (a.choose) return { choose: a.choose.from, amount: a.choose.amount ?? 1 };
	const fixed = Object.fromEntries(Object.entries(a).filter(([k]) => k in ABILITIES));
	return Object.keys(fixed).length ? { fixed } : undefined;
}

function featSkills(f) {
	const any = f.skillToolLanguageProficiencies?.[0]?.choose?.find((x) => x.from.includes('anySkill'));
	if (any) return { from: 'any', count: any.count ?? 1 };
	const choose = f.skillProficiencies?.[0]?.choose;
	if (choose) return { from: choose.from.map(skillKey), count: choose.count ?? 1 };
	return undefined;
}

// Feats that change numbers the app works out, beyond ability scores, skills and saves.
const FEAT_HP_PER_LEVEL = { 'tough|phb': 2 };

const featsOut = readJson('feats.json')
	.feat.filter((f) => SOURCES.includes(f.source))
	.map((f) => {
		const id = `${f.name}|${f.source}`.toLowerCase();
		const ability = featAbility(f.ability);
		const skills = featSkills(f);
		const prerequisite = prerequisiteText(f.prerequisite);
		const save = f.savingThrowProficiencies?.[0]?.choose?.from;
		const expertise = f.expertise?.[0]?.anyProficientSkill;
		const weapons = f.weaponProficiencies?.[0]?.choose?.count;
		return {
			id,
			name: f.name,
			source: f.source,
			...(prerequisite ? { prerequisite } : {}),
			...(ability ? { ability } : {}),
			...(save ? { save } : {}),
			...(skills ? { skills } : {}),
			...(expertise ? { expertise } : {}),
			...(weapons ? { weapons } : {}),
			...(FEAT_HP_PER_LEVEL[id] ? { hpPerLevel: FEAT_HP_PER_LEVEL[id] } : {}),
			text: flatten(f.entries).join('\n')
		};
	})
	.sort((a, b) => a.name.localeCompare(b.name));

for (const f of featsOut) if (/\{[@=#]/.test(f.text)) fail(`Unresolved 5etools tag in feat ${f.name}`);
for (const id of Object.keys(FEAT_HP_PER_LEVEL)) if (!featsOut.some((f) => f.id === id)) fail(`Feat ${id} is not in the 5etools data`);
const MIN_FEATS = 72;
if (featsOut.length < MIN_FEATS) fail(`Expected at least ${MIN_FEATS} feats, found ${featsOut.length}.`);
const featsPath = join(root, 'src/lib/data/feats.json');
writeFileSync(featsPath, JSON.stringify(featsOut));
console.log(`Wrote ${featsOut.length} feats to ${featsPath}`);

// ---------------------------------------------------------------------------------------------
// Class options the player picks from a list: invocations, pact boons, maneuvers, arcane shots,
// runes, infusions and elemental disciplines. Fighting styles and metamagic have their own tables in the app.

const OPTION_KINDS = { EI: 'invocation', PB: 'pact-boon', 'MV:B': 'maneuver', AS: 'arcane-shot', RN: 'rune', AI: 'infusion', ED: 'discipline' };

const optionsOut = [...optionalFeatureIndex.values()]
	.flatMap((f) => {
		const kind = f.featureType.map((t) => OPTION_KINDS[t]).find(Boolean);
		if (!kind) return [];
		const prereq = f.prerequisite ?? [];
		const level = prereq.find((p) => p.level)?.level?.level;
		const pact = prereq.find((p) => p.pact)?.pact;
		const prerequisite = prerequisiteText(f.prerequisite);
		return [
			{
				id: `${f.name}|${f.source}`.toLowerCase(),
				name: f.name,
				source: f.source,
				kind,
				...(prerequisite ? { prerequisite } : {}),
				...(level ? { level } : {}),
				...(pact ? { pact: pact.toLowerCase() } : {}),
				text: flatten(f.entries).join('\n')
			}
		];
	})
	.sort((a, b) => a.kind.localeCompare(b.kind) || a.name.localeCompare(b.name));

for (const o of optionsOut) if (/\{[@=#]/.test(o.text)) fail(`Unresolved 5etools tag in ${o.name}`);
const MIN_OPTIONS = 120;
if (optionsOut.length < MIN_OPTIONS) fail(`Expected at least ${MIN_OPTIONS} class options, found ${optionsOut.length}.`);
const optionsPath = join(root, 'src/lib/data/options.json');
writeFileSync(optionsPath, JSON.stringify(optionsOut));
console.log(`Wrote ${optionsOut.length} class options to ${optionsPath}`);

// ---------------------------------------------------------------------------------------------
// Spell grants: spells a class, subclass, class option (pact boon, invocation, discipline), fighting style,
// feat, race or subrace gives on top of the class's own picks.
//   prepared  Always prepared (domain, oath, circle and specialist spells)
//   known     Always known (Aberrant Mind's psionic spells, ranger subclass magic, bonus cantrips)
//   innate    Cast without being known or prepared, in its own ways (invocations, ki, racial spells, feats)
//   expanded  Added to the list the class picks from (warlock patrons, Divine Soul's cleric list)
// Each grant has fixed `spells` and/or `choices` (pick N matching a filter: Magical Secrets, Magic Initiate).
// Spells and choices can carry `cast`: other ways to cast them than a spell slot (at will, once per rest,
// ki or sorcery points, a pact slot once a day, ritual only). A grant's own `cast` applies to all its spells.
// Spells from a grant are `free` (don't count against cantrips known, spells known or prepared) unless it's
// expanded or Bard Magical Secrets.

/** What the spells are called on the character's sheet, by owner, or by class for subclass owners. */
const GRANT_LABELS = {
	artificer: (sub) => [`${sub} Spells`, 'Specialist'],
	cleric: () => ['Domain Spells', 'Domain'],
	druid: () => ['Circle Spells', 'Circle'],
	paladin: () => ['Oath Spells', 'Oath'],
	warlock: () => ['Patron Spells', 'Patron'],
	bard: () => ['Magical Secrets', 'Secrets'],
	'bard/lore': () => ['Additional Magical Secrets', 'Secrets'],
	'barbarian/ancestral': () => ['Consult the Spirits', 'Spirits'],
	'fighter/arcane-archer': () => ['Arcane Archer Lore', 'Arcane Archer'],
	'fighter/psi-warrior': () => ['Telekinetic Master', 'Psionic'],
	'monk/sun-soul': () => ['Searing Arc Strike', 'Sun Soul'],
	'sorcerer/aberrant-mind': () => ['Psionic Spells', 'Psionic'],
	'sorcerer/clockwork-soul': () => ['Clockwork Magic', 'Clockwork'],
	'sorcerer/divine-soul': () => ['Divine Magic', 'Divine'],
	'sorcerer/shadow': () => ['Eyes of the Dark', 'Shadow'],
	'monk/shadow': () => ['Shadow Arts', 'Shadow Arts'],
	'rogue/arcane-trickster': () => ['Mage Hand Legerdemain', 'Trickster'],
	'wizard/illusion': () => ['Improved Minor Illusion', 'Illusion'],
	'option:pact of the tome|phb': () => ['Book of Shadows', 'Tome'],
	'option:pact of the chain|phb': () => ['Pact of the Chain', 'Chain'],
	'style:blessed-warrior': () => ['Blessed Warrior', 'Blessed'],
	'style:druidic-warrior': () => ['Druidic Warrior', 'Druidic']
};

/** Subclass spells the player can trade at each level up for one of the same level matching this filter. */
const GRANT_SWAPS = {
	'sorcerer/aberrant-mind': { schools: ['Divination', 'Enchantment'], classes: ['sorcerer', 'warlock', 'wizard'] },
	'sorcerer/clockwork-soul': { schools: ['Abjuration', 'Transmutation'], classes: ['sorcerer', 'warlock', 'wizard'] }
};

/** Grants whose spells count against spells known (the bard table already includes Magical Secrets). */
const COUNTED_OWNERS = new Set(['bard']);

/**
 * Owners whose 5etools spell data is left out: Glamour's Mantle of Majesty and Open Hand's Tranquility are
 * features with uses, not spells the player casts (counted in rules/features.ts if at all).
 */
const SKIPPED_OWNERS = new Set(['bard/glamour', 'monk/open-hand']);

/**
 * Ways to cast that 5etools doesn't say, by owner, replacing what it gives for those spells (by name).
 * `grantCast` applies to every spell of the owner's known grant instead.
 */
const CAST_OVERRIDES = {
	// Psionic Sorcery (6th level): psionic spells for sorcery points equal to their level, without components.
	'sorcerer/aberrant-mind': { grantCast: [{ kind: 'points', points: 'sorcery', cost: 'level', from: 6, note: 'No verbal or somatic components' }] },
	// Eyes of the Dark: Darkness for 2 sorcery points, and you can see through it.
	'sorcerer/shadow': { spells: { darkness: [{ kind: 'points', points: 'sorcery', cost: 2, note: 'You can see through it' }] } },
	// Thousand Forms: alter self at will.
	'druid/moon': { spells: { 'alter self': [{ kind: 'will' }] } },
	// Telekinetic Master: telekinesis once per long rest, or again for a psionic energy die.
	'fighter/psi-warrior': { spells: { telekinesis: [{ kind: 'rest', per: 'long', uses: 1 }, { kind: 'points', points: 'psionic', cost: 1 }] } },
	// Consult the Spirits: augury or clairvoyance, one use between them per short rest.
	'barbarian/ancestral': {
		spells: {
			augury: [{ kind: 'rest', per: 'short', uses: 1, pool: 'consult-the-spirits' }],
			clairvoyance: [{ kind: 'rest', per: 'short', uses: 1, pool: 'consult-the-spirits' }]
		}
	},
	// Searing Arc Strike: burning hands for 2 ki, +1 ki per level up to half the monk level in total.
	'monk/sun-soul': { spells: { 'burning hands': [{ kind: 'points', points: 'ki', cost: 2, upcast: 'half-level' }] } }
};

/** Spellcasting abilities 5etools doesn't give, by owner. */
const ABILITY_OVERRIDES = { 'fighter/psi-warrior': 'int' };

/**
 * The ability a set's spells are cast with: 'int', 'wis', 'cha', 'feat' (the ability the feat raised:
 * Fey Touched) or a list to choose from (MPMM races). Absent: the class's own spellcasting ability.
 */
const grantAbility = (owner, set) => {
	const a = ABILITY_OVERRIDES[owner] ?? set.ability;
	if (!a) return undefined;
	if (typeof a === 'string') return a === 'inherit' ? 'feat' : a;
	return a.choose ?? fail(`${owner}: unknown spellcasting ability ${JSON.stringify(a)}`);
};

/** TCE feats and MPMM races whose spells can also be cast with the character's spell slots. */
const SLOT_OWNERS = (owner, source) => (owner.startsWith('feat:') && source === 'TCE') || (/^(sub)?race:/.test(owner) && source === 'MPMM');

const spellByName = new Map();
for (const s of all) spellByName.set(s.name.toLowerCase(), [...(spellByName.get(s.name.toLowerCase()) ?? []), s]);

/** "summon aberration|TCE", "mind sliver|tce#c" or "hellish rebuke#2" (cast at 2nd level) → the bundled spell. */
function grantSpell(ref, owner) {
	const [name, src] = ref.split('#')[0].split('|');
	const matches = spellByName.get(name.toLowerCase()) ?? [];
	const spell = src ? matches.find((s) => s.source.toLowerCase() === src.toLowerCase()) : matches.length === 1 ? matches[0] : undefined;
	if (!spell) fail(`${owner}: spell ${ref} is not in spells.json (or is ambiguous)`);
	const at = /#(\d)$/.exec(ref)?.[1];
	return { spell, castLevel: at ? Number(at) : undefined };
}

/** "level=0;1|class=Druid|school=N" → { levels: [0, 1], classes: ['druid'], schools: ['Necromancy'] }; "" is any spell. */
function grantFilter(text, owner) {
	const filter = {};
	for (const part of text.split('|').filter(Boolean)) {
		const [k, v] = part.split('=');
		const values = v.split(';');
		const key = k.toLowerCase();
		if (key === 'level') filter.levels = values.map(Number);
		else if (key === 'class') filter.classes = values.map((x) => x.toLowerCase());
		else if (key === 'school') filter.schools = values.map((x) => SCHOOLS[x] ?? fail(`${owner}: unknown school ${x}`));
		else if (key === 'components & miscellaneous' && v === 'ritual') filter.ritual = true;
		// Spell Sniper's "has an attack roll" isn't in our spell data; any cantrip of the class is offered.
		else if (key === 'spell attack') continue;
		else fail(`${owner}: unknown spell filter ${part}`);
	}
	return filter;
}

/** Class (or character) level a block key means: "3" is level 3, "s2" a 2nd-level spell (a warlock's 3rd level), "_" when gained. */
const grantLevel = (key) => (key === '_' ? 0 : key.startsWith('s') ? Number(key.slice(1)) * 2 - 1 : Number(key));

/**
 * The entries in one level's value with how each is cast. A value is a list (known/prepared: just known;
 * innate: at will) or an object: `_` (choices or names), `will`, `daily`/`rest` ({ "1": [...], "1e": [...] }:
 * that many times per long/short rest), `resource` ({ "2": [...] }: costs that many ki), `ritual`.
 */
function levelEntries(value, mode, resourceName) {
	const will = mode === 'innate' ? [{ kind: 'will' }] : undefined;
	if (Array.isArray(value)) return value.map((e) => ({ e, cast: will }));
	const out = (value._ ?? []).map((e) => ({ e, cast: will }));
	for (const e of value.will ?? []) out.push({ e, cast: [{ kind: 'will' }] });
	for (const [per, key] of [['long', 'daily'], ['short', 'rest']]) {
		for (const [n, list] of Object.entries(value[key] ?? {})) {
			for (const e of list) out.push({ e, cast: [{ kind: 'rest', per, uses: parseInt(n, 10) }] });
		}
	}
	for (const [n, list] of Object.entries(value.resource ?? {})) {
		const points = resourceName === 'Ki' ? 'ki' : fail(`Unknown spell resource ${resourceName}`);
		for (const e of list) out.push({ e, cast: [{ kind: 'points', points, cost: Number(n) }] });
	}
	for (const e of value.ritual ?? []) out.push({ e, cast: [{ kind: 'ritual' }] });
	return out;
}

/** One block (`prepared`, `known`, `innate` or `expanded`) → fixed spells, choices and whole lists, by level. */
function grantBlock(block, owner, mode, resourceName) {
	const spells = [];
	const choices = [];
	const lists = [];
	for (const [key, value] of Object.entries(block ?? {})) {
		const level = grantLevel(key);
		for (const { e, cast } of levelEntries(value, mode, resourceName)) {
			const extra = cast ? { cast } : {};
			if (typeof e === 'string') {
				const { spell, castLevel } = grantSpell(e, owner);
				spells.push({ level, id: spell.id, name: spell.name, ...(castLevel ? { castLevel } : {}), ...extra });
			} else if (e.choose !== undefined) {
				const same = choices.find((c) => c.level === level && c.text === e.choose && JSON.stringify(c.cast) === JSON.stringify(cast));
				if (same) same.count += e.count ?? 1;
				else choices.push({ level, count: e.count ?? 1, text: e.choose, ...extra });
			} else if (e.all) {
				lists.push({ level, filter: grantFilter(e.all, owner) });
			} else fail(`${owner}: unknown spell grant ${JSON.stringify(e)}`);
		}
	}
	spells.sort((a, b) => a.level - b.level || a.name.localeCompare(b.name));
	return { spells, choices: choices.map(({ text, ...c }) => ({ ...c, filter: grantFilter(text, owner) })), lists };
}

/** A known spell that's also cast some other way (Fathomless's tentacles once a day) keeps both, slots included. */
function applyOverrides(owner, spells) {
	const byName = CAST_OVERRIDES[owner]?.spells ?? {};
	for (const s of spells) {
		const cast = byName[s.name.toLowerCase()];
		if (cast) s.cast = cast;
	}
}

const spellGrants = {};
/**
 * Add the grants from one owner's 5etools `additionalSpells`. `labels` gives [name, tag] when there's no
 * entry in GRANT_LABELS; `source` is the owner's book (for SLOT_OWNERS); `castFor` changes the cast of
 * innate spells (an invocation's "once using a warlock spell slot").
 */
function addGrants(owner, sets, { shortName = '', labels, source, castFor } = {}) {
	if (SKIPPED_OWNERS.has(owner)) return;
	const [classKey] = owner.split('/');
	const [name, tag] = labels ?? (GRANT_LABELS[owner] ?? GRANT_LABELS[classKey] ?? ((sub) => [`${sub} Magic`, sub]))(shortName);
	const list = (spellGrants[owner] ??= []);
	// Unnamed alternatives of one spell each (Arcane Archer: prestidigitation or druidcraft) are a choice of one.
	if (sets.length > 1 && !sets.some((s) => s.name)) {
		const ids = sets.map((s) => {
			const { spells } = grantBlock(s.known, owner, 'known');
			if (spells.length !== 1 || s.prepared || s.expanded || s.innate) fail(`${owner}: can't read its spell alternatives`);
			return spells[0];
		});
		list.push({
			key: `${owner}#0`,
			owner,
			name,
			tag,
			mode: 'known',
			free: true,
			spells: [],
			choices: [{ level: ids[0].level, count: 1, filter: { ids: ids.map((s) => s.id) } }]
		});
		return;
	}
	for (const set of sets) {
		const variant = sets.length > 1 ? set.name : undefined;
		for (const mode of ['prepared', 'known', 'innate', 'expanded']) {
			// Eldritch Knights and Arcane Tricksters already pick from the wizard list; their expansion only lifts
			// the school limit at some levels (rules/grants.ts `schoolLimit`).
			if (mode === 'expanded' && (classKey === 'fighter' || classKey === 'rogue')) continue;
			// Races' expanded lists are Dragonmarks (Eberron), which we don't have.
			if (mode === 'expanded' && owner.startsWith('race')) continue;
			const { spells, choices, lists } = grantBlock(set[mode], owner, mode, set.resourceName);
			if (!spells.length && !choices.length && !lists.length) continue;
			applyOverrides(owner, spells);
			if (castFor) for (const x of [...spells, ...choices]) if (mode === 'innate') x.cast = castFor(x.cast);
			const grantCast = mode === 'known' ? CAST_OVERRIDES[owner]?.grantCast : undefined;
			const ability = grantAbility(owner, set);
			list.push({
				key: `${owner}#${list.length}`,
				owner,
				name,
				tag,
				mode,
				free: mode !== 'expanded' && !COUNTED_OWNERS.has(owner),
				...(variant ? { variant } : {}),
				...(ability ? { ability } : {}),
				...(mode === 'innate' && SLOT_OWNERS(owner, source) ? { slots: true } : {}),
				...(grantCast ? { cast: grantCast } : {}),
				spells,
				...(choices.length ? { choices } : {}),
				...(lists.length ? { lists } : {}),
				...(GRANT_SWAPS[owner] && mode === 'known' ? { swap: GRANT_SWAPS[owner] } : {})
			});
		}
	}
	if (!list.length) delete spellGrants[owner];
}

// Classes and subclasses.
for (const [key, source] of Object.entries(CLASS_SOURCES)) {
	const file = classFiles[key];
	const cls = file.class.find((c) => c.source === source);
	if (cls.additionalSpells) addGrants(key, cls.additionalSpells);
	const table = SUBCLASS_KEYS[cls.name];
	for (const sc of file.subclass) {
		if (sc.className !== cls.name || sc.classSource !== cls.source || !sc.additionalSpells) continue;
		const keys = table[`${sc.shortName}|${sc.source}`];
		if (!keys) continue;
		for (const subKey of [keys].flat()) addGrants(`${key}/${subKey}`, sc.additionalSpells, { shortName: sc.shortName });
	}
}

// Class options (by their options.json id) and fighting styles (by their key in rules/attacks.ts FIGHTING_STYLES).
const OPTION_TAGS = { invocation: 'Invocation', discipline: 'Discipline', 'pact-boon': 'Pact' };
for (const f of optionalFeatureIndex.values()) {
	if (!f.additionalSpells) continue;
	const kind = f.featureType.map((t) => OPTION_KINDS[t]).find(Boolean);
	const style = f.featureType.some((t) => t.startsWith('FS'));
	if (!kind && !style) continue;
	const owner = style ? `style:${slug(f.name)}` : `option:${f.name}|${f.source}`.toLowerCase();
	const text = flatten(f.entries).join(' ');
	// Invocations say how their "once a day" works: with a warlock slot, or free; "at will" ones are at will.
	// Elemental disciplines can spend more ki to cast at a higher level, up to a cap by monk level.
	const castFor = (cast) =>
		/using a warlock spell slot/i.test(text)
			? [{ kind: 'pact' }]
			: /at will/i.test(text) && cast?.[0]?.kind === 'rest'
				? [{ kind: 'will' }]
				: kind === 'discipline'
					? cast?.map((c) => (c.points === 'ki' ? { ...c, upcast: 'elemental' } : c))
					: cast;
	addGrants(owner, f.additionalSpells, { labels: GRANT_LABELS[owner]?.() ?? [f.name, OPTION_TAGS[kind] ?? f.name], source: f.source, castFor });
}

// Feats, by their feats.json id. Magic Initiate, Ritual Caster and Spell Sniper have one list per class (variants).
for (const f of readJson('feats.json').feat) {
	if (!SOURCES.includes(f.source) || !f.additionalSpells) continue;
	const owner = `feat:${f.name}|${f.source}`.toLowerCase();
	// Ritual Caster's book holds rituals cast only as rituals; 5etools gives them as once a day.
	const castFor = f.name === 'Ritual Caster' ? () => [{ kind: 'ritual' }] : undefined;
	addGrants(owner, f.additionalSpells, { labels: [f.name, f.name], source: f.source, castFor });
}

// Races and subraces, by our race keys (spells by character level). Racial spells with uses are tracked by the
// race's counters in rules/features.ts when there's one of the same name.
for (const r of raceList) {
	const raceName = r.name;
	if (r.additionalSpells) addGrants(`race:${raceKey(r)}`, r.additionalSpells, { labels: [`${raceName} Spells`, 'Racial'], source: r.source });
	for (const s of subracesOf(r)) {
		if (s.name && s.additionalSpells)
			addGrants(`subrace:${raceKey(r)}/${subraceKey(s)}`, s.additionalSpells, { labels: [`${s.name} ${raceName} Spells`, 'Racial'], source: r.source });
	}
}

// TCE's Primal Awareness (replacing Primeval Awareness) isn't in 5etools' spell data; every ranger gets it,
// like Favored Foe. The spells don't count against spells known, and each can be cast once a day for free.
const grantSpellRecord = (level, ref, owner, cast) => {
	const { spell } = grantSpell(ref, owner);
	return { level, id: spell.id, name: spell.name, ...(cast ? { cast } : {}) };
};
(spellGrants.ranger ??= []).push({
	key: 'ranger#primal-awareness',
	owner: 'ranger',
	name: 'Primal Awareness',
	tag: 'Primal',
	mode: 'known',
	free: true,
	spells: [
		[3, 'speak with animals'],
		[5, 'beast sense'],
		[9, 'speak with plants'],
		[13, 'locate creature'],
		[17, 'commune with nature']
	].map(([level, ref]) => grantSpellRecord(level, ref, 'ranger', [{ kind: 'rest', per: 'long', uses: 1 }]))
});

// Wizard capstones aren't in 5etools' spell data either. Spell Mastery (18th): a 1st- and a 2nd-level wizard
// spell cast at their lowest level at will. Signature Spells (20th): two 3rd-level ones, each once per short rest.
(spellGrants.wizard ??= []).push(
	{
		key: 'wizard#spell-mastery',
		owner: 'wizard',
		name: 'Spell Mastery',
		tag: 'Mastery',
		mode: 'prepared',
		free: true,
		spells: [],
		choices: [
			{ level: 18, count: 1, filter: { levels: [1], classes: ['wizard'] }, cast: [{ kind: 'will' }] },
			{ level: 18, count: 1, filter: { levels: [2], classes: ['wizard'] }, cast: [{ kind: 'will' }] }
		]
	},
	{
		key: 'wizard#signature-spells',
		owner: 'wizard',
		name: 'Signature Spells',
		tag: 'Signature',
		mode: 'prepared',
		free: true,
		spells: [],
		choices: [{ level: 20, count: 2, filter: { levels: [3], classes: ['wizard'] }, cast: [{ kind: 'rest', per: 'short', uses: 1 }] }]
	}
);

const MIN_GRANT_OWNERS = 130;
const grantOwners = Object.keys(spellGrants).length;
if (grantOwners < MIN_GRANT_OWNERS) fail(`Expected spell grants for at least ${MIN_GRANT_OWNERS} owners, found ${grantOwners}.`);
const grantsPath = join(root, 'src/lib/data/spell-grants.json');
writeFileSync(grantsPath, JSON.stringify(spellGrants));
console.log(`Wrote spell grants for ${grantOwners} classes, subclasses, options, feats and races to ${grantsPath}`);
