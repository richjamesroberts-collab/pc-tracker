// Builds game data from a local 5etools (2014) checkout. All outputs are committed and bundled in the app:
//   src/lib/data/spells.json    Every PHB/XGE/TCE spell
//   src/lib/data/classes.json   Class and subclass features (PHB/XGE/TCE + three older subclasses)
//   src/lib/data/races.json     PHB races and Custom Lineage
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
					out.push(`• ${item.name ? stripTags(item.name) + ' ' : ''}${body}`);
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
			out.push(`• ${e.optionalfeature.split('|')[0]}`);
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
		classFeatureIndex.set(classFeatureKey(f.name, f.className, f.classSource, f.level, f.source), f);
	for (const f of file.subclassFeature ?? [])
		subclassFeatureIndex.set(
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
	const features = cls.classFeatures.map((ref) => {
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
			const rec = findSubclassFeature(ref);
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

const racesOut = raceFile.race
	.filter((r) => r.source === 'PHB' && !r._copy)
	.sort((a, b) => a.name.localeCompare(b.name))
	.concat(raceFile.race.filter((r) => r.name === 'Custom Lineage' && r.source === 'TCE'))
	.map((r) => ({
		key: slug(r.name),
		name: r.name,
		source: r.source,
		traits: traitsOf(r.entries),
		subraces:
			r.name === 'Dragonborn'
				? dragonAncestries(r)
				: raceFile.subrace
						.filter((s) => s.source === 'PHB' && s.name && s.raceName === r.name && s.raceSource === r.source)
						.map((s) => ({ key: s.name.split(/[ ;]/)[0].toLowerCase(), name: s.name, traits: traitsOf(s.entries) }))
	}));

const MIN_RACES = 10;
if (racesOut.length < MIN_RACES) fail(`Expected at least ${MIN_RACES} races, found ${racesOut.length}.`);
const racesPath = join(root, 'src/lib/data/races.json');
writeFileSync(racesPath, JSON.stringify(racesOut));
console.log(`Wrote ${racesOut.length} races to ${racesPath}`);
