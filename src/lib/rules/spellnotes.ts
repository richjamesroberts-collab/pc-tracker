import type { Ability, Character, Spell } from '$lib/types';
import { abilityMod, signedMod } from './abilities';
import { abilityScores } from './stats';

/**
 * Table notes for casting a spell: what the character's features add (Agonizing Blast, Potent Spellcasting,
 * Empowered Evocation and the like). Worked out from the spell's text and lists, shown in the cast sheet.
 */
export function spellNotes(c: Character, spell: Pick<Spell, 'id' | 'name' | 'level' | 'school' | 'classes' | 'text'>): string[] {
	const notes: string[] = [];
	const mod = (a: Ability) => signedMod(abilityMod(abilityScores(c)[a]));
	const sub = (classKey: string, subclassKey: string, level = 1) =>
		c.classKey === classKey && c.subclassKey === subclassKey && c.level >= level;
	const has = (ref: string) => c.classOptions.some((o) => o.ref === ref);
	const feat = (ref: string) => c.feats.some((f) => f.ref === ref);
	const text = spell.text.toLowerCase();
	const damages = (...types: string[]) => types.some((t) => text.includes(`${t} damage`));
	const damage = /\d+d\d+[^.]*? damage/.test(text) || damages('acid', 'cold', 'fire', 'force', 'lightning', 'necrotic', 'poison', 'psychic', 'radiant', 'thunder');
	const heals = /regains? (a number of )?hit points/.test(text);
	const own = (classKey: string) => c.classKey === classKey && spell.classes.includes(classKey);

	if (spell.id === 'eldritch blast|phb') {
		const beams = c.level >= 17 ? 4 : c.level >= 11 ? 3 : c.level >= 5 ? 2 : 1;
		notes.push(`${beams} beam${beams > 1 ? 's' : ''}, each its own attack`);
		if (has('agonizing blast|phb')) notes.push(`Agonizing Blast: ${mod('cha')} damage per beam`);
		if (has('eldritch spear|phb')) notes.push('Eldritch Spear: range 300 feet');
		if (has('repelling blast|phb')) notes.push('Repelling Blast: push up to 10 feet per beam that hits');
		if (has('grasp of hadar|xge')) notes.push('Grasp of Hadar: pull 10 feet closer, once per turn');
		if (has('lance of lethargy|xge')) notes.push('Lance of Lethargy: speed −10 feet until your next turn, once per turn');
	}

	if (spell.level === 0 && own('cleric') && damage && c.level >= 8) {
		if (['knowledge', 'light', 'arcana', 'grave', 'peace'].includes(c.subclassKey ?? '')) notes.push(`Potent Spellcasting: ${mod('wis')} damage`);
	}
	if (sub('cleric', 'life') && heals && spell.level > 0) {
		notes.push(`Disciple of Life: +${2 + spell.level} hit points (+2 + the slot's level)`);
		if (c.level >= 17) notes.push('Supreme Healing: use the highest number for each healing die');
	}
	if (sub('cleric', 'tempest', 2) && damages('lightning', 'thunder')) notes.push('Destructive Wrath: Channel Divinity for maximum lightning or thunder damage');

	if (own('wizard') && spell.school === 'Evocation') {
		if (sub('wizard', 'evocation', 6) && spell.level === 0 && damage && text.includes('saving throw'))
			notes.push('Potent Cantrip: half damage on a successful save');
		if (sub('wizard', 'evocation', 10) && damage) notes.push(`Empowered Evocation: ${mod('int')} to one damage roll`);
	}
	if (sub('wizard', 'necromancy', 2) && spell.level > 0 && damage)
		notes.push(`Grim Harvest: kill with it to regain ${spell.school === 'Necromancy' ? '3' : '2'} × the slot's level in hit points`);

	if (sub('sorcerer', 'draconic', 6) && damage)
		notes.push(`Elemental Affinity: ${mod('cha')} to one damage roll of your draconic ancestry's type; 1 sorcery point for resistance to it for an hour`);
	if (sub('sorcerer', 'storm', 6) && spell.level > 0 && damages('lightning', 'thunder'))
		notes.push(`Heart of the Storm: ${Math.floor(c.level / 2)} lightning or thunder damage to creatures of your choice within 10 feet`);
	if (sub('sorcerer', 'divine-soul', 6) && heals) notes.push('Empowered Healing: 1 sorcery point to reroll healing dice');

	if (sub('warlock', 'celestial', 6) && damages('radiant', 'fire')) notes.push(`Radiant Soul: ${mod('cha')} to one radiant or fire damage roll against one target`);
	if (sub('druid', 'wildfire', 6) && (damages('fire') || heals)) notes.push('Enhanced Bond: +1d8 to one fire damage or healing roll while your wildfire spirit is summoned');
	if (sub('artificer', 'alchemist', 5) && own('artificer') && (heals || damages('acid', 'fire', 'necrotic', 'poison')))
		notes.push(`Alchemical Savant: ${signedMod(Math.max(1, abilityMod(abilityScores(c).int)))} to one healing or acid, fire, necrotic or poison damage roll (with alchemist's supplies)`);

	if (feat('spell sniper|phb') && text.includes('spell attack')) notes.push('Spell Sniper: double range; ignores half and three-quarters cover');
	if (feat('elemental adept|phb') && damages('acid', 'cold', 'fire', 'lightning', 'thunder'))
		notes.push('Elemental Adept: for your chosen type, ignore resistance and treat 1s on damage dice as 2s');

	return notes;
}
