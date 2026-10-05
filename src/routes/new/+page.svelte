<script lang="ts">
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import CharacterForm, { type FormSection } from '$lib/components/CharacterForm.svelte';
	import LevelUpFlow, { newPicks, type FlowPicks } from '$lib/components/LevelUpFlow.svelte';
	import { newCharacter } from '$lib/character';
	import { CLASS_MAP } from '$lib/data/classes';
	import { signedMod } from '$lib/rules/abilities';
	import { applyChoices, applyLevelUp, hasChoices, levelUpNeeds, startingHp, type LevelUpChoices } from '$lib/rules/levelup';
	import { recompute } from '$lib/rules/stats';
	import { hitDie, hpGain } from '$lib/rules/xp';
	import { cacheSpell } from '$lib/library.svelte';
	import { db, requestPersistentStorage } from '$lib/db';
	import type { Character, Spell } from '$lib/types';

	/**
	 * The screens in order: the required basics, ability scores, skills, each level from 1st up to the
	 * starting level that asks for something, the remaining details, then hit points.
	 */
	type Stage = FormSection | 'level' | 'hp';

	let stage = $state<Stage>('basics');
	/** The character as entered on the form screens, at 1st-level values (no level choices applied). */
	let base = $state.raw<Character>(newCharacter());
	/** The level being stepped through while `stage` is 'level'. */
	let current = $state(1);
	/** Choices made and spells learned for each level, filled in as each level is finished. */
	let done = $state.raw<Record<number, LevelUpChoices>>({});
	let learned = $state.raw<Record<number, Spell[]>>({});
	/** Picks for the levels visited, so going back to one keeps them. */
	let picks = $state<FlowPicks[]>([]);
	let hpOverride = $state<number | null>(null);
	/** Each finished level's choices as last made, to tell whether going back changed anything. */
	let lastChoices: Record<number, string> = {};

	const target = $derived(base.level);
	const className = $derived(CLASS_MAP.get(base.classKey)?.name ?? base.classKey);

	/** What the level steps depend on; when any of it changes, the levels start over. */
	const levelKey = (c: Character) =>
		JSON.stringify([c.classKey, c.raceKey, c.subraceKey, c.level, c.abilities, c.raceAbilityChoices, c.skillProficiencies, c.skillExpertise]);

	/** Details entered after the levels, copied back onto `base`. */
	const DETAIL_FIELDS = [
		'image',
		'xp',
		'milestone',
		'acAuto',
		'acBase',
		'acAdjust',
		'speed',
		'initiativeOverride',
		'passivePerception',
		'senses',
		'defenses',
		'spellModOverride'
	] as const;

	function keep(c: Character) {
		if (levelKey(c) !== levelKey(base)) {
			done = {};
			learned = {};
			picks = [];
			lastChoices = {};
		}
		base = c;
	}

	function keepDetails(c: Character) {
		const next = { ...base } as Record<string, unknown>;
		for (const k of DETAIL_FIELDS) next[k] = c[k];
		base = next as unknown as Character;
	}

	function show(next: Stage, level = current) {
		stage = next;
		current = level;
		window.scrollTo({ top: 0 });
	}

	/** The character before `level`'s choices: 1st level for level 1, otherwise levelled up through `level - 1`. */
	function before(level: number): Character {
		const d = structuredClone({ ...base, level: 1 });
		d.hpBase = hitDie(d.classKey);
		for (let l = 1; l < level; l++) {
			const ch = done[l] ?? { hp: 0 };
			if (l === 1) applyChoices(d, ch, 1);
			else applyLevelUp(d, { ...ch, hp: 0 });
		}
		return recompute(d);
	}

	function asksSomething(level: number): boolean {
		const start = before(level);
		const first = level === 1;
		return hasChoices(levelUpNeeds(start, first ? start : { ...start, level: start.level + 1 }, first));
	}

	/** On from `from` to the next level with choices, filling in the ones without; past the last, the details. */
	function advance(from: number) {
		let l = from + 1;
		while (l <= target && !asksSomething(l)) {
			done = { ...done, [l]: { hp: 0 } };
			learned = { ...learned, [l]: [] };
			l++;
		}
		if (l > target) return show('details');
		picks[l] ??= newPicks(before(l));
		show('level', l);
	}

	/** Back to the previous level with choices, or the skills. Picks are kept until an earlier level changes. */
	function retreat(from: number) {
		let l = from - 1;
		while (l >= 1 && !asksSomething(l)) l--;
		const below = <T,>(r: Record<number, T>) => Object.fromEntries(Object.entries(r).filter(([k]) => +k < Math.max(l, 1)));
		done = below(done);
		learned = below(learned);
		if (l < 1) show('skills');
		else show('level', l);
	}

	function levelDone(level: number, choices: LevelUpChoices, spells: Spell[]) {
		// Later levels were picked for what this level was; if it changed, they start over.
		if (lastChoices[level] !== undefined && lastChoices[level] !== JSON.stringify(choices)) picks = picks.slice(0, level + 1);
		lastChoices[level] = JSON.stringify(choices);
		done = { ...done, [level]: choices };
		learned = { ...learned, [level]: spells };
		advance(level);
	}

	// ---- Details and hit points ----------------------------------------------------------------

	/** The character with every level's choices, once the levels are done. */
	const final = $derived(stage === 'details' || stage === 'hp' ? before(target + 1) : null);
	const gain = $derived(final ? hpGain(final) : null);
	const hpAuto = $derived(final ? startingHp(final) : 0);
	const hpOk = $derived(hpOverride === null || (Number.isInteger(hpOverride) && hpOverride >= 1));

	async function create() {
		if (!final || !hpOk) return;
		const c = structuredClone(final);
		c.hpBase = hpOverride ?? hpAuto;
		for (const s of Object.values(learned).flat()) cacheSpell(c, s);
		recompute(c);
		c.hpCurrent = c.hpMax;
		await db.characters.put(c);
		void requestPersistentStorage();
		goto(resolve('/c/[id]', { id: c.id }), { replaceState: true });
	}

	const TITLE: Record<Stage, string> = {
		basics: 'New character',
		abilities: 'Ability scores',
		skills: 'Skills',
		level: '',
		details: 'Details',
		hp: 'Hit points'
	};
</script>

<main>
	{#if stage !== 'basics'}
		<p class="label top">
			{base.name} · {className} {target}{stage === 'level' ? ` · level ${current} of ${target}` : ''}
		</p>
	{/if}
	{#if TITLE[stage]}<h1>{TITLE[stage]}</h1>{/if}

	{#if stage === 'basics'}
		<p class="lead">Who you're playing. The next screens follow from these: your scores and skills, then each level's choices up to the level you start at.</p>
		<CharacterForm
			initial={base}
			isNew
			sections={['basics']}
			onsave={(c) => (keep(c), show('abilities'))}
			oncancel={() => history.back()}
		/>
	{:else if stage === 'abilities'}
		<CharacterForm
			initial={base}
			isNew
			sections={['abilities']}
			cancelLabel="Back"
			onsave={(c) => (keep(c), show('skills'))}
			oncancel={(c) => (keep(c), show('basics'))}
		/>
	{:else if stage === 'skills'}
		<CharacterForm
			initial={base}
			isNew
			sections={['skills']}
			cancelLabel="Back"
			onsave={(c) => (keep(c), advance(0))}
			oncancel={(c) => (keep(c), show('abilities'))}
		/>
	{:else if stage === 'level'}
		{#key current}
			<LevelUpFlow
				start={before(current)}
				first={current === 1}
				mode="create"
				bind:picks={picks[current]}
				finishLabel="Next"
				onfinish={(choices, spells) => levelDone(current, choices, spells)}
				onback={() => retreat(current)}
			/>
		{/key}
	{:else if stage === 'details' && final}
		<p class="lead">All optional: a portrait, XP, armor class and the rest. Change any of it later in Edit.</p>
		<CharacterForm
			initial={final}
			isNew
			sections={['details']}
			cancelLabel="Back"
			onsave={(c) => (keepDetails(c), show('hp'))}
			oncancel={(c) => (keepDetails(c), retreat(target + 1))}
		/>
	{:else if stage === 'hp' && final && gain}
		<p class="lead">
			A d{hitDie(final.classKey)} at 1st level{target > 1 ? `, then the average of ${gain.average} for each level after` : ''}, plus
			{gain.parts.map((p) => `${p.label} ${signedMod(p.value)}`).join(', ')} per level.
		</p>
		<p class="big">{hpAuto} max HP</p>
		<label class="field">
			<span>Rolled for hit points? Your max HP</span>
			<input type="number" inputmode="numeric" min="1" step="1" bind:value={hpOverride} placeholder={String(hpAuto)} aria-invalid={!hpOk} />
		</label>
		{#if !hpOk}<p class="error">Max HP is a whole number, at least 1.</p>{/if}

		<nav class="footer">
			<button type="button" class="secondary" onclick={() => show('details')}>Back</button>
			<button type="button" class="primary" disabled={!hpOk} onclick={create}>Create character</button>
		</nav>
	{/if}
</main>

<style>
	main {
		max-width: 560px;
		margin: 0 auto;
		padding: calc(16px + env(safe-area-inset-top)) 16px calc(24px + env(safe-area-inset-bottom));
	}

	h1 {
		font-size: 26px;
		margin-bottom: 12px;
	}

	.top {
		margin-bottom: 6px;
	}

	.lead {
		margin-bottom: 14px;
		color: var(--color-text-muted);
	}

	.big {
		font-size: 28px;
		font-weight: 900;
		color: var(--color-heal);
	}

	.field {
		display: flex;
		flex-direction: column;
		gap: 4px;
		margin: 16px 0 0;
	}

	.field span {
		font-size: 13px;
		font-weight: 700;
		color: var(--color-text-muted);
	}

	.field input {
		height: 48px;
		border-radius: 12px;
		width: 100%;
	}

	.error {
		margin-top: 8px;
		color: var(--color-danger);
		font-size: 14px;
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

	.primary:disabled {
		opacity: 0.45;
	}
</style>
