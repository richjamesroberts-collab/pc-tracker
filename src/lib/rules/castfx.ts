import { resourceLeft, resourcesFor } from './features';
import { sorceryPointsLeft, sorceryPointsMax } from './resources';
import { arcanumLevels, ordinal, pactSlots, slotMax, slotsLeft } from './spellcasting';
import { fxOf, type UseFx } from './usable';
import type { Character, Spell } from '$lib/types';

/** One resource a cast used, before and after, for the animation that shows it going. */
export interface Spent {
	key: string;
	/** "1st-level slot", "Sorcery points", "Ki". */
	label: string;
	/** Short, for the tag floating up over the spell: "1st slot", "2 SP". */
	tag: string;
	/** Pips like the Spells tab, or a number when there are too many (or it isn't a pip resource). */
	shape: 'circle' | 'diamond' | null;
	max: number;
	before: number;
	after: number;
}

/** What `after` has less of than `before`: slots, pact slots, Mystic Arcanum, sorcery points, ki and other counters. */
export function castSpent(before: Character, after: Character): Spent[] {
	const out: Spent[] = [];
	slotMax(after).forEach((m, i) => {
		const level = i + 1;
		const b = slotsLeft(before, level);
		const a = slotsLeft(after, level);
		if (a < b) {
			const max = m + (after.bonusSlots[level] ?? 0);
			out.push({ key: `slot-${level}`, label: `${ordinal(level)}-level slot`, tag: `${ordinal(level)} slot`, shape: 'circle', max, before: b, after: a });
		}
	});
	const pact = pactSlots(after);
	if (pact && after.pactSlotsUsed > before.pactSlotsUsed) {
		out.push({ key: 'pact', label: `Pact slot (${ordinal(pact.level)})`, tag: 'Pact slot', shape: 'circle', max: pact.count, before: Math.max(0, pact.count - before.pactSlotsUsed), after: Math.max(0, pact.count - after.pactSlotsUsed) });
	}
	for (const level of arcanumLevels(after)) {
		if (after.arcanumUsed.includes(level) && !before.arcanumUsed.includes(level)) {
			out.push({ key: `arcanum-${level}`, label: `${ordinal(level)}-level Mystic Arcanum`, tag: 'Arcanum', shape: 'circle', max: 1, before: 1, after: 0 });
		}
	}
	const sp = sorceryPointsLeft(before) - sorceryPointsLeft(after);
	if (sp > 0) {
		out.push({ key: 'sorcery', label: 'Sorcery points', tag: `${sp} SP`, shape: 'diamond', max: sorceryPointsMax(after), before: sorceryPointsLeft(before), after: sorceryPointsLeft(after) });
	}
	for (const def of resourcesFor(after)) {
		const b = resourceLeft(before, def);
		const a = resourceLeft(after, def);
		if (a >= b) continue;
		const max = def.max(after);
		const tag = def.key === 'ki' ? `${b - a} ki` : def.pool ? `${b - a} ${def.name}` : def.name;
		out.push({ key: def.key, label: def.name, tag, shape: def.pool || max > 10 ? null : 'circle', max, before: b, after: a });
	}
	return out;
}

const DAMAGE: [RegExp, UseFx][] = [
	[/\bfire damage/, 'fire'],
	[/\bcold damage/, 'frost'],
	[/\b(?:lightning|thunder) damage/, 'lightning'],
	[/\b(?:poison|acid) damage/, 'poison'],
	[/\bradiant damage/, 'radiant'],
	[/\bnecrotic damage/, 'necrotic'],
	[/\bforce damage/, 'force'],
	[/\b(?:bludgeoning|piercing|slashing) damage/, 'strike']
];

const SCHOOL: Record<string, UseFx> = { C: 'summon', D: 'light', N: 'necrotic' };

/**
 * The animation for casting a spell: by its name (Fire Bolt, Cure Wounds, Revivify), abjuration as force and
 * illusion as vanishing, then the first damage type in its text, then healing, then its school (conjuration
 * summons, divination lights up, necromancy), else arcane.
 */
export function spellFx(spell: Pick<Spell, 'name' | 'text' | 'school'>): UseFx {
	const byName = fxOf(spell.name);
	if (byName && byName !== 'scroll') return byName;
	if (/revivify|raise dead|resurrection|spare the dying|aura of (?:vitality|life)/i.test(spell.name)) return 'heal';
	// Warding and illusions come before the damage they mention (Blade Ward, Major Image).
	if (/^abjuration/i.test(spell.school)) return 'force';
	if (/^illusion/i.test(spell.school)) return 'vanish';
	const text = spell.text.toLowerCase();
	const hits = DAMAGE.map(([re, fx]) => ({ fx, at: text.search(re) })).filter((x) => x.at >= 0);
	if (hits.length) return hits.sort((a, b) => a.at - b.at)[0].fx;
	if (/regains? (?:a number of |\d+ )?hit points/.test(text)) return 'heal';
	return SCHOOL[spell.school.charAt(0).toUpperCase()] ?? 'arcane';
}
