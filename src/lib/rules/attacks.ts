import type { Ability, Character, ItemWeapon } from '$lib/types';
import { ABILITY_SHORT, abilityMod, signedMod } from './abilities';
import { isActive } from './items';
import { isProficient, proficiencyLabel, weaponProficiencySources } from './proficiency';
import { proficiencyBonus } from './spellcasting';
import { abilityBreakdown, scoreDetail, type AbilityBreakdown, type StatSource } from './stats';

export interface FightingStyle {
	key: string;
	name: string;
	text: string;
	/** Classes that can pick it with their Fighting Style feature. */
	classes: string[];
}

const FPR = ['fighter', 'paladin', 'ranger'];

/** PHB and TCE fighting styles. Archery, Defense, Dueling, Two-Weapon and Unarmed Fighting change the numbers. */
export const FIGHTING_STYLES: FightingStyle[] = [
	{ key: 'archery', name: 'Archery', text: '+2 to attack rolls with ranged weapons.', classes: ['fighter', 'ranger'] },
	{ key: 'blessed-warrior', name: 'Blessed Warrior', text: 'Two cleric cantrips, cast with Charisma.', classes: ['paladin'] },
	{ key: 'blind-fighting', name: 'Blind Fighting', text: 'Blindsight 10 ft.', classes: FPR },
	{ key: 'defense', name: 'Defense', text: '+1 AC while wearing armor.', classes: FPR },
	{ key: 'druidic-warrior', name: 'Druidic Warrior', text: 'Two druid cantrips, cast with Wisdom.', classes: ['ranger'] },
	{ key: 'dueling', name: 'Dueling', text: '+2 damage with a melee weapon in one hand and no other weapon.', classes: [...FPR, 'bard'] },
	{
		key: 'great-weapon',
		name: 'Great Weapon Fighting',
		text: 'Reroll 1s and 2s on damage dice with a melee weapon held in two hands.',
		classes: ['fighter', 'paladin']
	},
	{
		key: 'interception',
		name: 'Interception',
		text: 'Reaction: reduce damage to a creature within 5 ft by 1d10 + proficiency bonus.',
		classes: ['fighter', 'paladin']
	},
	{
		key: 'protection',
		name: 'Protection',
		text: 'Reaction: give disadvantage on an attack against a creature within 5 ft (needs a shield).',
		classes: ['fighter', 'paladin']
	},
	{ key: 'superior-technique', name: 'Superior Technique', text: 'One Battle Master maneuver and a d6 superiority die.', classes: ['fighter'] },
	{ key: 'thrown', name: 'Thrown Weapon Fighting', text: '+2 damage with a thrown weapon.', classes: ['fighter', 'ranger'] },
	{
		key: 'two-weapon',
		name: 'Two-Weapon Fighting',
		text: 'Add your ability modifier to the damage of your off-hand attack.',
		classes: ['fighter', 'ranger', 'bard']
	},
	{
		key: 'unarmed',
		name: 'Unarmed Fighting',
		text: 'Unarmed strikes deal 1d6 + STR, or 1d8 with no weapon or shield in hand.',
		classes: ['fighter']
	}
];

export const FIGHTING_STYLE_MAP = new Map(FIGHTING_STYLES.map((s) => [s.key, s]));

/** How many fighting styles the class gives at this level; 0 for classes without (the Fighting Initiate feat adds one). */
export function fightingStyleCount(c: Pick<Character, 'classKey' | 'subclassKey' | 'level'>): number {
	if (c.classKey === 'fighter') return c.subclassKey === 'champion' && c.level >= 10 ? 2 : 1;
	if (c.classKey === 'paladin' || c.classKey === 'ranger') return c.level >= 2 ? 1 : 0;
	if (c.classKey === 'bard' && c.subclassKey === 'swords' && c.level >= 3) return 1;
	return 0;
}

/** The styles a class can choose from (College of Swords: Dueling or Two-Weapon Fighting); all of them for anyone else. */
export function fightingStyleOptions(c: Pick<Character, 'classKey' | 'subclassKey' | 'level'>): FightingStyle[] {
	if (!fightingStyleCount(c)) return FIGHTING_STYLES.filter((s) => s.classes.includes('fighter'));
	return FIGHTING_STYLES.filter((s) => s.classes.includes(c.classKey));
}

/** Attacks per Attack action: Extra Attack and its fighter upgrades. */
export function attacksPerAction(c: Pick<Character, 'classKey' | 'subclassKey' | 'level'>): number {
	const { classKey: cls, subclassKey: sub, level } = c;
	if (cls === 'fighter') return level >= 20 ? 4 : level >= 11 ? 3 : level >= 5 ? 2 : 1;
	if (['barbarian', 'monk', 'paladin', 'ranger'].includes(cls)) return level >= 5 ? 2 : 1;
	if (cls === 'artificer' && (sub === 'armorer' || sub === 'battle-smith')) return level >= 5 ? 2 : 1;
	if ((cls === 'bard' && (sub === 'valor' || sub === 'swords')) || (cls === 'wizard' && sub === 'bladesinging')) return level >= 6 ? 2 : 1;
	return 1;
}

/** Martial Arts die by monk level. */
export const martialArtsDie = (level: number) => (level >= 17 ? 'd10' : level >= 11 ? 'd8' : level >= 5 ? 'd6' : 'd4');

/** Shortswords and simple melee weapons without the two-handed or heavy property. */
export function isMonkWeapon(w: ItemWeapon): boolean {
	if (w.base === 'shortsword') return true;
	return w.category === 'simple' && !w.ranged && !w.properties.includes('two-handed') && !w.properties.includes('heavy');
}

/** Ammunition each launcher fires, by the bundled gear id. */
const AMMO: Record<string, { ref: string; name: string }> = {
	longbow: { ref: 'arrow|phb', name: 'Arrows' },
	shortbow: { ref: 'arrow|phb', name: 'Arrows' },
	'light crossbow': { ref: 'crossbow bolt|phb', name: 'Bolts' },
	'heavy crossbow': { ref: 'crossbow bolt|phb', name: 'Bolts' },
	'hand crossbow': { ref: 'crossbow bolt|phb', name: 'Bolts' },
	blowgun: { ref: 'blowgun needle|phb', name: 'Needles' },
	sling: { ref: 'sling bullet|phb', name: 'Bullets' }
};

const DIVINE_STRIKE: Record<string, string> = {
	forge: 'fire',
	life: 'radiant',
	nature: 'cold, fire or lightning',
	order: 'psychic',
	tempest: 'thunder',
	trickery: 'poison',
	twilight: 'radiant',
	war: "the weapon's"
};

export interface Attack {
	/** The inventory item's id, or 'unarmed'. */
	id: string;
	name: string;
	toHit: number;
	/** "1d8 + 3 slashing". */
	damage: string;
	/** The flat part of `damage`: everything added to the dice. */
	damageBonus: number;
	/** Two-handed damage for a versatile weapon. */
	versatile?: string;
	/** "Melee 5 ft", "Melee 10 ft (reach) · thrown 20/60 ft", "Ranged 80/320 ft". */
	reach: string;
	/** "Finesse · Light · Thrown". */
	properties: string;
	proficient: boolean;
	ability: Ability;
	hitParts: StatSource[];
	damageParts: StatSource[];
	/** Things to remember at the table: Sneak Attack, rage damage, critical range, off-hand damage. */
	notes: string[];
	/** Ammunition the weapon fires and how much the character carries. */
	ammo?: { name: string; count: number; itemId?: string };
}

const dieAverage = (d: string) => {
	const m = /^(\d*)d(\d+)$/.exec(d);
	return m ? (Number(m[1] || 1) * (Number(m[2]) + 1)) / 2 : Number(d) || 0;
};

/** "1d8 + 3 slashing", "1d4 − 1 piercing", "4 bludgeoning" for a flat die like the blowgun's "1". */
export function damageText(dice: string, flat: number, type: string): string {
	if (!dice) return '—';
	if (!dice.includes('d')) return `${Math.max(0, Number(dice) + flat)} ${type}`.trim();
	const bonus = flat ? ` ${flat > 0 ? '+' : '−'} ${Math.abs(flat)}` : '';
	return `${dice}${bonus} ${type}`.trim();
}

const capital = (s: string) => s[0].toUpperCase() + s.slice(1);

type AttackInput = Pick<
	Character,
	| 'abilities'
	| 'raceKey'
	| 'subraceKey'
	| 'raceAbilityChoices'
	| 'classKey'
	| 'subclassKey'
	| 'level'
	| 'items'
	| 'weaponProficiencies'
	| 'fightingStyles'
>;

/**
 * Attacks with the weapons the character has equipped, then an unarmed strike. Ability, proficiency,
 * magic bonuses and fighting styles are worked in; features that depend on the moment (Sneak Attack,
 * Rage, smites) are notes.
 */
export function attacks(c: AttackInput, breakdown: AbilityBreakdown = abilityBreakdown(c)): Attack[] {
	const scores = breakdown.scores;
	const prof = proficiencyBonus(c.level);
	const profSources = weaponProficiencySources(c);
	const profs = new Set(profSources.flatMap((s) => s.weapons));
	const styles = new Set(c.fightingStyles ?? []);
	const mod = (a: Ability) => abilityMod(scores[a]);
	const scoreFrom = (a: Ability) => scoreDetail(c.abilities, breakdown, a);
	const profPart = (w?: ItemWeapon): StatSource => {
		const src = w && profSources.find((s) => s.weapons.includes(w.category) || s.weapons.includes(w.base));
		const key = src && (src.weapons.includes(w!.category) ? w!.category : w!.base);
		return {
			label: 'Proficiency',
			value: signedMod(prof),
			from: `${src ? `${src.source}: ${proficiencyLabel(key!)}` : 'Everyone is proficient with unarmed strikes'} (level ${c.level} bonus)`
		};
	};
	const sub = `${c.classKey}/${c.subclassKey}`;
	const equipped = (c.items ?? []).filter((i) => i.equipped && i.weapon);
	const lightMelee = equipped.filter((i) => !i.weapon!.ranged && i.weapon!.properties.includes('light'));
	const shield = (c.items ?? []).some((i) => i.equipped && i.armor?.type === 'shield');

	// Notes that depend only on the character and whether the attack is melee.
	const featureNotes = (melee: boolean, finesseOrRanged: boolean, ability: Ability): string[] => {
		const notes: string[] = [];
		if (sub === 'fighter/champion' && c.level >= 3) notes.push(`Critical hit on ${c.level >= 15 ? '18' : '19'}–20`);
		if (c.classKey === 'barbarian' && melee && ability === 'str') {
			notes.push(`Raging: ${signedMod(c.level >= 16 ? 4 : c.level >= 9 ? 3 : 2)} damage`);
		}
		if (c.classKey === 'barbarian' && melee && c.level >= 9) {
			notes.push(`Brutal Critical: ${c.level >= 17 ? 3 : c.level >= 13 ? 2 : 1} extra weapon ${c.level >= 13 ? 'dice' : 'die'} on a critical hit`);
		}
		if (c.raceKey === 'half-orc' && melee) notes.push('Savage Attacks: one extra weapon die on a critical hit');
		if (c.raceKey === 'bugbear' || c.raceKey === 'bugbear-vgm') {
			if (melee) notes.push('Long-Limbed: 5 ft more reach on your turn');
			notes.push(
				c.raceKey === 'bugbear'
					? 'Surprise Attack: +2d6 if the target hasn’t taken a turn yet this combat'
					: 'Surprise Attack: +2d6 against a surprised creature on your first turn, once per combat'
			);
		}
		if (c.classKey === 'rogue' && finesseOrRanged) notes.push(`Sneak Attack: ${Math.ceil(c.level / 2)}d6 once per turn`);
		if (c.classKey === 'paladin' && melee && c.level >= 2) notes.push('Divine Smite: spend a slot for 2d8 radiant, +1d8 per slot level');
		if (c.classKey === 'paladin' && melee && c.level >= 11) notes.push('Improved Divine Smite: +1d8 radiant on every hit');
		if (c.classKey === 'cleric' && c.subclassKey && DIVINE_STRIKE[c.subclassKey] && c.level >= 8) {
			notes.push(`Divine Strike: ${c.level >= 14 ? 2 : 1}d8 ${DIVINE_STRIKE[c.subclassKey]} damage once per turn`);
		}
		return notes;
	};

	const out: Attack[] = [];
	for (const i of equipped) {
		const w = i.weapon!;
		const has = (p: ItemWeapon['properties'][number]) => w.properties.includes(p);
		const proficient = isProficient(profs, w);

		// Pick the best ability the weapon allows.
		const options: { ability: Ability; label: string; why: string }[] = [];
		if (has('finesse')) {
			options.push({ ability: 'str', label: 'STR', why: 'melee weapon' }, { ability: 'dex', label: 'DEX', why: 'finesse: STR or DEX' });
		} else options.push(w.ranged ? { ability: 'dex', label: 'DEX', why: 'ranged weapon' } : { ability: 'str', label: 'STR', why: 'melee weapon' });
		if (c.classKey === 'monk' && isMonkWeapon(w)) options.push({ ability: 'dex', label: 'DEX', why: 'Martial Arts: monk weapon' });
		if (sub === 'warlock/hexblade' && proficient && !has('two-handed')) {
			options.push({ ability: 'cha', label: 'CHA', why: 'Hex Warrior: only the weapon you picked at your last long rest, or your pact weapon' });
		}
		if (sub === 'artificer/battle-smith' && c.level >= 3 && i.kind === 'magic') options.push({ ability: 'int', label: 'INT', why: 'Battle Ready: magic weapon' });
		const best = options.reduce((a, b) => (mod(b.ability) > mod(a.ability) ? b : a));
		const abilityPart: StatSource = {
			label: `${best.label} modifier`,
			value: signedMod(mod(best.ability)),
			from: `${scoreFrom(best.ability)} · ${best.why}`
		};

		const magic = isActive(i) ? i.effects : undefined;
		const magicFrom = `Magic weapon${i.attunement ? ', attuned' : ''}`;
		const hitParts = [abilityPart];
		if (proficient) hitParts.push(profPart(w));
		if (magic?.attack) hitParts.push({ label: i.name, value: signedMod(magic.attack), from: magicFrom });
		if (styles.has('archery') && w.ranged) hitParts.push({ label: 'Archery', value: '+2', from: 'Fighting style: ranged weapons' });

		const damageParts = [abilityPart];
		if (magic?.damage) damageParts.push({ label: i.name, value: signedMod(magic.damage), from: magicFrom });
		const flat = mod(best.ability) + (magic?.damage ?? 0);
		// Dueling needs no other weapon in hand, so it doesn't count while this is one of a two-weapon pair.
		const paired = lightMelee.length > 1 && lightMelee.includes(i);
		const duelingWeapon = styles.has('dueling') && !w.ranged && !has('two-handed');
		const dueling = duelingWeapon && !paired;
		if (dueling) {
			damageParts.push({
				label: 'Dueling',
				value: '+2',
				from: `Fighting style: one-handed melee weapon, no other weapon${has('versatile') ? ' (not when used two-handed)' : ''}`
			});
		}

		// Monks use their Martial Arts die when it beats the weapon's.
		let dice = w.damage;
		if (c.classKey === 'monk' && isMonkWeapon(w) && dieAverage(`1${martialArtsDie(c.level)}`) > dieAverage(dice)) {
			dice = `1${martialArtsDie(c.level)}`;
			damageParts.unshift({ label: 'Martial Arts die', value: dice, from: `Monk level ${c.level}, beats the weapon's ${w.damage}` });
		} else if (dice) damageParts.unshift({ label: 'Weapon die', value: dice, from: `${proficiencyLabel(w.base)}, ${w.damageType}` });

		const notes = featureNotes(!w.ranged, has('finesse') || w.ranged, best.ability);
		if (!proficient) notes.unshift('Not proficient: no proficiency bonus');
		if (duelingWeapon && paired) {
			notes.push(`Dueling: ${damageText(dice, flat + 2, w.damageType)} if it’s your only weapon in hand (left out while you hold two light weapons)`);
		}
		if (styles.has('great-weapon') && !w.ranged && (has('two-handed') || has('versatile'))) {
			notes.push(`Great Weapon Fighting: reroll 1s and 2s on damage dice${has('versatile') ? ' when used two-handed' : ''}`);
		}
		if (styles.has('thrown') && has('thrown')) notes.push('Thrown Weapon Fighting: +2 damage when thrown');
		if (paired) {
			// The bonus-action attack adds no ability modifier unless it's negative or the character has Two-Weapon Fighting.
			const offFlat = flat - (styles.has('two-weapon') || mod(best.ability) < 0 ? 0 : mod(best.ability));
			notes.push(`Off-hand (bonus action): ${damageText(dice, offFlat, w.damageType)}`);
		}
		if (has('special')) notes.push(w.base === 'net' ? 'Net: a hit restrains a Large or smaller creature' : 'Special: see the weapon’s description');

		const reach = w.ranged
			? `Ranged ${w.range ? `${w.range[0]}/${w.range[1]} ft` : ''}`.trim()
			: `Melee ${has('reach') ? '10 ft (reach)' : '5 ft'}${has('thrown') && w.range ? ` · thrown ${w.range[0]}/${w.range[1]} ft` : ''}`;

		const ammoDef = has('ammunition') ? AMMO[w.base] : undefined;
		const ammoItems = ammoDef ? (c.items ?? []).filter((x) => x.ref === ammoDef.ref) : [];

		out.push({
			id: i.id,
			name: i.name,
			toHit: hitParts.reduce((n, p) => n + Number(p.value), 0),
			damage: damageText(dice, flat + (dueling ? 2 : 0), w.damageType),
			damageBonus: flat + (dueling ? 2 : 0),
			...(has('versatile') && w.versatile ? { versatile: damageText(w.versatile, flat, w.damageType) } : {}),
			reach,
			properties: w.properties
				.filter((p) => p !== 'versatile' || !w.versatile)
				.map(capital)
				.concat(w.versatile ? [`Versatile (${w.versatile})`] : [])
				.join(' · '),
			proficient,
			ability: best.ability,
			hitParts,
			damageParts,
			notes,
			...(ammoDef
				? { ammo: { name: ammoDef.name, count: ammoItems.reduce((n, x) => n + x.quantity, 0), itemId: ammoItems[0]?.id } }
				: {})
		});
	}

	const natural = c.raceKey ? NATURAL_WEAPONS[c.raceKey] : undefined;
	const armed = equipped.length > 0 || shield;
	if (natural) out.push(unarmedStrike(c, breakdown, profPart(), armed, featureNotes(true, false, 'str'), natural));
	out.push(unarmedStrike(c, breakdown, profPart(), armed, featureNotes(true, false, 'str')));
	return out;
}

interface NaturalWeapon {
	name: string;
	die: string;
	type: string;
}

/** Racial natural weapons, used to make unarmed strikes (VGM and MPMM). */
const NATURAL_WEAPONS: Record<string, NaturalWeapon> = {
	aarakocra: { name: 'Talons', die: '1d6', type: 'slashing' },
	centaur: { name: 'Hooves', die: '1d6', type: 'bludgeoning' },
	lizardfolk: { name: 'Bite', die: '1d6', type: 'slashing' },
	'lizardfolk-vgm': { name: 'Bite', die: '1d6', type: 'piercing' },
	minotaur: { name: 'Horns', die: '1d6', type: 'piercing' },
	satyr: { name: 'Ram', die: '1d6', type: 'bludgeoning' },
	tabaxi: { name: 'Claws', die: '1d6', type: 'slashing' },
	'tabaxi-vgm': { name: 'Claws', die: '1d4', type: 'slashing' },
	tortle: { name: 'Claws', die: '1d6', type: 'slashing' }
};

/** A plain unarmed strike, or one made with a racial natural weapon. */
function unarmedStrike(
	c: AttackInput,
	breakdown: AbilityBreakdown,
	profPart: StatSource,
	armed: boolean,
	notes: string[],
	natural?: NaturalWeapon
): Attack {
	const scores = breakdown.scores;
	const prof = proficiencyBonus(c.level);
	const str = abilityMod(scores.str);
	const dex = abilityMod(scores.dex);
	const monk = c.classKey === 'monk';
	const ability: Ability = monk && dex > str ? 'dex' : 'str';
	const m = ability === 'dex' ? dex : str;

	// Plain unarmed strikes do 1 + STR; Martial Arts and Unarmed Fighting give a die instead, as do natural weapons
	// (which keep their own damage type).
	const dice: string[] = [natural?.die ?? '1'];
	if (monk) dice.push(`1${martialArtsDie(c.level)}`);
	if (c.fightingStyles?.includes('unarmed') && !natural) dice.push(armed ? '1d6' : '1d8');
	const die = dice.reduce((a, b) => (dieAverage(b) > dieAverage(a) ? b : a));
	const dieLabel = die === natural?.die ? natural.name : monk ? 'Martial Arts die' : 'Unarmed Fighting';
	const dieFrom =
		die === '1'
			? 'Unarmed strikes deal 1 damage'
			: die === natural?.die
				? `Racial natural weapon, ${natural.type}`
				: monk
					? `Monk level ${c.level}`
					: `Fighting style: ${armed ? 'd6 with a weapon or shield at hand, d8 with none' : 'd8 with no weapon or shield at hand'}`;

	const abilityPart: StatSource = {
		label: `${ABILITY_SHORT[ability]} modifier`,
		value: signedMod(m),
		from: `${scoreDetail(c.abilities, breakdown, ability)} · ${monk && ability === 'dex' ? 'Martial Arts: DEX instead of STR' : 'unarmed strike'}`
	};
	const extra = monk ? ['Martial Arts: an unarmed strike as a bonus action after attacking'] : [];
	if (monk && c.level >= 6) extra.push('Ki-Empowered Strikes: counts as magical');
	if (natural?.name === 'Bite') {
		const temp = c.raceKey === 'lizardfolk' ? `${prof}` : `${Math.max(1, abilityMod(scores.con))}`;
		extra.push(`Hungry Jaws: bite as a bonus action; on a hit gain ${temp} temporary HP`);
	}
	return {
		id: natural ? 'natural' : 'unarmed',
		name: natural ? `${natural.name} (unarmed strike)` : 'Unarmed strike',
		toHit: m + prof,
		damage: damageText(die, m, natural?.type ?? 'bludgeoning'),
		damageBonus: die === '1' ? 1 + m : m,
		reach: 'Melee 5 ft',
		properties: '',
		proficient: true,
		ability,
		hitParts: [abilityPart, profPart],
		damageParts: [{ label: die === '1' ? 'Unarmed' : dieLabel, value: die, from: dieFrom }, abilityPart],
		// Extra weapon dice on a critical need a weapon.
		notes: [...extra, ...notes.filter((n) => !n.startsWith('Brutal') && !n.startsWith('Savage'))]
	};
}
