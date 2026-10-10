import { slotOf } from '$lib/rules/slots';
import type { ArmorType, Character, Gender } from '$lib/types';

/**
 * The pixel hero on PC Equipped: an adventurer on a 32 x 40 grid, drawn as the character's race (skin, hair, ears,
 * horns, snout, tail, wings, height), class (clothes and a mark of the class: a wizard's hat, a cleric's holy symbol)
 * and gender, then in layers for what they have equipped and worn. It doesn't try to be accurate, just to look like
 * them at a glance and show that there's a cloak, a sword, a sack.
 */
export const HERO_W = 32;
export const HERO_H = 40;

/** One piece of gear drawn on the hero. */
export type Layer =
	| 'armor'
	| 'sword'
	| 'bow'
	| 'shield'
	| 'head'
	| 'eyes'
	| 'neck'
	| 'cloak'
	| 'robe'
	| 'hands'
	| 'bracers'
	| 'belt'
	| 'feet'
	| 'ring'
	| 'back'
	| 'pouch'
	| 'sack';

export interface HeroGear {
	layers: Layer[];
	/** The armor worn, for how it's drawn. */
	armor?: Exclude<ArmorType, 'shield'>;
}

/**
 * A colour of the hero's palette: `--color-px-<key>` in app.css. Skin, hair and clothes come in tones
 * (`skin-<tone>`, `hair-<tone>`, `cloth-<tone>`, each with a `-dk` shade).
 */
export type Pixel = string;

export const GENDERS: { key: Gender; label: string }[] = [
	{ key: 'female', label: 'Female' },
	{ key: 'male', label: 'Male' },
	{ key: 'nonbinary', label: 'Nonbinary' }
];

/** Skin (or scales, fur, feathers) colours, in the order the look sheet offers them. */
export const SKIN_TONES = [
	'porcelain', 'peach', 'tan', 'brown', 'deep', 'drow', 'ash', 'grey', 'slate', 'sage', 'green', 'jade', 'olive',
	'red', 'ember', 'copper', 'bronze', 'brass', 'gold', 'tawny', 'fur', 'stone', 'teal', 'sky', 'blue', 'silver',
	'white', 'black'
] as const;
export type SkinTone = (typeof SKIN_TONES)[number];

export const HAIR_TONES = ['brown', 'black', 'blonde', 'red', 'white', 'grey', 'blue', 'purple', 'green', 'pink', 'flame'] as const;
export type HairTone = (typeof HAIR_TONES)[number];

type Cloth = 'teal' | 'red' | 'blue' | 'green' | 'forest' | 'purple' | 'violet' | 'white' | 'orange' | 'charcoal' | 'brown' | 'crimson' | 'hide' | 'pants';

/** How a race looks. Height is either full or `short` (Small races, dwarves). */
export interface RaceLook {
	skin: SkinTone;
	hair: HairTone;
	short?: boolean;
	ears?: 'pointed' | 'half' | 'big' | 'floppy' | 'cat' | 'rabbit' | 'fin';
	face?: 'snout' | 'beak' | 'bull' | 'turtle';
	/** A beak's colour, when it isn't gold. */
	beak?: 'dark';
	horns?: 'curl' | 'ram' | 'bull' | 'spikes';
	tusks?: boolean;
	fangs?: boolean;
	nose?: 'big' | 'pink';
	tail?: 'devil' | 'cat' | 'lizard' | 'horse';
	wings?: 'feather' | 'fairy';
	legs?: 'goat' | 'horse';
	shell?: boolean;
	/** How the hair is worn, over the gender's cut; `none` for bald, scaled or furred heads. */
	style?: 'none' | 'feathers' | 'flame' | 'curly' | 'topknot' | 'mane';
	/** Bearded when male. */
	beard?: boolean;
	marks?: 'spots' | 'scales' | 'cracks';
	eyes?: 'glow' | 'blank' | 'snake';
	halo?: boolean;
}

const HUMAN: RaceLook = { skin: 'peach', hair: 'brown' };
const ELF: RaceLook = { skin: 'porcelain', hair: 'blonde', ears: 'pointed' };
const DRAGON: RaceLook = { skin: 'brass', hair: 'brown', face: 'snout', horns: 'spikes', style: 'none', marks: 'scales' };
const DRAGON_SCALES: Record<string, SkinTone> = {
	black: 'black', blue: 'blue', brass: 'brass', bronze: 'bronze', copper: 'copper',
	gold: 'gold', green: 'green', red: 'red', silver: 'silver', white: 'white'
};

/** Looks by race key (VGM races share the MPMM one: `tabaxi-vgm` looks like `tabaxi`), then by subrace. */
export const RACE_LOOKS: Record<string, RaceLook & { subraces?: Record<string, Partial<RaceLook>> }> = {
	dragonborn: { ...DRAGON, subraces: Object.fromEntries(Object.entries(DRAGON_SCALES).map(([k, skin]) => [k, { skin }])) },
	dwarf: { skin: 'tan', hair: 'red', short: true, beard: true, subraces: { hill: { hair: 'brown' } } },
	elf: { ...ELF, subraces: { wood: { skin: 'tan', hair: 'brown' }, drow: { skin: 'drow', hair: 'white' } } },
	gnome: { skin: 'peach', hair: 'red', short: true, nose: 'big', subraces: { forest: { hair: 'brown' } } },
	'half-elf': { skin: 'peach', hair: 'brown', ears: 'half' },
	'half-orc': { skin: 'sage', hair: 'black', tusks: true },
	halfling: { skin: 'peach', hair: 'brown', short: true, style: 'curly' },
	human: HUMAN,
	tiefling: { skin: 'red', hair: 'purple', horns: 'curl', tail: 'devil' },
	'custom-lineage': HUMAN,
	aarakocra: { skin: 'copper', hair: 'red', face: 'beak', wings: 'feather', style: 'feathers' },
	aasimar: { skin: 'porcelain', hair: 'white', halo: true, eyes: 'glow', subraces: { fallen: { hair: 'black', halo: false, eyes: 'blank' } } },
	bugbear: { skin: 'fur', hair: 'brown', ears: 'big', fangs: true, nose: 'big' },
	centaur: { skin: 'tan', hair: 'brown', legs: 'horse', tail: 'horse' },
	changeling: { skin: 'ash', hair: 'white', eyes: 'blank' },
	'deep-gnome': { skin: 'grey', hair: 'grey', short: true, nose: 'big', style: 'none' },
	duergar: { skin: 'grey', hair: 'grey', short: true, style: 'none', beard: true },
	eladrin: { ...ELF, hair: 'red' },
	fairy: { skin: 'peach', hair: 'pink', short: true, ears: 'half', wings: 'fairy' },
	firbolg: { skin: 'slate', hair: 'red', ears: 'floppy', nose: 'big', beard: true },
	genasi: {
		skin: 'teal',
		hair: 'blue',
		subraces: {
			air: { skin: 'sky', hair: 'white' },
			earth: { skin: 'stone', hair: 'black', marks: 'cracks' },
			fire: { skin: 'red', hair: 'flame', style: 'flame' },
			water: {}
		}
	},
	githyanki: { skin: 'olive', hair: 'black', ears: 'pointed', style: 'topknot' },
	githzerai: { skin: 'olive', hair: 'black', ears: 'pointed', style: 'topknot' },
	goblin: { skin: 'olive', hair: 'black', short: true, ears: 'big', fangs: true },
	goliath: { skin: 'grey', hair: 'black', style: 'none', marks: 'spots' },
	harengon: { skin: 'tawny', hair: 'brown', short: true, ears: 'rabbit', nose: 'pink', style: 'none' },
	hobgoblin: { skin: 'ember', hair: 'black', ears: 'half' },
	kenku: { skin: 'black', hair: 'black', face: 'beak', beak: 'dark', style: 'feathers' },
	kobold: { ...DRAGON, skin: 'copper', short: true, tail: 'lizard' },
	lizardfolk: { skin: 'green', hair: 'green', face: 'snout', tail: 'lizard', style: 'none', marks: 'scales' },
	minotaur: { skin: 'fur', hair: 'brown', face: 'bull', horns: 'bull', style: 'none' },
	orc: { skin: 'green', hair: 'black', ears: 'half', tusks: true },
	satyr: { skin: 'tan', hair: 'brown', horns: 'ram', legs: 'goat', style: 'curly' },
	'sea-elf': { ...ELF, skin: 'teal', hair: 'blue', ears: 'fin' },
	'shadar-kai': { ...ELF, skin: 'ash', hair: 'black' },
	shifter: { skin: 'tan', hair: 'brown', ears: 'half', fangs: true, style: 'mane' },
	tabaxi: { skin: 'tawny', hair: 'black', ears: 'cat', nose: 'pink', tail: 'cat', style: 'none', marks: 'spots' },
	tortle: { skin: 'jade', hair: 'green', face: 'turtle', shell: true, style: 'none' },
	triton: { skin: 'blue', hair: 'blue', ears: 'fin', marks: 'scales' },
	'yuan-ti': { skin: 'olive', hair: 'black', eyes: 'snake', marks: 'scales' },
	'yuan-ti-pureblood': { skin: 'olive', hair: 'black', eyes: 'snake', marks: 'scales' }
};

/** A class's clothes, worn under any armor: tunic, then breeches (the hero's own brown when unset). */
const CLASS_CLOTHES: Record<string, [Cloth, Cloth?]> = {
	artificer: ['brown'],
	barbarian: ['hide'],
	bard: ['purple'],
	cleric: ['white'],
	druid: ['green', 'brown'],
	fighter: ['red'],
	monk: ['orange', 'orange'],
	paladin: ['blue'],
	ranger: ['forest', 'brown'],
	rogue: ['charcoal', 'charcoal'],
	sorcerer: ['crimson'],
	warlock: ['violet', 'charcoal'],
	wizard: ['blue', 'blue']
};

export interface HeroLook {
	race: RaceLook;
	classKey?: string;
	gender?: Gender;
	skin: SkinTone;
	hair: HairTone;
}

/** The plain hero: human, no class, no gender. */
export const PLAIN_LOOK: HeroLook = { race: HUMAN, skin: HUMAN.skin, hair: HUMAN.hair };

/** How a race (and subrace) looks: the plain human for none or one we don't know. */
export function raceLook(raceKey?: string, subraceKey?: string): RaceLook {
	const def = raceKey ? (RACE_LOOKS[raceKey] ?? RACE_LOOKS[raceKey.replace(/-vgm$/, '')]) : undefined;
	if (!def) return HUMAN;
	const { subraces, ...look } = def;
	return { ...look, ...(subraceKey ? subraces?.[subraceKey] : undefined) };
}

const isTone = <T extends string>(list: readonly T[], v: unknown): v is T => list.includes(v as T);

/** How the character looks: race, class and gender, with the player's own skin and hair colours over the race's. */
export function heroLook(c: Pick<Character, 'raceKey' | 'subraceKey' | 'classKey' | 'gender' | 'look'>): HeroLook {
	const race = raceLook(c.raceKey, c.subraceKey);
	return {
		race,
		classKey: c.classKey,
		...(c.gender ? { gender: c.gender } : {}),
		skin: isTone(SKIN_TONES, c.look?.skin) ? c.look.skin : race.skin,
		hair: isTone(HAIR_TONES, c.look?.hair) ? c.look.hair : race.hair
	};
}

/** Equipped containers by what they're called: a backpack on the back, a pouch on the belt, a sack over the shoulder. */
const CONTAINERS: [Layer, RegExp][] = [
	['back', /backpack|haversack|bag of holding|explorer/i],
	['pouch', /pouch|purse/i],
	['sack', /\bsack\b|\bbag\b/i]
];

/** What to draw for what the character has equipped and worn (not what's in a stash). */
export function heroGear(c: Pick<Character, 'items'>): HeroGear {
	const on = (c.items ?? []).filter((i) => i.equipped && !i.stash);
	const layers = new Set<Layer>();
	const armor = on.find((i) => i.armor && i.armor.type !== 'shield')?.armor?.type as HeroGear['armor'];
	if (armor) layers.add('armor');
	if (on.some((i) => i.armor?.type === 'shield')) layers.add('shield');
	if (on.some((i) => i.weapon && !i.weapon.ranged)) layers.add('sword');
	if (on.some((i) => i.weapon?.ranged)) layers.add('bow');
	for (const i of on) {
		const slot = slotOf(i);
		if (slot) layers.add(slot);
		if (i.container) {
			const kind = CONTAINERS.find(([, re]) => re.test(i.name))?.[0];
			if (kind) layers.add(kind);
		}
	}
	return { layers: [...layers], ...(armor ? { armor } : {}) };
}

/**
 * The pixels of the hero (`"x,y"` to colour), or with `only`, just those layers of gear (for the flash when they go
 * on). Drawn full height; a short hero loses four rows of leg and sits four rows lower, so everything above the knee
 * (anything drawn above the grid too: rabbit ears, a wizard's hat) moves down with it.
 */
export function drawHero(gear: HeroGear, look: HeroLook = PLAIN_LOOK, only?: Layer[]): Map<string, Pixel> {
	const g = new Map<string, Pixel>();
	const r = look.race;
	const short = !!r.short;
	const set = (x: number, y: number, c: Pixel) => {
		if (short) {
			if (y >= 32 && y < 36) return;
			if (y < 32) y += 4;
		}
		if (x >= 0 && x < HERO_W && y >= 0 && y < HERO_H) g.set(`${x},${y}`, c);
	};
	const rect = (x: number, y: number, w: number, h: number, c: Pixel) => {
		for (let i = x; i < x + w; i++) for (let j = y; j < y + h; j++) set(i, j, c);
	};
	/** On the floor, where it is whatever the hero's height. */
	const floor = (x: number, y: number, w: number, h: number, c: Pixel) => {
		for (let i = x; i < x + w; i++) for (let j = y; j < y + h; j++) g.set(`${i},${j}`, c);
	};
	const round = (x: number, y: number, w: number, h: number, c: Pixel) => {
		rect(x + 1, y, w - 2, h, c);
		rect(x, y + 1, w, h - 2, c);
	};
	/** The same on both sides: the hero's middle is between columns 15 and 16. */
	const pair = (x: number, y: number, c: Pixel, right: Pixel = c) => {
		set(x, y, c);
		set(HERO_W - 1 - x, y, right);
	};
	const pairs = (pts: [number, number][], c: Pixel, right: Pixel = c) => pts.forEach(([x, y]) => pair(x, y, c, right));
	const has = new Set(gear.layers);
	const want = (k: Layer) => (only ? only.includes(k) : has.has(k));
	const base = !only;
	// A bow goes in the hand, unless there's a sword there: then it's slung on the back.
	const bowInHand = !has.has('sword');

	const skin = `skin-${look.skin}`;
	const skinDk = `skin-${look.skin}-dk`;
	const hair = `hair-${look.hair}`;
	const hairDk = `hair-${look.hair}-dk`;
	const [top, bottom] = (look.classKey && CLASS_CLOTHES[look.classKey]) || ['teal'];
	const tunic = `cloth-${top}`;
	const tunicDk = `cloth-${top}-dk`;
	const pants = `cloth-${bottom ?? 'pants'}`;
	const pantsDk = `cloth-${bottom ?? 'pants'}-dk`;
	const cls = look.classKey;
	const male = look.gender === 'male';
	const female = look.gender === 'female';
	const style = r.style;
	const bald = style === 'none';
	const muzzle = r.face === 'snout' || r.face === 'beak' || r.face === 'bull';
	// Eyes sit a row higher over a snout or beak.
	const eyeY = muzzle ? 9 : 10;
	const hat = cls === 'wizard';
	const hood = cls === 'warlock';

	// Behind the body
	if (base && r.wings === 'feather') {
		const out = [6, 4, 3, 2, 1, 1, 1, 1, 1, 1, 2, 2, 2, 2, 3, 3, 3, 5, 5];
		out.forEach((x, n) => {
			const y = 13 + n;
			for (let i = x; i < 10; i++) pair(i, y, skin);
			if (n % 3 === 2) for (let i = x; i < Math.min(x + 3, 10); i++) pair(i, y, skinDk);
		});
	}
	if (base && r.wings === 'fairy') {
		for (const [x, y, w, h] of [
			[1, 9, 8, 10],
			[3, 19, 6, 7]
		]) {
			for (let i = 0; i < w; i++)
				for (let j = 0; j < h; j++) {
					const corner = (i === 0 || i === w - 1) && (j === 0 || j === h - 1);
					if (!corner) pair(x + i, y + j, 'wing');
				}
		}
		pairs([[4, 11], [5, 13], [6, 15], [7, 17], [5, 21], [6, 23]], 'wing-dk');
	}
	if (base && r.shell) {
		round(6, 15, 20, 17, 'shell');
		for (let y = 17; y < 31; y += 4) rect(6, y, 20, 1, 'shell-dk');
	}
	if (base && r.tail === 'devil') {
		for (const [x, y] of [[21, 30], [22, 31], [23, 32], [24, 32], [25, 31], [26, 30], [26, 29], [27, 28]] as const) set(x, y, skinDk);
		rect(26, 26, 3, 2, skinDk);
		set(27, 25, skinDk);
	}
	if (base && r.tail === 'cat') {
		for (const [x, y] of [[21, 31], [22, 32], [23, 32], [24, 31], [25, 30], [25, 29], [26, 28], [26, 27], [26, 26], [25, 25]] as const) {
			set(x, y, skin);
			set(x + 1, y, skin);
		}
		rect(25, 24, 2, 2, skinDk);
	}
	if (base && r.tail === 'lizard') {
		floor(19, 32, 4, 3, skin);
		floor(21, 34, 5, 2, skin);
		floor(25, 35, 3, 2, skin);
		floor(28, 36, 2, 1, skin);
		floor(21, 35, 7, 1, skinDk);
	}
	if (base && r.tail === 'horse') rect(22, 29, 3, 9, hair);
	if (base && female && !bald) {
		round(8, 4, 16, 17, hair);
		rect(21, 6, 3, 14, hairDk);
	}
	if (base && cls === 'bard') {
		// A lute slung on the back: its neck over the left shoulder, its body by the right hip.
		for (let k = 0; k < 9; k++) set(6 + k, 8 + k, 'wood-dk');
		rect(5, 7, 2, 2, 'wood');
		round(21, 24, 9, 8, 'wood');
		rect(24, 27, 2, 2, 'outline');
	}
	if (want('cloak')) {
		for (let y = 17; y <= 35; y++) {
			const sp = Math.floor((y - 17) / 5);
			rect(8 - sp, y, 16 + 2 * sp, 1, 'cloak');
			rect(21 + sp, y, 3, 1, 'cloak-dk');
		}
	}
	if (want('bow') && !bowInHand) {
		for (let k = 0; k < 20; k++) set(5 + k, 9 + k, 'wood');
		for (let k = 0; k < 20; k++) set(6 + k, 9 + k, 'wood-dk');
	}
	if (want('back')) {
		round(7, 13, 18, 4, 'roll');
		rect(7, 15, 18, 1, 'roll-dk');
		rect(10, 13, 1, 4, 'strap');
		rect(21, 13, 1, 4, 'strap');
	}
	if (want('sack')) {
		round(22, 6, 7, 9, 'sack');
		rect(27, 7, 1, 7, 'sack-dk');
		rect(24, 5, 3, 1, 'strap');
	}

	// The body
	if (base) {
		if (r.legs === 'horse') {
			round(8, 28, 16, 6, 'skin-fur');
			rect(20, 29, 4, 4, 'skin-fur-dk');
			for (const x of [9, 13, 17, 21]) {
				rect(x, 34, 2, 3, x > 16 ? 'skin-fur-dk' : 'skin-fur');
				rect(x, 37, 2, 2, 'horn');
			}
		} else if (r.legs === 'goat') {
			rect(12, 29, 8, 3, hair);
			rect(12, 32, 3, 5, hair);
			rect(17, 32, 3, 5, hair);
			rect(14, 33, 1, 3, hairDk);
			rect(19, 29, 1, 8, hairDk);
			rect(12, 37, 3, 2, 'horn');
			rect(17, 37, 3, 2, 'horn');
		} else {
			rect(12, 29, 8, 3, pants);
			rect(12, 32, 3, 5, pants);
			rect(17, 32, 3, 5, pants);
			rect(14, 32, 1, 5, pantsDk);
			rect(19, 29, 1, 8, pantsDk);
			rect(11, 37, 4, 2, 'shoe');
			rect(17, 37, 4, 2, 'shoe');
		}
		rect(11, 18, 10, 11, tunic);
		rect(19, 18, 2, 11, tunicDk);
		// Sleeves, or bare arms for a barbarian
		const sleeve = cls === 'barbarian' ? skin : tunic;
		rect(7, 18, 3, 5, sleeve);
		rect(22, 18, 3, 5, sleeve);
		rect(24, 18, 1, 5, cls === 'barbarian' ? skinDk : tunicDk);
		rect(7, 23, 3, 5, skin);
		rect(22, 23, 3, 5, skin);
		rect(9, 23, 1, 5, skinDk);
		rect(24, 23, 1, 5, skinDk);
		if (cls === 'wizard') {
			// A long robe, flaring to the ankles
			for (let y = 29; y <= 36; y++) {
				const sp = Math.floor((y - 29) / 3);
				rect(11 - sp, y, 10 + 2 * sp, 1, tunic);
				rect(19 + sp, y, 2, 1, tunicDk);
			}
		}
		if (cls === 'monk') rect(15, 18, 2, 3, skin);
		rect(14, 16, 4, 2, skinDk);

		// Ears go behind the head
		if (r.ears === 'pointed') pairs([[9, 9], [9, 10], [8, 8], [8, 9], [7, 7], [6, 6]], skin, skinDk);
		if (r.ears === 'half') pairs([[9, 9], [9, 10], [8, 8], [8, 9]], skin, skinDk);
		if (r.ears === 'big') pairs([[9, 8], [9, 9], [9, 10], [9, 11], [8, 8], [8, 9], [8, 10], [7, 8], [7, 9], [6, 8], [5, 7]], skin, skinDk);
		if (r.ears === 'floppy') pairs([[9, 9], [9, 10], [9, 11], [9, 12], [8, 10], [8, 11], [8, 12], [8, 13], [7, 12], [7, 13]], skin, skinDk);
		if (r.ears === 'fin') {
			pairs([[9, 8], [9, 9], [9, 10], [9, 11], [8, 7], [8, 8], [8, 9], [8, 10], [7, 6], [7, 7]], skinDk);
			pairs([[8, 9], [9, 10]], skin);
		}
		if (r.ears === 'cat' && !hat && !hood) {
			pairs([[10, 0], [10, 1], [11, 1], [10, 2], [11, 2], [12, 2], [10, 3], [11, 3], [12, 3], [13, 3]], skin, skin);
			pairs([[11, 2]], 'blush');
		}
		if (r.ears === 'rabbit' && !hat && !hood) {
			rect(11, -3, 3, 7, skin);
			rect(18, -3, 3, 7, skin);
			rect(12, -2, 1, 5, 'blush');
			rect(19, -2, 1, 5, 'blush');
		}

		// Head
		round(10, 4, 12, 12, skin);
		rect(20, 12, 1, 3, skinDk);
		if (r.face === 'snout') {
			round(11, 11, 10, 6, skin);
			rect(18, 12, 2, 4, skinDk);
			pairs([[14, 12]], skinDk);
			rect(13, 15, 6, 1, skinDk);
		}
		if (r.face === 'beak') {
			const b = r.beak === 'dark' ? 'beak-dk' : 'beak';
			rect(13, 11, 6, 2, b);
			rect(14, 13, 4, 2, b);
			rect(15, 15, 2, 1, b);
			rect(17, 11, 2, 3, r.beak === 'dark' ? 'outline' : 'beak-dk');
		}
		if (r.face === 'bull') {
			round(11, 11, 10, 6, skinDk);
			pairs([[13, 13], [13, 14]], 'outline');
			rect(14, 15, 4, 1, 'outline');
			rect(15, 16, 2, 1, 'gold');
		}
		if (r.face === 'turtle') {
			rect(12, 14, 8, 1, skinDk);
			rect(11, 12, 10, 1, skinDk);
		}

		// Face
		const eye = r.eyes === 'glow' ? 'glow' : r.eyes === 'blank' ? 'white' : r.eyes === 'snake' ? 'gold' : 'eye';
		rect(13, eyeY, 2, 2, eye);
		rect(17, eyeY, 2, 2, eye);
		if (r.eyes === 'snake') {
			rect(14, eyeY, 1, 2, 'outline');
			rect(17, eyeY, 1, 2, 'outline');
		} else if (r.eyes === 'blank') {
			set(13, eyeY + 1, 'steel');
			set(18, eyeY + 1, 'steel');
		} else if (!r.eyes) {
			set(13, eyeY, 'white');
			set(17, eyeY, 'white');
		}
		if (female) pairs([[12, eyeY - 1]], 'outline');
		if (!muzzle && r.face !== 'turtle') {
			pairs([[12, 12]], 'blush');
			rect(15, 13, 2, 1, female ? 'blush' : skinDk);
		}
		if (r.nose === 'big') {
			rect(14, 11, 4, 2, skinDk);
			rect(15, 10, 2, 2, skinDk);
			set(15, 11, skin);
		}
		if (r.nose === 'pink') {
			rect(15, 11, 2, 1, 'blush');
			pairs([[13, 13], [12, 12]], skinDk);
		}
		if (r.tusks) pairs([[14, 14], [14, 13]], 'tusk', 'tusk-dk');
		if (r.fangs) pairs([[15, 14]], 'white');
		if (r.marks === 'spots') pairs([[11, 7], [12, 6], [19, 8], [8, 25], [23, 20]], skinDk);
		if (r.marks === 'scales') pairs([[11, 6], [12, 7], [11, 8], [8, 24], [8, 26]], skinDk);
		if (r.marks === 'cracks') {
			pairs([[11, 7], [12, 8], [12, 9], [8, 24], [9, 25]], skinDk);
			set(18, 5, skinDk);
			set(17, 6, skinDk);
		}

		// Hair: the race's style over the gender's cut
		if (!bald) {
			const sides = female ? 9 : male ? 3 : 6;
			if (style === 'feathers') {
				round(11, 2, 10, 5, hair);
				pairs([[12, 1], [14, 0], [13, 1]], hair, hairDk);
				rect(18, 3, 3, 3, hairDk);
				if (!male) pairs([[10, 5], [10, 6], [9, 7]], hair, hairDk);
			} else {
				round(10, 2, 12, 6, hair);
				rect(10, 6, 2, sides, hair);
				rect(20, 6, 2, sides, hair);
				rect(20, 3, 2, sides + 3, hairDk);
				rect(12, 8, 3, 1, hair);
				if (male) rect(12, 8, 8, 1, hair);
			}
			if (style === 'curly') pairs([[11, 1], [13, 1], [15, 1], [10, 3]], hair, hairDk);
			if (style === 'topknot' && !hat && !hood) {
				rect(15, 0, 2, 2, hair);
				rect(15, -2, 2, 2, hair);
			}
			if (style === 'mane') {
				rect(8, 5, 2, 10, hair);
				rect(22, 5, 2, 10, hairDk);
			}
			if (style === 'flame' && !hat && !hood) {
				pairs([[11, 1], [12, 0], [14, 1], [15, -1], [13, -1]], hair, hairDk);
				pairs([[13, 2], [15, 1]], 'hair-flame-hot');
			}
		} else if (!r.face) {
			set(12, 5, 'white');
		}
		if (r.horns === 'spikes') pairs([[11, 3], [11, 2], [10, 1], [10, 0]], 'tusk', 'tusk-dk');
	}

	// Class marks on the head and hands
	if (base) {
		if (cls === 'barbarian') pairs([[12, 11], [12, 12], [11, 11]], 'ruby');
		if (cls === 'druid' && !has.has('head') && !hat) {
			pairs([[11, 3], [13, 2], [15, 2]], 'leaf', 'leaf-dk');
			pairs([[12, 2], [14, 2]], 'leaf-dk', 'leaf');
		}
		if (cls === 'fighter' && !has.has('head')) {
			rect(10, 7, 12, 1, 'cloth-red-dk');
			set(9, 8, 'cloth-red-dk');
			set(8, 9, 'cloth-red-dk');
		}
		if (cls === 'artificer' && !has.has('head') && !has.has('eyes')) {
			rect(10, 6, 12, 1, 'strap');
			round(11, 5, 4, 3, 'steel-dk');
			round(17, 5, 4, 3, 'steel-dk');
			rect(12, 6, 2, 1, 'lens');
			rect(18, 6, 2, 1, 'lens');
		}
		if (cls === 'rogue' && !muzzle) {
			rect(11, 12, 10, 3, 'cloth-charcoal-dk');
			rect(12, 15, 8, 1, 'cloth-charcoal-dk');
		}
		if (cls === 'ranger') {
			rect(9, 16, 14, 2, tunicDk);
			rect(10, 15, 3, 1, tunicDk);
			rect(19, 15, 3, 1, tunicDk);
		}
		if (cls === 'monk' && !has.has('hands')) {
			rect(7, 25, 3, 2, 'cloth-white');
			rect(22, 25, 3, 2, 'cloth-white');
		}
		if (hood) {
			round(9, 1, 14, 7, tunic);
			rect(9, 5, 2, 12, tunic);
			rect(21, 5, 2, 12, tunicDk);
			rect(19, 2, 3, 5, tunicDk);
			rect(11, 7, 10, 1, tunicDk);
		}
		if (hat) {
			// A pointed hat, its tip bent over to the right
			rect(7, 6, 18, 2, tunic);
			rect(20, 6, 5, 2, tunicDk);
			rect(10, 5, 12, 1, 'gold');
			rect(11, 4, 10, 1, tunic);
			rect(12, 3, 8, 1, tunic);
			rect(13, 2, 6, 1, tunic);
			rect(15, 1, 4, 1, tunic);
			rect(17, 0, 3, 1, tunic);
			rect(19, -1, 2, 1, tunic);
			rect(17, 1, 2, 4, tunicDk);
			set(14, 3, 'gold');
			set(18, 0, 'gold');
		}
		if (r.horns === 'curl') {
			pairs([[12, 3], [11, 3], [11, 2], [10, 2], [10, 1], [9, 1], [9, 0], [8, 0], [8, 1], [7, 1], [7, 2], [7, 3]], 'horn', 'horn-dk');
			pairs([[12, 2], [11, 1], [10, 0]], 'horn-dk', 'horn');
		}
		if (r.horns === 'ram') pairs([[10, 3], [9, 3], [8, 4], [8, 5], [8, 6], [9, 7], [10, 7], [9, 4], [9, 6], [7, 5]], 'tusk', 'tusk-dk');
		if (r.horns === 'bull') pairs([[9, 6], [8, 6], [7, 6], [6, 5], [5, 4], [5, 3], [5, 2], [8, 5], [7, 5]], 'tusk', 'tusk-dk');
		if (r.halo && !hat && !hood) {
			rect(12, 0, 8, 1, 'halo');
			pairs([[11, 1]], 'halo');
		}
	}

	// Robe, then armor over it
	if (want('robe')) {
		rect(11, 18, 10, 11, 'robe');
		for (let y = 29; y <= 36; y++) {
			const sp = Math.floor((y - 29) / 3);
			rect(11 - sp, y, 10 + 2 * sp, 1, 'robe');
			rect(19 + sp, y, 2, 1, 'robe-dk');
		}
		rect(7, 18, 3, 5, 'robe');
		rect(22, 18, 3, 5, 'robe-dk');
		rect(15, 18, 2, 11, 'gold');
	}
	if (want('armor')) {
		const t = gear.armor ?? 'heavy';
		if (t === 'light') {
			rect(11, 18, 10, 9, 'leather');
			rect(19, 18, 2, 9, 'leather-dk');
			rect(7, 18, 3, 4, 'leather');
			rect(22, 18, 3, 4, 'leather-dk');
			for (let y = 20; y < 27; y += 3) for (let x = 12; x < 20; x += 3) set(x, y, 'stud');
		} else {
			rect(11, 18, 10, 9, 'steel');
			for (let y = 18; y < 27; y++) for (let x = 11; x < 21; x++) if ((x + y) % 2) set(x, y, 'steel-dk');
			rect(12, 19, 1, 7, 'shine');
			rect(13, 17, 6, 1, 'steel-dk');
			rect(7, 18, 3, 5, 'steel');
			rect(22, 18, 3, 5, 'steel');
			rect(9, 18, 1, 5, 'steel-dk');
			rect(24, 18, 1, 5, 'steel-dk');
			if (t === 'heavy') {
				round(6, 17, 5, 3, 'steel');
				round(21, 17, 5, 3, 'steel');
				rect(7, 17, 3, 1, 'shine');
				rect(22, 17, 3, 1, 'shine');
				if (!r.legs) {
					rect(12, 29, 8, 2, 'steel');
					for (let x = 12; x < 20; x++) if (x % 2) set(x, 30, 'steel-dk');
				}
			}
		}
	}
	if (base) {
		// A paladin's tabard and a cleric's holy symbol go over armor
		if (cls === 'paladin') {
			rect(13, 18, 6, 11, 'cloth-white');
			rect(17, 18, 2, 11, 'cloth-white-dk');
			rect(15, 20, 2, 6, 'gold');
			rect(14, 21, 4, 2, 'gold');
		}
		const belt = cls === 'monk' ? 'cloth-orange-dk' : 'belt';
		rect(11, 27, 10, 2, belt);
		rect(15, 27, 2, 2, cls === 'monk' ? belt : 'gold');
		if (cls === 'cleric' && !has.has('neck')) {
			pairs([[13, 18], [14, 19]], 'gold');
			rect(15, 20, 2, 3, 'gold');
			pairs([[14, 21]], 'gold');
			set(15, 20, 'shine');
		}
		// A dwarf's (or firbolg's, duergar's) beard, over armor
		if (r.beard && male) {
			rect(11, 12, 10, 4, hair);
			rect(12, 16, 8, 2, hair);
			rect(13, 18, 6, 2, hair);
			rect(14, 20, 4, 1, hair);
			rect(18, 12, 3, 6, hairDk);
			rect(15, 13, 2, 1, 'blush');
		}
	}

	// Worn over the top
	if (want('belt')) {
		rect(11, 27, 10, 2, 'gold');
		rect(15, 27, 2, 2, 'ruby');
	}
	if (want('cloak')) {
		rect(6, 17, 16, 2, 'cloak');
		rect(22, 17, 4, 2, 'cloak-dk');
		rect(15, 18, 2, 1, 'gold');
	}
	if (want('neck')) {
		set(13, 18, 'gold');
		set(14, 19, 'gold');
		set(17, 19, 'gold');
		set(18, 18, 'gold');
		rect(15, 20, 2, 2, 'gem');
		set(15, 20, 'gem-lt');
	}
	if (want('back')) {
		rect(12, 19, 1, 8, 'strap');
		rect(19, 19, 1, 8, 'strap');
	}
	if (want('pouch')) {
		rect(17, 27, 5, 5, 'outline');
		rect(18, 28, 3, 3, 'leather');
		rect(18, 28, 3, 1, 'leather-dk');
		set(19, 29, 'gold');
	}
	if (want('feet') && !r.legs) {
		rect(11, 33, 4, 6, 'boot');
		rect(17, 33, 4, 6, 'boot');
		rect(11, 33, 4, 1, 'boot-lt');
		rect(17, 33, 4, 1, 'boot-lt');
		rect(14, 34, 1, 5, 'boot-dk');
		rect(20, 34, 1, 5, 'boot-dk');
	}
	if (want('bracers')) {
		rect(7, 22, 3, 2, 'gold');
		rect(22, 22, 3, 2, 'gold');
	}
	if (want('hands')) {
		rect(7, 24, 3, 4, 'gaunt');
		rect(22, 24, 3, 4, 'gaunt');
		rect(7, 24, 3, 1, 'gold');
		rect(22, 24, 3, 1, 'gold');
		rect(9, 25, 1, 3, 'gaunt-dk');
		rect(24, 25, 1, 3, 'gaunt-dk');
	}
	if (want('eyes')) {
		rect(12, eyeY, 8, 1, 'outline');
		rect(13, eyeY, 2, 2, 'lens');
		rect(17, eyeY, 2, 2, 'lens');
	}
	if (want('head')) {
		const y = hat ? 5 : 7;
		rect(10, y, 12, 1, 'gold');
		rect(15, y - 1, 2, 2, 'ruby');
	}
	if (want('ring')) {
		set(9, 27, 'ring');
		set(10, 26, 'white');
	}

	// Held
	if (want('sword')) {
		set(8, 23, 'gold');
		rect(8, 24, 1, 4, 'grip');
		rect(6, 28, 5, 1, 'gold');
		rect(7, 29, 3, 8, 'steel');
		rect(8, 29, 1, 8, 'shine');
		set(8, 37, 'steel');
	}
	if (want('bow') && bowInHand) {
		set(6, 15, 'wood');
		set(5, 16, 'wood');
		rect(4, 17, 1, 3, 'wood');
		rect(3, 20, 1, 13, 'wood-dk');
		rect(4, 33, 1, 3, 'wood');
		set(5, 36, 'wood');
		set(6, 37, 'wood');
		rect(6, 16, 1, 21, 'string');
	}
	if (want('shield')) {
		round(20, 20, 10, 12, 'outline');
		rect(22, 32, 6, 1, 'outline');
		rect(23, 33, 4, 1, 'outline');
		round(21, 21, 8, 10, 'steel');
		rect(22, 31, 6, 1, 'steel');
		rect(23, 32, 4, 1, 'steel');
		round(22, 22, 6, 8, 'wood');
		rect(23, 30, 4, 1, 'wood');
		rect(24, 31, 2, 1, 'wood');
		rect(26, 22, 2, 9, 'wood-dk');
		round(23, 24, 4, 4, 'steel');
		rect(24, 25, 2, 2, 'shine');
	}

	// Magic about the hands of a sorcerer or warlock
	if (base && (cls === 'sorcerer' || cls === 'warlock') && !has.has('sword')) {
		const spark = cls === 'sorcerer' ? 'spark' : 'spark-violet';
		for (const [x, y] of [[5, 22], [4, 25], [6, 27], [3, 28]] as const) set(x, y, spark);
		set(5, 25, 'white');
	}

	// Outline everything that touches empty space
	const edge = new Set<string>();
	for (const k of g.keys()) {
		const [x, y] = k.split(',').map(Number);
		for (const [dx, dy] of [
			[1, 0],
			[-1, 0],
			[0, 1],
			[0, -1]
		]) {
			const n = `${x + dx},${y + dy}`;
			if (!g.has(n)) edge.add(n);
		}
	}
	for (const n of edge) {
		const [x, y] = n.split(',').map(Number);
		if (x >= 0 && x < HERO_W && y >= 0 && y < HERO_H) g.set(n, 'outline');
	}
	return g;
}

/** Pixels as rows of runs of one colour, so the SVG has a rect a run instead of one a pixel. */
export function runs(g: Map<string, Pixel>): { x: number; y: number; w: number; c: Pixel }[] {
	const out: { x: number; y: number; w: number; c: Pixel }[] = [];
	for (let y = 0; y < HERO_H; y++) {
		let x = 0;
		while (x < HERO_W) {
			const c = g.get(`${x},${y}`);
			if (!c) {
				x++;
				continue;
			}
			let w = 1;
			while (g.get(`${x + w},${y}`) === c) w++;
			out.push({ x, y, w, c });
			x += w;
		}
	}
	return out;
}
