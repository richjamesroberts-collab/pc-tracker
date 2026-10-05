<script lang="ts">
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import PickList, { type PickItem } from '$lib/components/PickList.svelte';
	import SpellDetails from '$lib/components/SpellDetails.svelte';
	import { session } from '$lib/session.svelte';
	import { CLASS_MAP } from '$lib/data/classes';
	import {
		classOption,
		loadContent,
		loadFeats,
		loadOptions,
		type ClassOptionData,
		type Content,
		type FeatData
	} from '$lib/data/content';
	import { ABILITIES, ABILITY_SHORT, abilityMod, signedMod } from '$lib/rules/abilities';
	import { FIGHTING_STYLE_MAP, fightingStyleOptions } from '$lib/rules/attacks';
	import {
		applyLevelUp,
		featAbilities,
		levelUpChanges,
		levelUpNeeds,
		OPTION_INFO,
		subclassLevel,
		type FeatChoice,
		type LevelUpChoices
	} from '$lib/rules/levelup';
	import { METAMAGIC } from '$lib/rules/resources';
	import { saveProficiencySource } from '$lib/rules/saves';
	import { raceSkills, SKILLS } from '$lib/rules/skills';
	import { ordinal, pactSlots, slotMax } from '$lib/rules/spellcasting';
	import { abilityBreakdown, recompute } from '$lib/rules/stats';
	import { hitDie, hpForLevel, hpGain, MAX_LEVEL, xpForLevel } from '$lib/rules/xp';
	import { cacheSpell, characterSpells, spellListClass, spellPool } from '$lib/library.svelte';
	import type { Ability, Character, ClassOption, ClassOptionKind, Skill, Spell } from '$lib/types';

	// The character as it was when level up started; everything is applied in one change at the end.
	const start = $state.snapshot(session.character) as Character;
	const level = start.level + 1;
	const cls = CLASS_MAP.get(start.classKey);
	const className = cls?.name ?? start.classKey;
	const needsSubclass = !start.subclassKey && level >= subclassLevel(start.classKey) && !!cls?.subclasses.length;
	const scoresNow = abilityBreakdown(start).withoutItems;
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

	let subclassPick = $state<string[]>([]);
	let roll = $state<number | null>(null);
	let improvementKind = $state<'asi' | 'feat'>('asi');
	let asi = $state<Ability[]>([]);
	let featPick = $state<string[]>([]);
	let featAbility = $state<Ability | undefined>();
	let featSkills = $state<Skill[]>([]);
	let featExpertise = $state<Skill[]>([]);
	let styles = $state<string[]>([...start.fightingStyles]);
	let expertise = $state<string[]>([]);
	let metamagic = $state<string[]>([...start.metamagic]);
	/** Option refs by kind, starting from those already known. */
	const known: Partial<Record<ClassOptionKind, string[]>> = {};
	for (const o of start.classOptions) (known[o.kind] ??= []).push(o.ref);
	let optionPicks = $state(known);
	let cantrips = $state<string[]>([]);
	let newSpells = $state<string[]>([]);
	let arcanum = $state<string[]>([]);
	let forget = $state('');

	const subclassKey = $derived(needsSubclass ? subclassPick[0] : start.subclassKey);
	/** One level up with the subclass picked, for working out what the level asks for. */
	const next = $derived(recompute({ ...structuredClone(start), level, subclassKey }));
	const needs = $derived(levelUpNeeds(start, next));

	const feat = $derived(feats.find((f) => f.id === featPick[0]));
	const featChoice = $derived<FeatChoice | undefined>(
		feat && {
			kind: 'feat',
			feat,
			ability: feat.ability?.choose ? featAbility : undefined,
			skills: featSkills,
			expertise: featExpertise
		}
	);

	const optionById = $derived(new Map(options.map((o) => [o.id, o])));
	const pickedOptions = (kind: ClassOptionKind): ClassOption[] =>
		(optionPicks[kind] ?? []).flatMap((ref) => {
			const data = optionById.get(ref);
			const known = start.classOptions.find((o) => o.ref === ref);
			return data ? [classOption(data)] : known ? [known] : [];
		});

	const choices = $derived<LevelUpChoices>({
		hp: 0,
		subclassKey: needsSubclass ? subclassKey : undefined,
		improvement: needs.asi ? (improvementKind === 'asi' ? { kind: 'asi', abilities: asi } : featChoice) : undefined,
		fightingStyles: needs.fightingStyles ? styles : undefined,
		expertise: needs.expertise ? (expertise as Skill[]) : undefined,
		metamagic: needs.metamagic ? metamagic : undefined,
		optionKinds: needs.options.map((o) => o.kind),
		options: needs.options.flatMap((o) => pickedOptions(o.kind)),
		learn: [...cantrips, ...newSpells, ...arcanum],
		forget: forget ? [forget] : []
	});

	/** The character after levelling with the choices so far (HP for the new level not yet added). */
	const preview = $derived.by(() => {
		const d = structuredClone(start);
		applyLevelUp(d, $state.snapshot(choices) as LevelUpChoices);
		return recompute(d);
	});

	const gain = $derived(hpGain(preview));
	const die = hitDie(start.classKey);
	const rollOk = $derived(Number.isInteger(roll) && roll! >= 1 && roll! <= die);
	const hp = $derived(hpForLevel(rollOk ? roll! : gain.average, gain.bonus));
	const changes = $derived(levelUpChanges(start, preview));

	// ---- Steps ---------------------------------------------------------------------------------

	type StepKey = 'overview' | 'subclass' | 'improvement' | 'hp' | 'styles' | 'expertise' | 'metamagic' | 'spells' | 'review' | ClassOptionKind;

	const hasSpells = $derived(needs.cantrips > 0 || needs.spells > 0 || needs.arcanum !== null);
	const steps = $derived(
		[
			'overview',
			needsSubclass && 'subclass',
			needs.asi && 'improvement',
			'hp',
			needs.fightingStyles && 'styles',
			needs.expertise && 'expertise',
			needs.metamagic && 'metamagic',
			...needs.options.map((o) => o.kind),
			hasSpells && 'spells',
			'review'
		].filter((s): s is StepKey => !!s)
	);
	const STEP_TITLE: Record<string, string> = {
		overview: "What's new",
		subclass: 'Subclass',
		improvement: 'Ability Score Improvement',
		hp: 'Hit points',
		styles: 'Fighting style',
		expertise: 'Expertise',
		metamagic: 'Metamagic',
		spells: 'Spells',
		review: 'Review'
	};
	const title = (s: StepKey) => STEP_TITLE[s] ?? OPTION_INFO[s as ClassOptionKind].many;

	let index = $state(0);
	const step = $derived(steps[Math.min(index, steps.length - 1)]);

	function go(to: number) {
		index = Math.max(0, Math.min(steps.length - 1, to));
		window.scrollTo({ top: 0 });
	}

	// ---- Ability Score Improvement -------------------------------------------------------------

	const asiCount = (a: Ability) => asi.filter((x) => x === a).length;
	const canRaise = (a: Ability) => asi.length < 2 && scoresNow[a] + asiCount(a) < 20;
	const lower = (a: Ability) => {
		const i = asi.lastIndexOf(a);
		if (i >= 0) asi = asi.filter((_, j) => j !== i);
	};

	// ---- Feats ---------------------------------------------------------------------------------

	/** Feats can be taken once, except Elemental Adept (a different damage type each time). */
	const REPEATABLE = new Set(['elemental adept|phb']);
	const takenFeats = new Set(start.feats.map((f) => f.ref));
	const featItems = $derived<PickItem[]>(
		feats.map((f) => ({
			id: f.id,
			name: f.name,
			meta: [f.prerequisite, f.ability?.fixed ? Object.keys(f.ability.fixed).map((k) => `${ABILITY_SHORT[k as Ability]} +1`).join(', ') : f.ability?.choose ? `+1 ${f.ability.choose.map((k) => ABILITY_SHORT[k]).join('/')}` : '', takenFeats.has(f.id) && !REPEATABLE.has(f.id) ? 'Already taken' : '']
				.filter(Boolean)
				.join(' · '),
			text: f.text,
			disabled: takenFeats.has(f.id) && !REPEATABLE.has(f.id)
		}))
	);
	const proficientNow = $derived(new Set<Skill>([...start.skillProficiencies, ...raceSkills(start).skills]));
	const featSkillOptions = $derived(
		feat?.skills ? SKILLS.filter((s) => (feat.skills!.from === 'any' || feat.skills!.from.includes(s.key)) && !proficientNow.has(s.key)) : []
	);
	const featExpertiseOptions = $derived(
		SKILLS.filter((s) => (proficientNow.has(s.key) || featSkills.includes(s.key)) && !start.skillExpertise.includes(s.key))
	);
	const featAbilityOk = (a: Ability) =>
		scoresNow[a] + (feat?.ability?.amount ?? 1) <= 20 && !(feat?.save && saveProficiencySource(start, a));

	// Picking another feat starts its choices over.
	let lastFeat = '';
	$effect(() => {
		const id = featPick[0] ?? '';
		if (id === lastFeat) return;
		lastFeat = id;
		featAbility = undefined;
		featSkills = [];
		featExpertise = [];
	});

	function togglePick<T>(list: T[], value: T, max: number): T[] {
		if (list.includes(value)) return list.filter((x) => x !== value);
		if (max === 1) return [value];
		return list.length < max ? [...list, value] : list;
	}

	const improvementOk = $derived.by(() => {
		if (improvementKind === 'asi') return asi.length === 2;
		if (!feat) return false;
		if (feat.ability?.choose && !featAbility) return false;
		if (feat.skills && featSkills.length < Math.min(feat.skills.count, featSkillOptions.length)) return false;
		if (feat.expertise && featExpertise.length < Math.min(feat.expertise, featExpertiseOptions.length)) return false;
		return true;
	});

	// ---- Class expertise -----------------------------------------------------------------------

	const expertiseOptions = $derived(
		SKILLS.filter((s) => (preview.skillProficiencies.includes(s.key) || raceSkills(start).skills.includes(s.key)) && !start.skillExpertise.includes(s.key) && !(choices.improvement?.kind === 'feat' && choices.improvement.expertise.includes(s.key)))
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
	const pact = $derived(
		pickedOptions('pact-boon')[0]?.name.replace(/^Pact of the /i, '').toLowerCase() ??
			start.classOptions.find((o) => o.kind === 'pact-boon')?.name.replace(/^Pact of the /i, '').toLowerCase()
	);
	const optionItems = (kind: ClassOptionKind): PickItem[] =>
		options
			.filter((o) => o.kind === kind)
			.map((o) => {
				const tooLow = (o.level ?? 0) > level;
				const wrongPact = !!o.pact && o.pact !== pact;
				return { id: o.id, name: o.name, meta: o.prerequisite, text: o.text, disabled: tooLow || wrongPact };
			});
	const optionTotal = (kind: ClassOptionKind) => needs.options.find((o) => o.kind === kind)?.total ?? 0;
	/** Asks for the full count unless there aren't that many to pick from. */
	const optionGoal = (kind: ClassOptionKind) =>
		Math.min(optionTotal(kind), optionItems(kind).filter((i) => !i.disabled || optionPicks[kind]?.includes(i.id)).length);

	// ---- Spells --------------------------------------------------------------------------------

	const pool = $derived(spellPool(start));
	const listClass = spellListClass(start);
	const knownIds = new Set(start.spells.map((s) => s.id));
	const knownLevelled = characterSpells(start).filter((x) => x.spell.level > 0);
	/** Highest level of spell the character can learn: their slots (pact slots for a warlock). */
	const learnLevel = $derived(Math.max(slotMax(preview).length, pactSlots(preview)?.level ?? 0));
	const spellItem = (s: Spell): PickItem => ({
		id: s.id,
		name: s.name,
		meta: `${s.level === 0 ? 'Cantrip' : `${ordinal(s.level)} level`} · ${s.school}${s.concentration ? ' · Conc' : ''}${s.ritual ? ' · Ritual' : ''}`
	});
	const onList = (s: Spell) => (s.classes.includes(listClass) || s.pack === 'custom') && !knownIds.has(s.id);
	const cantripItems = $derived(pool.filter((s) => s.level === 0 && onList(s)).map(spellItem));
	const spellItems = $derived(pool.filter((s) => s.level > 0 && s.level <= learnLevel && onList(s) && !arcanum.includes(s.id)).map(spellItem));
	const arcanumItems = $derived(needs.arcanum ? pool.filter((s) => s.level === needs.arcanum && onList(s)).map(spellItem) : []);
	const spellById = $derived(new Map(pool.map((s) => [s.id, s])));
	const spellGoal = $derived(needs.spells + (forget ? 1 : 0));
	const schoolNote = $derived(
		start.classKey === 'fighter'
			? 'Eldritch Knight: most spells you learn must be abjuration or evocation.'
			: start.classKey === 'rogue'
				? 'Arcane Trickster: most spells you learn must be enchantment or illusion.'
				: ''
	);

	// Fewer spells to learn (a swap undone) drops the extra picks.
	$effect(() => {
		if (newSpells.length > spellGoal) newSpells = newSpells.slice(0, spellGoal);
	});

	// ---- Step checks and finishing -------------------------------------------------------------

	function stepOk(s: StepKey): boolean {
		switch (s) {
			case 'subclass':
				return !!subclassKey;
			case 'improvement':
				return improvementOk;
			case 'hp':
				return roll === null || rollOk;
			case 'styles':
				return styles.length === Math.min(needs.fightingStyles, styleItems.length);
			case 'expertise':
				return expertise.length === Math.min(needs.expertise, expertiseOptions.length);
			case 'metamagic':
				return metamagic.length === needs.metamagic;
			case 'overview':
			case 'spells':
			case 'review':
				return true;
			default:
				return (optionPicks[s]?.length ?? 0) === optionGoal(s);
		}
	}

	const ready = $derived(!!content && steps.every(stepOk));
	const maxBefore = start.hpMax;
	const maxAfter = $derived(preview.hpMax + hp);
	const xpShort = !start.milestone && start.xp < xpForLevel(level);

	function finish() {
		if (!ready || start.level >= MAX_LEVEL) return;
		const final = { ...($state.snapshot(choices) as LevelUpChoices), hp };
		const learned = (final.learn ?? []).map((id) => spellById.get(id)).filter((s): s is Spell => !!s);
		session.mutate(`Level ${level}! Max HP ${maxBefore} → ${maxAfter}`, (d) => {
			applyLevelUp(d, final);
			for (const s of learned) cacheSpell(d, s);
		});
		goto(resolve('/c/[id]', { id: start.id }), { replaceState: true });
	}

	const newFeatures = $derived.by(() => {
		if (!content) return [];
		const c = content.classes[start.classKey];
		const sub = subclassKey ? c?.subclasses[subclassKey] : undefined;
		// A subclass picked now brings its features up to this level; otherwise just this level's.
		const fromSub = (sub ?? []).filter((f) => (needsSubclass ? f.level <= level : f.level === level));
		return [...(c?.features.filter((f) => f.level === level) ?? []), ...fromSub];
	});
	const subclassName = $derived(cls?.subclasses.find((s) => s.key === subclassKey)?.name);
	/** A subclass's opening feature holds its first features as "Name. Text" paragraphs; their names. */
	const partNames = (text: string) =>
		text
			.split('\n')
			.slice(1)
			.map((p) => /^([A-Z][^.•]{2,40})\. /.exec(p)?.[1])
			.filter((n): n is string => !!n);
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

<header class="top">
	<a class="cancel" href={resolve('/c/[id]', { id: start.id })}>Cancel</a>
	<p class="label">Level {start.level} → {level} · {className}</p>
</header>

{#if start.level >= MAX_LEVEL}
	<p class="muted">{start.name} is level {MAX_LEVEL}: the highest there is.</p>
{:else if failed}
	<div class="card status" role="alert">
		<p>Couldn't load class details</p>
		<button type="button" onclick={() => attempt++}>Retry</button>
	</div>
{:else if !content}
	<p class="muted">Loading…</p>
{:else}
	<ol class="progress" aria-label="Steps">
		{#each steps as s, i (s)}
			<li class:done={i < index} class:current={s === step}>
				<button type="button" aria-label="{title(s)}{s === step ? ' (this step)' : ''}" disabled={i > index && !steps.slice(0, i).every(stepOk)} onclick={() => go(i)}></button>
			</li>
		{/each}
	</ol>
	<h1>{title(step)}</h1>

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
		<PickList items={subclassItems} bind:selected={subclassPick} max={1} label="Subclasses" />
	{:else if step === 'improvement'}
		<div class="modes" role="radiogroup" aria-label="Improvement">
			<button type="button" role="radio" aria-checked={improvementKind === 'asi'} onclick={() => (improvementKind = 'asi')}>Ability scores</button>
			<button type="button" role="radio" aria-checked={improvementKind === 'feat'} onclick={() => (improvementKind = 'feat')}>Feat</button>
		</div>
		{#if improvementKind === 'asi'}
			<p class="lead">Raise one score by 2, or two scores by 1 ({asi.length}/2). Scores can't go above 20.</p>
			<div class="card abilities">
				{#each ABILITIES as a (a.key)}
					{@const n = asiCount(a.key)}
					{@const score = scoresNow[a.key] + n}
					<div class="ability">
						<span class="aname">{a.name}</span>
						<span class="score">{score}<small>{signedMod(abilityMod(score))}</small></span>
						<button type="button" aria-label="Lower {a.name}" disabled={!n} onclick={() => lower(a.key)}>−</button>
						<span class="plus" aria-label="{a.name} raised by {n}">{n ? `+${n}` : ''}</span>
						<button type="button" aria-label="Raise {a.name}" disabled={!canRaise(a.key)} onclick={() => (asi = [...asi, a.key])}>+</button>
					</div>
				{/each}
			</div>
		{:else}
			<p class="lead">Prerequisites are shown but not checked. Ability increases, skills, saves and Tough's hit points are applied for you.</p>
			<PickList items={featItems} bind:selected={featPick} max={1} label="Feats" search />
			{#if feat}
				<div class="card feat-choices">
					<h2>{feat.name}</h2>
					{#if feat.ability?.choose}
						<p class="sub">{feat.save ? 'Ability (+1, and proficiency in its saving throws)' : `Raise one ability by ${feat.ability.amount ?? 1}`}</p>
						<div class="chips">
							{#each feat.ability.choose as k (k)}
								<button type="button" aria-pressed={featAbility === k} disabled={!featAbilityOk(k)} onclick={() => (featAbility = k)}>{ABILITY_SHORT[k]}</button>
							{/each}
						</div>
					{:else if feat.ability?.fixed}
						<p class="sub">Raises {featAbilities({ kind: 'feat', feat, skills: [], expertise: [] }).map((k) => `${ABILITY_SHORT[k]} +1`).join(', ')}</p>
					{/if}
					{#if feat.skills}
						<p class="sub">Skill proficiency: choose {feat.skills.count} ({featSkills.length}/{feat.skills.count}){feat.skills.from === 'any' ? '. Tools count too; add those in your notes.' : ''}</p>
						<div class="chips skills">
							{#each featSkillOptions as s (s.key)}
								<button
									type="button"
									aria-pressed={featSkills.includes(s.key)}
									disabled={!featSkills.includes(s.key) && featSkills.length >= feat.skills.count}
									onclick={() => {
										featSkills = togglePick(featSkills, s.key, feat!.skills!.count);
										featExpertise = featExpertise.filter((k) => featExpertiseOptions.some((o) => o.key === k));
									}}>{s.name}</button
								>
							{/each}
						</div>
					{/if}
					{#if feat.expertise}
						<p class="sub">Expertise: choose {feat.expertise} skill you're proficient in</p>
						<div class="chips skills">
							{#each featExpertiseOptions as s (s.key)}
								<button type="button" aria-pressed={featExpertise.includes(s.key)} onclick={() => (featExpertise = togglePick(featExpertise, s.key, feat!.expertise!))}>{s.name}</button>
							{/each}
						</div>
					{/if}
					<p class="hint">Anything else it gives (spells, weapon or armor proficiencies, initiative) goes in Spells or Edit afterwards.</p>
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
				bind:value={roll}
				placeholder="{gain.average} (average)"
				aria-invalid={roll !== null && !rollOk}
			/>
		</label>
		{#if roll !== null && !rollOk}<p class="error">A d{die} rolls 1 to {die}.</p>{/if}
		<p class="big">+{hp} max HP</p>
		{#if maxAfter - maxBefore !== hp}
			<p class="muted">Max HP {maxBefore} → {maxAfter}, counting {preview.feats.some((f) => f.hpPerLevel && f.level === level) ? 'your new feat' : 'your new Constitution modifier'} on earlier levels.</p>
		{/if}
	{:else if step === 'styles'}
		<p class="lead">Choose {needs.fightingStyles === 1 ? 'a fighting style' : `${needs.fightingStyles} fighting styles`} ({styles.length}/{needs.fightingStyles}).</p>
		<PickList items={styleItems} bind:selected={styles} max={needs.fightingStyles} label="Fighting styles" />
	{:else if step === 'expertise'}
		<p class="lead">
			Choose {needs.expertise} skills you're proficient in to double your proficiency bonus ({expertise.length}/{needs.expertise}).
			{start.classKey === 'rogue' ? "Thieves' tools can be one of them; note that in your notes." : ''}
		</p>
		<div class="chips skills">
			{#each expertiseOptions as s (s.key)}
				<button type="button" aria-pressed={expertise.includes(s.key)} disabled={!expertise.includes(s.key) && expertise.length >= needs.expertise} onclick={() => (expertise = togglePick(expertise, s.key, needs.expertise))}>{s.name}</button>
			{/each}
		</div>
		{#if !expertiseOptions.length}<p class="muted">No proficient skills without expertise. Add skill proficiencies in Edit.</p>{/if}
	{:else if step === 'metamagic'}
		<p class="lead">You know {needs.metamagic} Metamagic options at level {level} ({metamagic.length}/{needs.metamagic}).</p>
		<PickList items={metamagicItems} bind:selected={metamagic} max={needs.metamagic} label="Metamagic" />
	{:else if step === 'spells'}
		{#if needs.cantrips}
			<h2 class="label">Cantrips · {cantrips.length}/{needs.cantrips}</h2>
			<PickList items={cantripItems} bind:selected={cantrips} max={needs.cantrips} label="Cantrips" search>
				{#snippet details(item)}{@const s = spellById.get(item.id)}{#if s}<SpellDetails spell={s} compact />{/if}{/snippet}
			</PickList>
		{/if}
		{#if needs.swapSpell && knownLevelled.length}
			<label class="field">
				<span>Replace a spell you know (optional)</span>
				<select bind:value={forget}>
					<option value="">Keep them all</option>
					{#each knownLevelled as { spell } (spell.id)}<option value={spell.id}>{spell.name}</option>{/each}
				</select>
			</label>
		{/if}
		{#if spellGoal}
			<h2 class="label">{needs.prep === 'spellbook' ? 'Copy into your spellbook' : 'New spells'} · {newSpells.length}/{spellGoal}</h2>
			<p class="hint">Up to {ordinal(learnLevel)} level.{schoolNote ? ` ${schoolNote}` : ''}</p>
			<PickList items={spellItems} bind:selected={newSpells} max={spellGoal} label="Spells" search>
				{#snippet details(item)}{@const s = spellById.get(item.id)}{#if s}<SpellDetails spell={s} compact />{/if}{/snippet}
			</PickList>
		{/if}
		{#if needs.arcanum}
			<h2 class="label">Mystic Arcanum · {ordinal(needs.arcanum)} level</h2>
			<PickList items={arcanumItems} bind:selected={arcanum} max={1} label="Mystic Arcanum" search>
				{#snippet details(item)}{@const s = spellById.get(item.id)}{#if s}<SpellDetails spell={s} compact />{/if}{/snippet}
			</PickList>
		{/if}
		<p class="hint">You can leave picks for later and add spells from the Spells tab.</p>
	{:else if step === 'review'}
		<ul class="card review">
			<li><b>Level</b> {start.level} → {level}</li>
			<li><b>Max HP</b> {maxBefore} → {maxAfter}</li>
			{#if subclassName && needsSubclass}<li><b>Subclass</b> {subclassName}</li>{/if}
			{#if choices.improvement?.kind === 'asi'}
				<li><b>Ability scores</b> {[...new Set(asi)].map((k) => `${ABILITY_SHORT[k]} +${asiCount(k)}`).join(', ')}</li>
			{:else if choices.improvement?.kind === 'feat'}
				{@const f = choices.improvement}
				<li>
					<b>Feat</b> {f.feat.name}{[
						...featAbilities(f).map((k) => `${ABILITY_SHORT[k]} +1`),
						...(f.feat.save && f.ability ? [`${ABILITY_SHORT[f.ability]} saves`] : []),
						...f.skills.map(skillName),
						...f.expertise.map((k) => `${skillName(k)} expertise`)
					]
						.map((x, i) => (i ? ', ' : ': ') + x)
						.join('')}
				</li>
			{/if}
			{#if needs.fightingStyles}<li><b>Fighting styles</b> {styles.map((k) => FIGHTING_STYLE_MAP.get(k)?.name ?? k).join(', ')}</li>{/if}
			{#if needs.expertise}<li><b>Expertise</b> {expertise.map(skillName).join(', ') || 'None'}</li>{/if}
			{#if needs.metamagic}<li><b>Metamagic</b> {metamagic.map((k) => METAMAGIC.find((m) => m.key === k)?.name ?? k).join(', ')}</li>{/if}
			{#each needs.options as o (o.kind)}
				<li><b>{OPTION_INFO[o.kind].many}</b> {pickedOptions(o.kind).map((x) => x.name).join(', ') || 'None'}</li>
			{/each}
			{#if hasSpells}
				{@const names = (ids: string[]) => ids.map((id) => spellById.get(id)?.name ?? id).join(', ')}
				{#if cantrips.length}<li><b>Cantrips</b> {names(cantrips)}</li>{/if}
				{#if newSpells.length}<li><b>{needs.prep === 'spellbook' ? 'Spellbook' : 'Spells'}</b> {names(newSpells)}</li>{/if}
				{#if arcanum.length}<li><b>Mystic Arcanum</b> {names(arcanum)}</li>{/if}
				{#if forget}<li><b>Replaced</b> {names([forget])}</li>{/if}
			{/if}
		</ul>
		{#if !ready}<p class="error">Some steps still need a choice.</p>{/if}
	{:else}
		{@const kind = step as ClassOptionKind}
		{@const goal = optionGoal(kind)}
		<p class="lead">
			You know {optionTotal(kind)} at level {level} ({optionPicks[kind]?.length ?? 0}/{goal}).
			{start.classOptions.some((o) => o.kind === kind) ? (OPTION_INFO[kind].swap ?? '') : ''}
		</p>
		<PickList items={optionItems(kind)} bind:selected={() => optionPicks[kind] ?? [], (v) => (optionPicks[kind] = v)} max={optionTotal(kind)} label={OPTION_INFO[kind].many} search={optionItems(kind).length > 12} />
	{/if}

	<nav class="footer">
		<button type="button" class="secondary" disabled={index === 0} onclick={() => go(index - 1)}>Back</button>
		{#if step === 'review'}
			<button type="button" class="primary" disabled={!ready} onclick={finish}>Level up to {level}</button>
		{:else}
			<button type="button" class="primary" disabled={!stepOk(step)} onclick={() => go(index + 1)}>Next</button>
		{/if}
	</nav>
{/if}

<style>
	.top {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 8px;
		margin-bottom: 10px;
	}

	.cancel {
		min-height: 40px;
		display: inline-flex;
		align-items: center;
		color: var(--color-accent);
		font-weight: 700;
	}

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
