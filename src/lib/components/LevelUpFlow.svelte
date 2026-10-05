<script lang="ts" module>
	import type { Ability, Character, ClassOptionKind, Skill } from '$lib/types';

	/** Everything the player has picked for one level, kept by the page so a level's picks survive going back. */
	export interface FlowPicks {
		index: number;
		subclass: string[];
		roll: number | null;
		improvementKind: 'asi' | 'feat';
		asi: Ability[];
		feat: string[];
		featAbility?: Ability;
		featSkills: Skill[];
		featExpertise: Skill[];
		featWeapons: string[];
		styles: string[];
		expertise: string[];
		metamagic: string[];
		/** Option refs by kind, starting from those already known. */
		options: Partial<Record<ClassOptionKind, string[]>>;
		weapons: string[];
		cantrips: string[];
		spells: string[];
		arcanum: string[];
		forget: string;
		/** Lists picked for subclasses with variants (Land terrain), by owner. */
		variants: Record<string, string>;
		/** Picks for each grant choice by choice key, starting from those already made. */
		grantPicks: Record<string, string[]>;
		/** A subclass-list spell to trade: `<grant key>@<original spell id>`, or ''. */
		swapFrom: string;
		swapTo: string[];
	}

	export function newPicks(start: Character): FlowPicks {
		const options: FlowPicks['options'] = {};
		for (const o of start.classOptions) (options[o.kind] ??= []).push(o.ref);
		const grantPicks: FlowPicks['grantPicks'] = {};
		for (const s of start.spells) if (s.grant && !s.replaces) (grantPicks[s.grant] ??= []).push(s.id);
		return {
			index: 0,
			subclass: [],
			roll: null,
			improvementKind: 'asi',
			asi: [],
			feat: [],
			featSkills: [],
			featExpertise: [],
			featWeapons: [],
			styles: [...start.fightingStyles],
			expertise: [],
			metamagic: [...start.metamagic],
			options,
			weapons: [],
			cantrips: [],
			spells: [],
			arcanum: [],
			forget: '',
			variants: {},
			grantPicks,
			swapFrom: '',
			swapTo: []
		};
	}
</script>

<script lang="ts">
	import PickList, { type PickItem } from './PickList.svelte';
	import SpellDetails from './SpellDetails.svelte';
	import { CLASS_MAP } from '$lib/data/classes';
	import { classOption, loadContent, loadFeats, loadOptions, type ClassOptionData, type Content, type FeatData } from '$lib/data/content';
	import { ABILITIES, ABILITY_SHORT, abilityMod, signedMod } from '$lib/rules/abilities';
	import { FIGHTING_STYLE_MAP, fightingStyleOptions } from '$lib/rules/attacks';
	import {
		applyChoices,
		applyLevelUp,
		featAbilities,
		levelUpChanges,
		levelUpNeeds,
		OPTION_INFO,
		subclassLevel,
		type FeatChoice,
		type LevelUpChoices
	} from '$lib/rules/levelup';
	import { proficiencyLabel, WEAPONS, weaponProficiencies } from '$lib/rules/proficiency';
	import { METAMAGIC } from '$lib/rules/resources';
	import { saveProficiencySource } from '$lib/rules/saves';
	import { raceSkills, SKILLS } from '$lib/rules/skills';
	import { ordinal, pactSlots, slotMax } from '$lib/rules/spellcasting';
	import { abilityBreakdown, recompute } from '$lib/rules/stats';
	import { hitDie, hpForLevel, hpGain, xpForLevel } from '$lib/rules/xp';
	import { characterSpells, spellListClass, spellPool } from '$lib/library.svelte';
	import {
		canSwapTo,
		expandedBy,
		filterLabel,
		grantChoices,
		grantedIds,
		matchesFilter,
		newGrantChoices,
		newGrants,
		schoolLimit,
		swappable,
		variantPicks,
		type GrantCharacter
	} from '$lib/rules/grants';
	import type { ClassOption, Spell } from '$lib/types';

	let {
		start,
		first = false,
		mode,
		picks = $bindable(),
		finishLabel,
		onfinish,
		onback
	}: {
		/** The character before this level; with `first`, a new character at 1st level before its choices. */
		start: Character;
		first?: boolean;
		/** 'level-up' adds what's new, hit points and a review; 'create' only asks for choices. */
		mode: 'level-up' | 'create';
		picks: FlowPicks;
		finishLabel: string;
		/** Called from the last step with the level's choices (and HP when levelling up) and the spells learned. */
		onfinish: (choices: LevelUpChoices, learned: Spell[]) => void;
		/** Back from the first step. */
		onback?: () => void;
	} = $props();

	const create = $derived(mode === 'create');
	const level = $derived(first ? start.level : start.level + 1);
	const cls = $derived(CLASS_MAP.get(start.classKey));
	const className = $derived(cls?.name ?? start.classKey);
	const needsSubclass = $derived(!start.subclassKey && level >= subclassLevel(start.classKey) && !!cls?.subclasses.length);
	const scoresNow = $derived(abilityBreakdown(start).withoutItems);
	const skillName = (k: string) => SKILLS.find((s) => s.key === k)?.name ?? k;

	let content = $state.raw<Content | null>(null);
	let feats = $state.raw<FeatData[]>([]);
	let options = $state.raw<ClassOptionData[]>([]);
	let failed = $state(false);
	let attempt = $state(0);

	$effect(() => {
		void attempt;
		failed = false;
		let live = true;
		Promise.all([loadContent(), loadFeats(), loadOptions()]).then(
			([c, f, o]) => {
				if (!live) return;
				content = c;
				feats = f;
				options = o;
			},
			() => live && (failed = true)
		);
		return () => (live = false);
	});

	// ---- Choices -------------------------------------------------------------------------------

	const subclassKey = $derived(needsSubclass ? picks.subclass[0] : start.subclassKey);
	/** The character at this level with the subclass picked, for working out what the level asks for. */
	const next = $derived(recompute({ ...structuredClone(start), level, subclassKey }));
	const needs = $derived(levelUpNeeds(start, next, first));
	/** A race's 1st-level feat has no Ability Score Improvement to choose instead. */
	const featOnly = $derived(!needs.asi && needs.raceFeat);

	const feat = $derived(feats.find((f) => f.id === picks.feat[0]));
	const featChoice = $derived<FeatChoice | undefined>(
		feat && {
			kind: 'feat',
			feat,
			ability: feat.ability?.choose ? picks.featAbility : undefined,
			skills: picks.featSkills,
			expertise: picks.featExpertise,
			weapons: feat.weapons ? picks.featWeapons : undefined,
			...(featOnly ? { fromRace: true } : {})
		}
	);

	const optionById = $derived(new Map(options.map((o) => [o.id, o])));
	const pickedOptions = (kind: ClassOptionKind): ClassOption[] =>
		(picks.options[kind] ?? []).flatMap((ref) => {
			const data = optionById.get(ref);
			const known = start.classOptions.find((o) => o.ref === ref);
			return data ? [classOption(data)] : known ? [known] : [];
		});

	// Granted spells: what this level's subclass, pact boon, fighting styles and list picks bring.
	/** Class options after this level's picks (a new pact boon brings its cantrips). */
	const optionsNow = $derived([
		...start.classOptions.filter((o) => !needs.options.some((n) => n.kind === o.kind)),
		...needs.options.flatMap((o) => pickedOptions(o.kind))
	]);
	/** The character at this level with its subclass, pact boon, fighting styles and list picks, for its grants. */
	const grantChar = $derived<GrantCharacter>({
		classKey: start.classKey,
		subclassKey,
		level,
		classOptions: optionsNow,
		fightingStyles: needs.fightingStyles ? picks.styles : start.fightingStyles,
		grantVariants: { ...start.grantVariants, ...picks.variants },
		spells: start.spells
	});
	/** Lists to pick between that haven't been picked before (Land terrain at 2nd level). */
	const variantsToPick = $derived(variantPicks(grantChar).filter((v) => !start.grantVariants?.[v.owner]));
	const arrivingChoices = $derived(new Set(newGrantChoices(first ? null : start, grantChar).map((ch) => ch.key)));
	/** Choices arriving now, plus older ones not filled yet (a character from before choices were asked for). */
	const openChoices = $derived(grantChoices(grantChar).filter((ch) => arrivingChoices.has(ch.key) || ch.picked.length < ch.count));
	const swaps = $derived(create || first ? [] : swappable(start));
	const swap = $derived.by(() => {
		const [grant, original] = picks.swapFrom.split('@');
		return swaps.find((x) => x.grant.key === grant && x.original === original);
	});
	const hasGrants = $derived(variantsToPick.length > 0 || arrivingChoices.size > 0 || swaps.length > 0);

	const choices = $derived<LevelUpChoices>({
		hp: 0,
		subclassKey: needsSubclass ? subclassKey : undefined,
		improvement: needs.asi
			? picks.improvementKind === 'asi'
				? { kind: 'asi', abilities: picks.asi }
				: featChoice
			: needs.raceFeat
				? featChoice
				: undefined,
		fightingStyles: needs.fightingStyles ? picks.styles : undefined,
		weapons: needs.weapons ? picks.weapons : undefined,
		expertise: needs.expertise ? (picks.expertise as Skill[]) : undefined,
		metamagic: needs.metamagic ? picks.metamagic : undefined,
		optionKinds: needs.options.map((o) => o.kind),
		options: needs.options.flatMap((o) => pickedOptions(o.kind)),
		learn: [...picks.cantrips, ...picks.spells, ...picks.arcanum],
		forget: picks.forget ? [picks.forget] : [],
		grantVariants: Object.keys(picks.variants).length ? picks.variants : undefined,
		grantSpells: openChoices.length ? Object.fromEntries(openChoices.map((ch) => [ch.key, picks.grantPicks[ch.key] ?? []])) : undefined,
		grantSwap: swap && picks.swapTo[0] ? { grant: swap.grant.key, original: swap.original, to: picks.swapTo[0] } : undefined
	});

	/** The character after this level's choices so far (HP for the new level not yet added). */
	const preview = $derived.by(() => {
		const d = structuredClone($state.snapshot(start) as Character);
		const ch = $state.snapshot(choices) as LevelUpChoices;
		if (first) applyChoices(d, ch, level);
		else applyLevelUp(d, ch);
		return recompute(d);
	});

	const gain = $derived(hpGain(preview));
	const die = $derived(hitDie(start.classKey));
	const rollOk = $derived(Number.isInteger(picks.roll) && picks.roll! >= 1 && picks.roll! <= die);
	const hp = $derived(hpForLevel(rollOk ? picks.roll! : gain.average, gain.bonus));
	const changes = $derived(create ? [] : levelUpChanges(start, preview));

	// ---- Steps ---------------------------------------------------------------------------------

	type StepKey =
		| 'overview'
		| 'subclass'
		| 'improvement'
		| 'hp'
		| 'styles'
		| 'weapons'
		| 'expertise'
		| 'metamagic'
		| 'spells'
		| 'grants'
		| 'review'
		| ClassOptionKind;

	const hasSpells = $derived(needs.cantrips > 0 || needs.spells > 0 || needs.arcanum !== null);
	const steps = $derived(
		[
			!create && 'overview',
			needsSubclass && 'subclass',
			(needs.asi || needs.raceFeat) && 'improvement',
			!create && 'hp',
			needs.fightingStyles && 'styles',
			needs.weapons && 'weapons',
			needs.expertise && 'expertise',
			needs.metamagic && 'metamagic',
			...needs.options.map((o) => o.kind),
			hasSpells && 'spells',
			hasGrants && 'grants',
			!create && 'review'
		].filter((s): s is StepKey => !!s)
	);
	const STEP_TITLE: Record<string, string> = {
		overview: "What's new",
		subclass: 'Subclass',
		hp: 'Hit points',
		styles: 'Fighting style',
		weapons: 'Weapon proficiencies',
		expertise: 'Expertise',
		metamagic: 'Metamagic',
		spells: 'Spells',
		grants: 'Granted spells',
		review: 'Review'
	};
	const title = (s: StepKey) =>
		s === 'improvement' ? (featOnly ? 'Feat' : 'Ability Score Improvement') : (STEP_TITLE[s] ?? OPTION_INFO[s as ClassOptionKind].many);

	const index = $derived(Math.min(picks.index, steps.length - 1));
	const step = $derived(steps[index]);
	const last = $derived(index === steps.length - 1);

	function go(to: number) {
		picks.index = Math.max(0, Math.min(steps.length - 1, to));
		window.scrollTo({ top: 0 });
	}

	// ---- Ability Score Improvement -------------------------------------------------------------

	const asiCount = (a: Ability) => picks.asi.filter((x) => x === a).length;
	const canRaise = (a: Ability) => picks.asi.length < 2 && scoresNow[a] + asiCount(a) < 20;
	const lower = (a: Ability) => {
		const i = picks.asi.lastIndexOf(a);
		if (i >= 0) picks.asi = picks.asi.filter((_, j) => j !== i);
	};

	// ---- Feats ---------------------------------------------------------------------------------

	/** Feats can be taken once, except Elemental Adept (a different damage type each time). */
	const REPEATABLE = new Set(['elemental adept|phb']);
	const takenFeats = $derived(new Set(start.feats.map((f) => f.ref)));
	const featItems = $derived<PickItem[]>(
		feats.map((f) => {
			const taken = takenFeats.has(f.id) && !REPEATABLE.has(f.id);
			const raises = f.ability?.fixed
				? Object.keys(f.ability.fixed).map((k) => `${ABILITY_SHORT[k as Ability]} +1`).join(', ')
				: f.ability?.choose
					? `+1 ${f.ability.choose.map((k) => ABILITY_SHORT[k]).join('/')}`
					: '';
			return {
				id: f.id,
				name: f.name,
				meta: [f.prerequisite, raises, taken ? 'Already taken' : ''].filter(Boolean).join(' · '),
				text: f.text,
				disabled: taken
			};
		})
	);
	const proficientNow = $derived(new Set<Skill>([...start.skillProficiencies, ...raceSkills(start).skills]));
	const featSkillOptions = $derived(
		feat?.skills ? SKILLS.filter((s) => (feat.skills!.from === 'any' || feat.skills!.from.includes(s.key)) && !proficientNow.has(s.key)) : []
	);
	const featExpertiseOptions = $derived(
		SKILLS.filter((s) => (proficientNow.has(s.key) || picks.featSkills.includes(s.key)) && !start.skillExpertise.includes(s.key))
	);
	const featAbilityOk = (a: Ability) =>
		scoresNow[a] + (feat?.ability?.amount ?? 1) <= 20 && !(feat?.save && saveProficiencySource(start, a));

	// Picking another feat starts its choices over.
	let lastFeat = picks.feat[0] ?? '';
	$effect(() => {
		const id = picks.feat[0] ?? '';
		if (id === lastFeat) return;
		lastFeat = id;
		picks.featAbility = undefined;
		picks.featSkills = [];
		picks.featExpertise = [];
		picks.featWeapons = [];
	});

	function togglePick<T>(list: T[], value: T, max: number): T[] {
		if (list.includes(value)) return list.filter((x) => x !== value);
		if (max === 1) return [value];
		return list.length < max ? [...list, value] : list;
	}

	// ---- Weapons -------------------------------------------------------------------------------

	const profsNow = $derived(weaponProficiencies(start));
	/** Weapons the character isn't proficient with yet; a Hobgoblin's Martial Training is martial weapons only. */
	const weaponGroups = $derived(
		WEAPONS.filter((g) => !profsNow.has(g.category) && !(first && start.raceKey === 'hobgoblin-vgm' && needs.weapons && g.category === 'simple'))
			.map((g) => ({ ...g, names: g.names.filter((n) => !profsNow.has(n)) }))
			.filter((g) => g.names.length)
	);
	const weaponCount = $derived(weaponGroups.reduce((n, g) => n + g.names.length, 0));

	const improvementOk = $derived.by(() => {
		if (!featOnly && picks.improvementKind === 'asi') return picks.asi.length === 2;
		if (!feat) return false;
		if (feat.ability?.choose && !picks.featAbility) return false;
		if (feat.skills && picks.featSkills.length < Math.min(feat.skills.count, featSkillOptions.length)) return false;
		if (feat.expertise && picks.featExpertise.length < Math.min(feat.expertise, featExpertiseOptions.length)) return false;
		if (feat.weapons && picks.featWeapons.length < Math.min(feat.weapons, weaponCount)) return false;
		return true;
	});

	// ---- Class expertise -----------------------------------------------------------------------

	const expertiseOptions = $derived(
		SKILLS.filter(
			(s) =>
				(preview.skillProficiencies.includes(s.key) || raceSkills(start).skills.includes(s.key)) &&
				!start.skillExpertise.includes(s.key) &&
				!(choices.improvement?.kind === 'feat' && choices.improvement.expertise.includes(s.key))
		)
	);

	// ---- Fighting styles, metamagic, class options ---------------------------------------------

	const styleItems = $derived<PickItem[]>(
		[...fightingStyleOptions(next).map((s) => s.key), ...start.fightingStyles]
			.filter((k, i, all) => all.indexOf(k) === i && FIGHTING_STYLE_MAP.has(k))
			.map((k) => {
				const s = FIGHTING_STYLE_MAP.get(k)!;
				return { id: s.key, name: s.name, meta: s.text };
			})
	);
	const metamagicItems: PickItem[] = METAMAGIC.map((m) => ({
		id: m.key,
		name: m.name,
		meta: m.cost === 'level' ? "Sorcery points: the spell's level (1 for a cantrip)" : `${m.cost} sorcery point${m.cost === 1 ? '' : 's'}`
	}));

	/** The pact boon picked (or already known), for invocations that need one. */
	const pactName = (name: string | undefined) => name?.replace(/^Pact of the /i, '').toLowerCase();
	const pact = $derived(
		pactName(pickedOptions('pact-boon')[0]?.name) ?? pactName(start.classOptions.find((o) => o.kind === 'pact-boon')?.name)
	);
	const optionItems = (kind: ClassOptionKind): PickItem[] =>
		options
			.filter((o) => o.kind === kind)
			.map((o) => ({
				id: o.id,
				name: o.name,
				meta: o.prerequisite,
				text: o.text,
				disabled: (o.level ?? 0) > level || (!!o.pact && o.pact !== pact)
			}));
	const optionTotal = (kind: ClassOptionKind) => needs.options.find((o) => o.kind === kind)?.total ?? 0;
	/** Asks for the full count unless there aren't that many to pick from. */
	const optionGoal = (kind: ClassOptionKind) =>
		Math.min(optionTotal(kind), optionItems(kind).filter((i) => !i.disabled || picks.options[kind]?.includes(i.id)).length);

	// ---- Spells --------------------------------------------------------------------------------

	const pool = $derived(spellPool(start));
	const listClass = $derived(spellListClass(start));
	/** Spells already known or prepared for free (granted by the class or subclass at the new level). */
	const knownIds = $derived(
		new Set([...start.spells.map((s) => s.id), ...grantedIds(grantChar)])
	);
	/** Spells a known caster can swap out: granted ones stay. */
	const knownLevelled = $derived(characterSpells(start).filter((x) => x.spell.level > 0 && !x.grant));
	const grantsGained = $derived(newGrants(start, next));
	/** Highest level of spell the character can learn: their slots (pact slots for a warlock). */
	const learnLevel = $derived(Math.max(slotMax(preview).length, pactSlots(preview)?.level ?? 0));
	const spellItem = (s: Spell): PickItem => {
		const expanded = expandedBy(grantChar, s);
		return {
			id: s.id,
			name: s.name,
			meta: `${s.level === 0 ? 'Cantrip' : `${ordinal(s.level)} level`} · ${s.school}${s.concentration ? ' · Conc' : ''}${s.ritual ? ' · Ritual' : ''}${expanded && !s.classes.includes(listClass) ? ` · ${expanded.tag}` : ''}`
		};
	};
	/** On the class list, or one a patron or Divine Soul adds, and not already known. */
	const onList = (s: Spell) => (s.classes.includes(listClass) || s.pack === 'custom' || !!expandedBy(grantChar, s)) && !knownIds.has(s.id);
	const cantripItems = $derived(pool.filter((s) => s.level === 0 && onList(s)).map(spellItem));
	const spellItems = $derived(
		pool.filter((s) => s.level > 0 && s.level <= learnLevel && onList(s) && !picks.arcanum.includes(s.id)).map(spellItem)
	);
	const arcanumItems = $derived(needs.arcanum ? pool.filter((s) => s.level === needs.arcanum && onList(s)).map(spellItem) : []);
	const spellById = $derived(new Map(pool.map((s) => [s.id, s])));
	const spellGoal = $derived(needs.spells + (picks.forget ? 1 : 0));
	/** Eldritch Knight and Arcane Trickster: spells from outside their two schools so far, and how many are allowed. */
	const schools = $derived(schoolLimit(next));
	const offSchool = $derived.by(() => {
		if (!schools) return 0;
		const known = characterSpells(start).filter((x) => !x.grant?.free && x.spell.level > 0 && x.spell.id !== picks.forget);
		const picked = picks.spells.map((id) => spellById.get(id)).filter((s): s is Spell => !!s);
		return [...known.map((x) => x.spell), ...picked].filter((s) => !schools.schools.includes(s.school)).length;
	});
	const schoolNote = $derived(
		schools
			? `${schools.schools.join(' or ')} only, except ${schools.anyMax} from any school (${offSchool} picked).`
			: ''
	);

	// Fewer spells to learn (a swap undone) drops the extra picks.
	$effect(() => {
		if (picks.spells.length > spellGoal) picks.spells = picks.spells.slice(0, spellGoal);
	});

	// ---- Granted spells ------------------------------------------------------------------------


	/** Spells picked anywhere else in this level, so a choice doesn't offer them twice. */
	const pickedElsewhere = (key: string) =>
		new Set([
			...picks.cantrips,
			...picks.spells,
			...Object.entries(picks.grantPicks).flatMap(([k, ids]) => (k === key ? [] : ids))
		]);
	const choiceItems = (key: string) => {
		const ch = openChoices.find((x) => x.key === key);
		if (!ch) return [];
		const elsewhere = pickedElsewhere(key);
		return pool
			.filter(
				(s) =>
					matchesFilter(s, ch.filter) &&
					(s.level === 0 || s.level <= Math.max(learnLevel, ...(ch.filter.levels ?? [0]))) &&
					(ch.picked.includes(s.id) || !knownIds.has(s.id))
			)
			.map((s) => ({ ...spellItem(s), disabled: elsewhere.has(s.id) }));
	};
	const choiceGoal = (key: string) => {
		const ch = openChoices.find((x) => x.key === key);
		return ch ? Math.min(ch.count, choiceItems(key).filter((i) => !i.disabled).length) : 0;
	};
	const swapItems = $derived.by(() => {
		if (!swap) return [];
		const current = spellById.get(swap.id);
		if (!current) return [];
		return pool.filter((s) => s.id !== swap.id && canSwapTo(swap.grant, current, s) && !knownIds.has(s.id)).map(spellItem);
	});
	const grantsOk = $derived(
		variantsToPick.every((v) => !!picks.variants[v.owner]) &&
			openChoices.every((ch) => !arrivingChoices.has(ch.key) || (picks.grantPicks[ch.key]?.length ?? 0) === choiceGoal(ch.key))
	);

	// Another spell to trade starts the replacement over.
	let lastSwap = picks.swapFrom;
	$effect(() => {
		if (picks.swapFrom === lastSwap) return;
		lastSwap = picks.swapFrom;
		picks.swapTo = [];
	});

	// ---- Step checks and finishing -------------------------------------------------------------

	function stepOk(s: StepKey): boolean {
		switch (s) {
			case 'subclass':
				return !!subclassKey;
			case 'improvement':
				return improvementOk;
			case 'hp':
				return picks.roll === null || rollOk;
			case 'styles':
				return picks.styles.length === Math.min(needs.fightingStyles, styleItems.length);
			case 'weapons':
				return picks.weapons.length === Math.min(needs.weapons, weaponCount);
			case 'expertise':
				return picks.expertise.length === Math.min(needs.expertise, expertiseOptions.length);
			case 'metamagic':
				return picks.metamagic.length === needs.metamagic;
			case 'grants':
				return grantsOk;
			case 'overview':
			case 'spells':
			case 'review':
				return true;
			default:
				return (picks.options[s]?.length ?? 0) === optionGoal(s);
		}
	}

	const ready = $derived(!!content && steps.every(stepOk));
	const maxBefore = $derived(start.hpMax);
	const maxAfter = $derived(preview.hpMax + hp);
	const xpShort = $derived(!create && !start.milestone && start.xp < xpForLevel(level));

	function finish() {
		if (!ready) return;
		const final = { ...($state.snapshot(choices) as LevelUpChoices), hp: create ? 0 : hp };
		const ids = [...(final.learn ?? []), ...Object.values(final.grantSpells ?? {}).flat(), ...(final.grantSwap ? [final.grantSwap.to] : [])];
		const learned = ids.map((id) => spellById.get(id)).filter((s): s is Spell => !!s);
		onfinish(final, learned);
	}

	function back() {
		if (index > 0) go(index - 1);
		else onback?.();
	}

	/** A subclass's opening feature holds its first features as "Name. Text" paragraphs; their names. */
	const partNames = (text: string) =>
		text
			.split('\n')
			.slice(1)
			.map((p) => /^([A-Z][^.•]{2,40})\. /.exec(p)?.[1])
			.filter((n): n is string => !!n);
	const newFeatures = $derived.by(() => {
		if (!content) return [];
		const c = content.classes[start.classKey];
		const sub = subclassKey ? c?.subclasses[subclassKey] : undefined;
		// A subclass picked now brings its features up to this level; otherwise just this level's.
		const fromSub = (sub ?? []).filter((f) => (needsSubclass ? f.level <= level : f.level === level));
		return [...(c?.features.filter((f) => f.level === level) ?? []), ...fromSub];
	});
	const subclassName = $derived(cls?.subclasses.find((s) => s.key === subclassKey)?.name);
	const subclassItems = $derived<PickItem[]>(
		(cls?.subclasses ?? []).map((s) => {
			const list = (content?.classes[start.classKey]?.subclasses[s.key] ?? []).filter((f) => f.level <= level);
			return {
				id: s.key,
				name: s.name,
				meta: [...new Set(list.flatMap((f) => (f.name === s.name ? partNames(f.text) : [f.name])))].join(', '),
				text: list.map((f) => `${f.name}. ${f.text}`).join('\n')
			};
		})
	);
</script>

{#snippet weaponChips(selected: string[], max: number, set: (v: string[]) => void)}
	{#each weaponGroups as g (g.category)}
		<p class="sub">{proficiencyLabel(g.category)}</p>
		<div class="chips skills">
			{#each g.names as n (n)}
				<button
					type="button"
					aria-pressed={selected.includes(n)}
					disabled={!selected.includes(n) && selected.length >= max}
					onclick={() => set(togglePick(selected, n, max))}>{proficiencyLabel(n)}</button
				>
			{/each}
		</div>
	{/each}
{/snippet}

{#if failed}
	<div class="card status" role="alert">
		<p>Couldn't load class details</p>
		<button type="button" onclick={() => attempt++}>Retry</button>
	</div>
{:else if !content}
	<p class="muted">Loading…</p>
{:else}
	{#if steps.length > 1}
		<ol class="progress" aria-label="Steps">
			{#each steps as s, i (s)}
				<li class:done={i < index} class:current={s === step}>
					<button
						type="button"
						aria-label="{title(s)}{s === step ? ' (this step)' : ''}"
						disabled={i > index && !steps.slice(0, i).every(stepOk)}
						onclick={() => go(i)}
					></button>
				</li>
			{/each}
		</ol>
	{/if}
	<h1>{title(step)}</h1>
	{#if create && newFeatures.length}
		<p class="hint new">New at level {level}: {newFeatures.map((f) => f.name).join(', ')}</p>
	{/if}
	{#if create}
		{#each grantsGained as g (g.name)}<p class="hint new">{g.name}: {g.spells.join(', ')}</p>{/each}
	{/if}

	{#if step === 'overview'}
		{#if xpShort}
			<p class="note warn">
				{start.name} has {start.xp.toLocaleString('en')} XP; level {level} starts at {xpForLevel(level).toLocaleString('en')}. Levelling up sets XP to that.
			</p>
		{/if}
		<p class="lead">Level {level} {className}{subclassName ? ` (${subclassName})` : ''}. Here's what it brings; the next steps go through the choices.</p>

		<h2 class="label">New features</h2>
		{#if newFeatures.length}
			<div class="card features">
				{#each newFeatures as f, i (i)}
					<details>
						<summary>{f.name}</summary>
						{#each f.text.split('\n').filter((p) => p.trim()) as para, j (j)}<p>{para}</p>{/each}
					</details>
				{/each}
			</div>
		{:else}
			<p class="muted">No new class features at this level.</p>
		{/if}
		{#if needsSubclass && !subclassKey}
			<p class="muted">Plus your subclass's features: you'll choose a subclass next.</p>
		{/if}

		<h2 class="label">What goes up</h2>
		<ul class="card changes">
			{#each changes as line (line)}<li>{line}</li>{/each}
		</ul>
	{:else if step === 'subclass'}
		<p class="lead">At level {subclassLevel(start.classKey)} a {className.toLowerCase()} chooses a subclass. Open one to read what it gives up to level {level}.</p>
		<PickList items={subclassItems} bind:selected={picks.subclass} max={1} label="Subclasses" />
	{:else if step === 'improvement'}
		{#if !featOnly}
			<div class="modes" role="radiogroup" aria-label="Improvement">
				<button type="button" role="radio" aria-checked={picks.improvementKind === 'asi'} onclick={() => (picks.improvementKind = 'asi')}>Ability scores</button>
				<button type="button" role="radio" aria-checked={picks.improvementKind === 'feat'} onclick={() => (picks.improvementKind = 'feat')}>Feat</button>
			</div>
		{/if}
		{#if !featOnly && picks.improvementKind === 'asi'}
			<p class="lead">Raise one score by 2, or two scores by 1 ({picks.asi.length}/2). Scores can't go above 20.</p>
			<div class="card abilities">
				{#each ABILITIES as a (a.key)}
					{@const n = asiCount(a.key)}
					{@const score = scoresNow[a.key] + n}
					<div class="ability">
						<span class="aname">{a.name}</span>
						<span class="score">{score}<small>{signedMod(abilityMod(score))}</small></span>
						<button type="button" aria-label="Lower {a.name}" disabled={!n} onclick={() => lower(a.key)}>−</button>
						<span class="plus" aria-label="{a.name} raised by {n}">{n ? `+${n}` : ''}</span>
						<button type="button" aria-label="Raise {a.name}" disabled={!canRaise(a.key)} onclick={() => (picks.asi = [...picks.asi, a.key])}>+</button>
					</div>
				{/each}
			</div>
		{:else}
			<p class="lead">
				{featOnly ? 'Your race gives you a feat at 1st level. ' : ''}Prerequisites are shown but not checked. Ability increases, skills,
				saves, weapons and Tough's hit points are applied for you.
			</p>
			<PickList items={featItems} bind:selected={picks.feat} max={1} label="Feats" search />
			{#if feat}
				<div class="card feat-choices">
					<h2>{feat.name}</h2>
					{#if feat.ability?.choose}
						<p class="sub">{feat.save ? 'Ability (+1, and proficiency in its saving throws)' : `Raise one ability by ${feat.ability.amount ?? 1}`}</p>
						<div class="chips">
							{#each feat.ability.choose as k (k)}
								<button type="button" aria-pressed={picks.featAbility === k} disabled={!featAbilityOk(k)} onclick={() => (picks.featAbility = k)}>{ABILITY_SHORT[k]}</button>
							{/each}
						</div>
					{:else if feat.ability?.fixed}
						<p class="sub">Raises {featAbilities({ kind: 'feat', feat, skills: [], expertise: [] }).map((k) => `${ABILITY_SHORT[k]} +1`).join(', ')}</p>
					{/if}
					{#if feat.skills}
						<p class="sub">
							Skill proficiency: choose {feat.skills.count} ({picks.featSkills.length}/{feat.skills.count}){feat.skills.from === 'any' ? '. Tools count too; add those in your notes.' : ''}
						</p>
						<div class="chips skills">
							{#each featSkillOptions as s (s.key)}
								<button
									type="button"
									aria-pressed={picks.featSkills.includes(s.key)}
									disabled={!picks.featSkills.includes(s.key) && picks.featSkills.length >= feat.skills.count}
									onclick={() => {
										picks.featSkills = togglePick(picks.featSkills, s.key, feat!.skills!.count);
										picks.featExpertise = picks.featExpertise.filter((k) => featExpertiseOptions.some((o) => o.key === k));
									}}>{s.name}</button
								>
							{/each}
						</div>
					{/if}
					{#if feat.expertise}
						<p class="sub">Expertise: choose {feat.expertise} skill you're proficient in</p>
						<div class="chips skills">
							{#each featExpertiseOptions as s (s.key)}
								<button
									type="button"
									aria-pressed={picks.featExpertise.includes(s.key)}
									onclick={() => (picks.featExpertise = togglePick(picks.featExpertise, s.key, feat!.expertise!))}>{s.name}</button
								>
							{/each}
						</div>
					{/if}
					{#if feat.weapons}
						<p class="sub">Weapon proficiency: choose {feat.weapons} ({picks.featWeapons.length}/{feat.weapons})</p>
						{@render weaponChips(picks.featWeapons, feat.weapons, (v) => (picks.featWeapons = v))}
						{#if !weaponCount}<p class="muted">You're proficient with every weapon already.</p>{/if}
					{/if}
					<p class="hint">Anything else it gives (spells, armor proficiencies, initiative) goes in Spells or Edit afterwards.</p>
				</div>
			{/if}
		{/if}
	{:else if step === 'hp'}
		<p class="lead">
			Roll a d{die} or take {gain.average}, then add {gain.parts.map((p) => `${p.label} ${signedMod(p.value)}`).join(', ')}.
		</p>
		<label class="field">
			<span>Your d{die} roll</span>
			<input
				type="number"
				inputmode="numeric"
				min="1"
				max={die}
				step="1"
				bind:value={picks.roll}
				placeholder="{gain.average} (average)"
				aria-invalid={picks.roll !== null && !rollOk}
			/>
		</label>
		{#if picks.roll !== null && !rollOk}<p class="error">A d{die} rolls 1 to {die}.</p>{/if}
		<p class="big">+{hp} max HP</p>
		{#if maxAfter - maxBefore !== hp}
			<p class="muted">
				Max HP {maxBefore} → {maxAfter}, counting {preview.feats.some((f) => f.hpPerLevel && f.level === level) ? 'your new feat' : 'your new Constitution modifier'} on earlier levels.
			</p>
		{/if}
	{:else if step === 'styles'}
		<p class="lead">
			Choose {needs.fightingStyles === 1 ? 'a fighting style' : `${needs.fightingStyles} fighting styles`} ({picks.styles.length}/{needs.fightingStyles}).
		</p>
		<PickList items={styleItems} bind:selected={picks.styles} max={needs.fightingStyles} label="Fighting styles" />
	{:else if step === 'weapons'}
		<p class="lead">{needs.weaponNotes.join(' ')} ({picks.weapons.length}/{needs.weapons})</p>
		{@render weaponChips(picks.weapons, needs.weapons, (v) => (picks.weapons = v))}
		{#if !weaponCount}<p class="muted">You're proficient with every weapon already.</p>{/if}
	{:else if step === 'expertise'}
		<p class="lead">
			Choose {needs.expertise} skills you're proficient in to double your proficiency bonus ({picks.expertise.length}/{needs.expertise}).
			{start.classKey === 'rogue' ? "Thieves' tools can be one of them; note that in your notes." : ''}
		</p>
		<div class="chips skills">
			{#each expertiseOptions as s (s.key)}
				<button
					type="button"
					aria-pressed={picks.expertise.includes(s.key)}
					disabled={!picks.expertise.includes(s.key) && picks.expertise.length >= needs.expertise}
					onclick={() => (picks.expertise = togglePick(picks.expertise, s.key, needs.expertise))}>{s.name}</button
				>
			{/each}
		</div>
		{#if !expertiseOptions.length}<p class="muted">No proficient skills without expertise. Add skill proficiencies in Edit.</p>{/if}
	{:else if step === 'metamagic'}
		<p class="lead">You know {needs.metamagic} Metamagic options at level {level} ({picks.metamagic.length}/{needs.metamagic}).</p>
		<PickList items={metamagicItems} bind:selected={picks.metamagic} max={needs.metamagic} label="Metamagic" />
	{:else if step === 'spells'}
		{#if needs.cantrips}
			<h2 class="label">Cantrips · {picks.cantrips.length}/{needs.cantrips}</h2>
			<PickList items={cantripItems} bind:selected={picks.cantrips} max={needs.cantrips} label="Cantrips" search>
				{#snippet details(item)}{@const s = spellById.get(item.id)}{#if s}<SpellDetails spell={s} compact />{/if}{/snippet}
			</PickList>
		{/if}
		{#if needs.swapSpell && knownLevelled.length}
			<label class="field">
				<span>Replace a spell you know (optional)</span>
				<select bind:value={picks.forget}>
					<option value="">Keep them all</option>
					{#each knownLevelled as { spell } (spell.id)}<option value={spell.id}>{spell.name}</option>{/each}
				</select>
			</label>
		{/if}
		{#if spellGoal}
			<h2 class="label">{needs.prep === 'spellbook' ? 'Copy into your spellbook' : 'New spells'} · {picks.spells.length}/{spellGoal}</h2>
			<p class="hint">Up to {ordinal(learnLevel)} level.{schoolNote ? ` ${schoolNote}` : ''}</p>
			<PickList items={spellItems} bind:selected={picks.spells} max={spellGoal} label="Spells" search>
				{#snippet details(item)}{@const s = spellById.get(item.id)}{#if s}<SpellDetails spell={s} compact />{/if}{/snippet}
			</PickList>
		{/if}
		{#if needs.arcanum}
			<h2 class="label">Mystic Arcanum · {ordinal(needs.arcanum)} level</h2>
			<PickList items={arcanumItems} bind:selected={picks.arcanum} max={1} label="Mystic Arcanum" search>
				{#snippet details(item)}{@const s = spellById.get(item.id)}{#if s}<SpellDetails spell={s} compact />{/if}{/snippet}
			</PickList>
		{/if}
		<p class="hint">You can leave picks for later and add spells from the Spells tab.</p>
	{:else if step === 'grants'}
		{#each variantsToPick as v (v.owner)}
			<h2 class="label">{v.label}</h2>
			<div class="chips skills">
				{#each v.variants as name (name)}
					<button type="button" aria-pressed={picks.variants[v.owner] === name} onclick={() => (picks.variants = { ...picks.variants, [v.owner]: name })}
						>{name}</button
					>
				{/each}
			</div>
		{/each}
		{#each grantsGained as g (g.name)}
			<p class="hint new">{g.name}: {g.spells.join(', ')}</p>
		{/each}
		{#each openChoices as ch (ch.key)}
			{@const goal = choiceGoal(ch.key)}
			{@const items = choiceItems(ch.key)}
			<h2 class="label">{ch.grant.name} · {picks.grantPicks[ch.key]?.length ?? 0}/{ch.count}</h2>
			<p class="hint">
				Pick {ch.count}: {filterLabel(ch.filter, (id) => spellById.get(id)?.name ?? id)}.{ch.grant.free
					? ' They don’t count against the spells you know.'
					: ''}{arrivingChoices.has(ch.key) ? '' : ' Optional now; you can also pick them in the spellbook.'}
			</p>
			<PickList
				{items}
				bind:selected={() => picks.grantPicks[ch.key] ?? [], (ids) => (picks.grantPicks = { ...picks.grantPicks, [ch.key]: ids })}
				max={Math.max(goal, ch.count)}
				label={ch.grant.name}
				search={items.length > 12}
			>
				{#snippet details(item)}{@const s = spellById.get(item.id)}{#if s}<SpellDetails spell={s} compact />{/if}{/snippet}
			</PickList>
		{/each}
		{#if swaps.length}
			<label class="field">
				<span>Replace a {swaps[0].grant.name.toLowerCase().replace(/s$/, '')} (optional)</span>
				<select bind:value={picks.swapFrom}>
					<option value="">Keep them all</option>
					{#each swaps as x (x.original)}
						<option value="{x.grant.key}@{x.original}">{spellById.get(x.id)?.name ?? x.id}</option>
					{/each}
				</select>
			</label>
			{#if swap}
				{@const sw = swap.grant.swap}
				<p class="hint">A {sw ? `${sw.schools.join(' or ').toLowerCase()} spell from the ${sw.classes.join(', ')} lists` : 'spell'} of the same level.</p>
				<PickList items={swapItems} bind:selected={picks.swapTo} max={1} label="Replacement" search>
					{#snippet details(item)}{@const s = spellById.get(item.id)}{#if s}<SpellDetails spell={s} compact />{/if}{/snippet}
				</PickList>
			{/if}
		{/if}
	{:else if step === 'review'}
		{@const names = (ids: string[]) => ids.map((id) => spellById.get(id)?.name ?? id).join(', ')}
		<ul class="card review">
			<li><b>Level</b> {start.level} → {level}</li>
			<li><b>Max HP</b> {maxBefore} → {maxAfter}</li>
			{#if subclassName && needsSubclass}<li><b>Subclass</b> {subclassName}</li>{/if}
			{#if choices.improvement?.kind === 'asi'}
				<li><b>Ability scores</b> {[...new Set(picks.asi)].map((k) => `${ABILITY_SHORT[k]} +${asiCount(k)}`).join(', ')}</li>
			{:else if choices.improvement?.kind === 'feat'}
				{@const f = choices.improvement}
				<li>
					<b>Feat</b>
					{f.feat.name}{[
						...featAbilities(f).map((k) => `${ABILITY_SHORT[k]} +1`),
						...(f.feat.save && f.ability ? [`${ABILITY_SHORT[f.ability]} saves`] : []),
						...f.skills.map(skillName),
						...f.expertise.map((k) => `${skillName(k)} expertise`),
						...(f.weapons ?? []).map(proficiencyLabel)
					]
						.map((x, i) => (i ? ', ' : ': ') + x)
						.join('')}
				</li>
			{/if}
			{#if needs.fightingStyles}<li><b>Fighting styles</b> {picks.styles.map((k) => FIGHTING_STYLE_MAP.get(k)?.name ?? k).join(', ')}</li>{/if}
			{#if needs.weapons}<li><b>Weapon proficiencies</b> {picks.weapons.map(proficiencyLabel).join(', ') || 'None'}</li>{/if}
			{#if needs.expertise}<li><b>Expertise</b> {picks.expertise.map(skillName).join(', ') || 'None'}</li>{/if}
			{#if needs.metamagic}<li><b>Metamagic</b> {picks.metamagic.map((k) => METAMAGIC.find((m) => m.key === k)?.name ?? k).join(', ')}</li>{/if}
			{#each needs.options as o (o.kind)}
				<li><b>{OPTION_INFO[o.kind].many}</b> {pickedOptions(o.kind).map((x) => x.name).join(', ') || 'None'}</li>
			{/each}
			{#if picks.cantrips.length}<li><b>Cantrips</b> {names(picks.cantrips)}</li>{/if}
			{#if picks.spells.length}<li><b>{needs.prep === 'spellbook' ? 'Spellbook' : 'Spells'}</b> {names(picks.spells)}</li>{/if}
			{#if picks.arcanum.length}<li><b>Mystic Arcanum</b> {names(picks.arcanum)}</li>{/if}
			{#if picks.forget}<li><b>Replaced</b> {names([picks.forget])}</li>{/if}
			{#each grantsGained as g (g.name)}<li><b>{g.name}</b> {g.spells.join(', ')}</li>{/each}
			{#each Object.entries(picks.variants) as [owner, name] (owner)}<li><b>{variantsToPick.find((v) => v.owner === owner)?.label ?? 'List'}</b> {name}</li>{/each}
			{#each openChoices as ch (ch.key)}
				{#if picks.grantPicks[ch.key]?.length}<li><b>{ch.grant.name}</b> {names(picks.grantPicks[ch.key])}</li>{/if}
			{/each}
			{#if swap && picks.swapTo[0]}<li><b>Swapped</b> {names([swap.id])} → {names(picks.swapTo)}</li>{/if}
		</ul>
		{#if !ready}<p class="error">Some steps still need a choice.</p>{/if}
	{:else}
		{@const kind = step as ClassOptionKind}
		<p class="lead">
			You know {optionTotal(kind)} at level {level} ({picks.options[kind]?.length ?? 0}/{optionGoal(kind)}).
			{start.classOptions.some((o) => o.kind === kind) ? (OPTION_INFO[kind].swap ?? '') : ''}
		</p>
		<PickList
			items={optionItems(kind)}
			bind:selected={() => picks.options[kind] ?? [], (v) => (picks.options[kind] = v)}
			max={optionTotal(kind)}
			label={OPTION_INFO[kind].many}
			search={optionItems(kind).length > 12}
		/>
	{/if}

	<nav class="footer">
		<button type="button" class="secondary" disabled={index === 0 && !onback} onclick={back}>Back</button>
		{#if last}
			<button type="button" class="primary" disabled={!ready} onclick={finish}>{finishLabel}</button>
		{:else}
			<button type="button" class="primary" disabled={!stepOk(step)} onclick={() => go(index + 1)}>Next</button>
		{/if}
	</nav>
{/if}

<style>
	h1 {
		font-size: 26px;
		font-weight: 900;
		margin: 10px 0 8px;
	}

	h2.label {
		margin: 18px 0 8px;
	}

	.progress {
		list-style: none;
		display: flex;
		gap: 4px;
		padding: 0;
	}

	.progress li {
		flex: 1;
	}

	.progress button {
		display: block;
		width: 100%;
		height: 24px;
		padding: 0;
		border: 0;
		border-radius: 0;
		background: transparent;
		position: relative;
	}

	.progress button::after {
		content: '';
		position: absolute;
		left: 0;
		right: 0;
		top: 10px;
		height: 5px;
		border-radius: 999px;
		background: var(--color-border);
	}

	.progress .done button::after {
		background: var(--color-accent-dim);
	}

	.progress .current button::after {
		background: var(--color-accent);
	}

	.lead {
		margin-bottom: 12px;
		color: var(--color-text-muted);
	}

	.muted {
		color: var(--color-text-muted);
		font-size: 14px;
	}

	.hint {
		margin: 6px 0;
		font-size: 13px;
		color: var(--color-text-muted);
	}

	.hint.new {
		margin: -2px 0 12px;
	}

	.error {
		margin-top: 8px;
		color: var(--color-danger);
		font-size: 14px;
	}

	.note {
		margin-bottom: 12px;
		padding: 10px 12px;
		border-radius: var(--radius-lg);
		font-size: 14px;
	}

	.note.warn {
		background: var(--color-alert-bg);
		border: 1px solid var(--color-alert-edge);
		color: var(--color-alert-ink);
	}

	.features {
		padding: 4px 14px;
	}

	.features details + details {
		border-top: 1px solid var(--color-border);
	}

	.features summary {
		min-height: 44px;
		display: flex;
		align-items: center;
		font-weight: 700;
		cursor: pointer;
	}

	.features p {
		margin-bottom: 8px;
		font-size: 14px;
		color: var(--color-text-muted);
	}

	.changes,
	.review {
		list-style: none;
		padding: 6px 14px;
	}

	.changes li,
	.review li {
		padding: 8px 0;
		font-size: 15px;
		font-variant-numeric: tabular-nums;
	}

	.changes li + li,
	.review li + li {
		border-top: 1px solid var(--color-border);
	}

	.review b {
		display: block;
		font-size: 12px;
		font-weight: 800;
		letter-spacing: 0.06em;
		text-transform: uppercase;
		color: var(--color-text-muted);
	}

	.modes {
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: 6px;
		margin-bottom: 12px;
	}

	.modes button {
		height: 44px;
		background: var(--color-surface);
		border: 1.5px solid var(--color-border-strong);
		color: var(--color-text);
		font-weight: 800;
	}

	.modes button[aria-checked='true'] {
		background: var(--color-accent);
		border-color: var(--color-accent);
		color: var(--color-on-accent);
	}

	.abilities {
		padding: 4px 12px;
	}

	.ability {
		display: grid;
		grid-template-columns: minmax(0, 1fr) auto 44px 32px 44px;
		align-items: center;
		gap: 6px;
		min-height: 56px;
	}

	.ability + .ability {
		border-top: 1px solid var(--color-border);
	}

	.aname {
		font-weight: 700;
		overflow-wrap: anywhere;
	}

	.score {
		font-size: 20px;
		font-weight: 900;
		font-variant-numeric: tabular-nums;
	}

	.score small {
		margin-left: 4px;
		font-size: 13px;
		font-weight: 700;
		color: var(--color-text-muted);
	}

	.ability button {
		height: 44px;
		padding: 0;
		background: var(--color-surface);
		border: 1.5px solid var(--color-border-strong);
		color: var(--color-text);
		font-size: 20px;
		font-weight: 800;
	}

	.ability button:disabled {
		opacity: 0.35;
	}

	.plus {
		text-align: center;
		font-weight: 900;
		color: var(--color-accent);
	}

	.feat-choices {
		margin-top: 12px;
		padding: 12px 14px;
	}

	.feat-choices h2 {
		font-size: 18px;
	}

	.sub {
		margin: 12px 0 6px;
		font-size: 14px;
		font-weight: 700;
	}

	.chips {
		display: flex;
		flex-wrap: wrap;
		gap: 6px;
	}

	.chips button {
		min-width: 52px;
		min-height: 40px;
		background: var(--color-surface);
		border: 1.5px solid var(--color-border-strong);
		color: var(--color-text);
		font-weight: 800;
	}

	.chips.skills button {
		padding: 0 10px;
		font-size: 14px;
	}

	.chips button[aria-pressed='true'] {
		background: var(--color-accent);
		border-color: var(--color-accent);
		color: var(--color-on-accent);
	}

	.chips button:disabled {
		opacity: 0.4;
	}

	.field {
		display: flex;
		flex-direction: column;
		gap: 4px;
		margin: 12px 0;
	}

	.field span {
		font-size: 13px;
		font-weight: 700;
		color: var(--color-text-muted);
	}

	.field input,
	.field select {
		height: 48px;
		border-radius: 12px;
		width: 100%;
	}

	.big {
		margin-top: 8px;
		font-size: 28px;
		font-weight: 900;
		color: var(--color-heal);
	}

	.status {
		padding: 14px;
		display: flex;
		align-items: center;
		justify-content: space-between;
	}

	.footer {
		position: sticky;
		bottom: 0;
		display: grid;
		grid-template-columns: minmax(0, 1fr) minmax(0, 2fr);
		gap: 8px;
		margin: 24px -16px 0;
		padding: 12px 16px calc(12px + env(safe-area-inset-bottom));
		background: var(--color-bg);
		border-top: 1px solid var(--color-border);
	}

	.footer button {
		height: 52px;
		border-radius: 14px;
		font-size: 16px;
		font-weight: 800;
	}

	.secondary {
		background: var(--color-surface);
		border: 1.5px solid var(--color-border-strong);
		color: var(--color-text);
	}

	.primary {
		border: 0;
		background: var(--color-accent);
		color: var(--color-on-accent);
	}

	.footer button:disabled {
		opacity: 0.45;
	}
</style>
