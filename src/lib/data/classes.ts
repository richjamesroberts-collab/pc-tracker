export type Ability = 'STR' | 'DEX' | 'CON' | 'INT' | 'WIS' | 'CHA';

export interface ClassDef {
	key: string;
	name: string;
	saveProficiencies: [Ability, Ability];
	/** All saves the class is typically weak in, derived from the DM reference table. */
	weakSaves: Ability[];
	subclasses: SubclassDef[];
}

export interface SubclassDef {
	key: string;
	name: string;
}

export const CLASSES: ClassDef[] = [
	{
		key: 'barbarian',
		name: 'Barbarian',
		saveProficiencies: ['STR', 'CON'],
		weakSaves: ['DEX', 'INT', 'WIS', 'CHA'],
		subclasses: [
			{ key: 'berserker', name: 'Path of the Berserker' },
			{ key: 'totem-bear', name: 'Path of the Totem Warrior (Bear)' },
			{ key: 'totem-eagle', name: 'Path of the Totem Warrior (Eagle)' },
			{ key: 'totem-wolf', name: 'Path of the Totem Warrior (Wolf)' },
			{ key: 'zealot', name: 'Path of the Zealot' },
			{ key: 'storm-herald', name: 'Path of the Storm Herald' },
			{ key: 'ancestral', name: 'Path of the Ancestral Guardian' }
		]
	},
	{
		key: 'bard',
		name: 'Bard',
		saveProficiencies: ['DEX', 'CHA'],
		weakSaves: ['STR', 'CON', 'INT', 'WIS'],
		subclasses: [
			{ key: 'lore', name: 'College of Lore' },
			{ key: 'valor', name: 'College of Valor' },
			{ key: 'glamour', name: 'College of Glamour' },
			{ key: 'swords', name: 'College of Swords' },
			{ key: 'eloquence', name: 'College of Eloquence' }
		]
	},
	{
		key: 'cleric',
		name: 'Cleric',
		saveProficiencies: ['WIS', 'CHA'],
		weakSaves: ['DEX', 'CON', 'INT'],
		subclasses: [
			{ key: 'life', name: 'Life Domain' },
			{ key: 'light', name: 'Light Domain' },
			{ key: 'knowledge', name: 'Knowledge Domain' },
			{ key: 'nature', name: 'Nature Domain' },
			{ key: 'tempest', name: 'Tempest Domain' },
			{ key: 'trickery', name: 'Trickery Domain' },
			{ key: 'war', name: 'War Domain' },
			{ key: 'forge', name: 'Forge Domain' },
			{ key: 'grave', name: 'Grave Domain' },
			{ key: 'arcana', name: 'Arcana Domain' }
		]
	},
	{
		key: 'druid',
		name: 'Druid',
		saveProficiencies: ['INT', 'WIS'],
		weakSaves: ['STR', 'CON', 'CHA'],
		subclasses: [
			{ key: 'land', name: 'Circle of the Land' },
			{ key: 'moon', name: 'Circle of the Moon' },
			{ key: 'dreams', name: 'Circle of Dreams' },
			{ key: 'shepherd', name: 'Circle of the Shepherd' },
			{ key: 'spores', name: 'Circle of Spores' }
		]
	},
	{
		key: 'fighter',
		name: 'Fighter',
		saveProficiencies: ['STR', 'CON'],
		weakSaves: ['DEX', 'INT', 'WIS', 'CHA'],
		subclasses: [
			{ key: 'champion', name: 'Champion' },
			{ key: 'battle-master', name: 'Battle Master' },
			{ key: 'eldritch-knight', name: 'Eldritch Knight' },
			{ key: 'arcane-archer', name: 'Arcane Archer' },
			{ key: 'cavalier', name: 'Cavalier' },
			{ key: 'samurai', name: 'Samurai' }
		]
	},
	{
		key: 'monk',
		name: 'Monk',
		saveProficiencies: ['STR', 'DEX'],
		// Not in the reference table — derived from proficiencies
		weakSaves: ['CON', 'INT', 'WIS', 'CHA'],
		subclasses: [
			{ key: 'open-hand', name: 'Way of the Open Hand' },
			{ key: 'shadow', name: 'Way of Shadow' },
			{ key: 'four-elements', name: 'Way of the Four Elements' },
			{ key: 'kensei', name: 'Way of the Kensei' },
			{ key: 'sun-soul', name: 'Way of the Sun Soul' },
			{ key: 'drunken-master', name: 'Way of the Drunken Master' },
			{ key: 'astral-self', name: 'Way of the Astral Self' }
		]
	},
	{
		key: 'paladin',
		name: 'Paladin',
		saveProficiencies: ['WIS', 'CHA'],
		weakSaves: ['DEX', 'CON', 'INT'],
		subclasses: [
			{ key: 'devotion', name: 'Oath of Devotion' },
			{ key: 'ancients', name: 'Oath of the Ancients' },
			{ key: 'vengeance', name: 'Oath of Vengeance' },
			{ key: 'conquest', name: 'Oath of Conquest' },
			{ key: 'redemption', name: 'Oath of Redemption' },
			{ key: 'glory', name: 'Oath of Glory' },
			{ key: 'watchers', name: 'Oath of the Watchers' },
			{ key: 'oathbreaker', name: 'Oathbreaker' }
		]
	},
	{
		key: 'ranger',
		name: 'Ranger',
		saveProficiencies: ['STR', 'DEX'],
		// Not in the reference table — derived from proficiencies
		weakSaves: ['CON', 'INT', 'WIS', 'CHA'],
		subclasses: [
			{ key: 'hunter', name: 'Hunter' },
			{ key: 'beast-master', name: 'Beast Master' },
			{ key: 'gloom-stalker', name: 'Gloom Stalker' },
			{ key: 'horizon-walker', name: 'Horizon Walker' },
			{ key: 'monster-slayer', name: 'Monster Slayer' }
		]
	},
	{
		key: 'rogue',
		name: 'Rogue',
		saveProficiencies: ['DEX', 'INT'],
		weakSaves: ['STR', 'CON', 'WIS', 'CHA'],
		subclasses: [
			{ key: 'thief', name: 'Thief' },
			{ key: 'assassin', name: 'Assassin' },
			{ key: 'arcane-trickster', name: 'Arcane Trickster' },
			{ key: 'inquisitive', name: 'Inquisitive' },
			{ key: 'mastermind', name: 'Mastermind' },
			{ key: 'scout', name: 'Scout' },
			{ key: 'swashbuckler', name: 'Swashbuckler' },
			{ key: 'phantom', name: 'Phantom' },
			{ key: 'soulknife', name: 'Soulknife' }
		]
	},
	{
		key: 'sorcerer',
		name: 'Sorcerer',
		saveProficiencies: ['CON', 'CHA'],
		// Not in the reference table — derived from proficiencies
		weakSaves: ['STR', 'DEX', 'INT', 'WIS'],
		subclasses: [
			{ key: 'draconic', name: 'Draconic Bloodline' },
			{ key: 'wild-magic', name: 'Wild Magic' },
			{ key: 'divine-soul', name: 'Divine Soul' },
			{ key: 'shadow', name: 'Shadow Magic' },
			{ key: 'storm', name: 'Storm Sorcery' }
		]
	},
	{
		key: 'warlock',
		name: 'Warlock',
		saveProficiencies: ['WIS', 'CHA'],
		// Not in the reference table — derived from proficiencies
		weakSaves: ['STR', 'DEX', 'CON', 'INT'],
		subclasses: [
			{ key: 'archfey', name: 'The Archfey' },
			{ key: 'fiend', name: 'The Fiend' },
			{ key: 'great-old-one', name: 'The Great Old One' },
			{ key: 'hexblade', name: 'The Hexblade' },
			{ key: 'celestial', name: 'The Celestial' },
			{ key: 'undead', name: 'The Undead' },
			{ key: 'fathomless', name: 'The Fathomless' }
		]
	},
	{
		key: 'wizard',
		name: 'Wizard',
		saveProficiencies: ['INT', 'WIS'],
		weakSaves: ['STR', 'CON', 'CHA'],
		subclasses: [
			{ key: 'abjuration', name: 'School of Abjuration' },
			{ key: 'conjuration', name: 'School of Conjuration' },
			{ key: 'divination', name: 'School of Divination' },
			{ key: 'enchantment', name: 'School of Enchantment' },
			{ key: 'evocation', name: 'School of Evocation' },
			{ key: 'illusion', name: 'School of Illusion' },
			{ key: 'necromancy', name: 'School of Necromancy' },
			{ key: 'transmutation', name: 'School of Transmutation' },
			{ key: 'bladesinging', name: 'Bladesinging' },
			{ key: 'war-magic', name: 'War Magic' }
		]
	},
	{
		key: 'artificer',
		name: 'Artificer',
		saveProficiencies: ['CON', 'INT'],
		// Not in the reference table — derived from proficiencies
		weakSaves: ['STR', 'DEX', 'WIS', 'CHA'],
		subclasses: [
			{ key: 'alchemist', name: 'Alchemist' },
			{ key: 'armorer', name: 'Armorer' },
			{ key: 'artillerist', name: 'Artillerist' },
			{ key: 'battle-smith', name: 'Battle Smith' }
		]
	}
];

export const CLASS_MAP = new Map(CLASSES.map((c) => [c.key, c]));
