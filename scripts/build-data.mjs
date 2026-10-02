// Builds game data from a local 5etools (2014) checkout. All outputs are committed and bundled in the app:
//   src/lib/data/spells.json    Every PHB/XGE/TCE spell
//   src/lib/data/classes.json   Class features (added later)
//   src/lib/data/races.json     Races (added later)
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
		} else if (e.type === 'quote') {
			out.push(...flatten(e.entries));
		} else if (e.entries) {
			out.push(...flatten(e.entries));
		}
	}
	return out;
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
