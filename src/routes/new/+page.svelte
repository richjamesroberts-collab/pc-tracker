<script lang="ts">
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import CharacterForm from '$lib/components/CharacterForm.svelte';
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

	/** What the form gave, at the level the player is starting at. */
	let base = $state.raw<Character | null>(null);
	/** The level being stepped through; 0 for the form, `target + 1` for hit points. */
	let current = $state(0);
	/** Choices made and spells learned for each level, filled in as each level is finished. */
	let done = $state.raw<Record<number, LevelUpChoices>>({});
	let learned = $state.raw<Record<number, Spell[]>>({});
	/** Picks for the levels visited, so going back to one keeps them. */
	let picks = $state<FlowPicks[]>([]);
	let hpOverride = $state<number | null>(null);
	/** Each finished level's choices as last made, to tell whether going back changed anything. */
	let lastChoices: Record<number, string> = {};

	const target = $derived(base?.level ?? 1);

	/** The character before `level`'s choices: 1st level for level 1, otherwise levelled up through `level - 1`. */
	function before(level: number): Character {
		const d = structuredClone({ ...base!, level: 1 });
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

	/** Move on from `level` to the next level with choices, filling in the ones without; past the last, hit points. */
	function advance(from: number) {
		let l = from + 1;
		while (l <= target && !asksSomething(l)) {
			done = { ...done, [l]: { hp: 0 } };
			learned = { ...learned, [l]: [] };
			l++;
		}
		if (l <= target) picks[l] ??= newPicks(before(l));
		current = l;
		window.scrollTo({ top: 0 });
	}

	/** Back to the previous level with choices, or the form. Picks are kept until an earlier level changes. */
	function retreat(from: number) {
		let l = from - 1;
		while (l >= 1 && !asksSomething(l)) l--;
		const keep = <T,>(r: Record<number, T>) => Object.fromEntries(Object.entries(r).filter(([k]) => +k < l));
		done = keep(done);
		learned = keep(learned);
		current = Math.max(l, 0);
		window.scrollTo({ top: 0 });
	}

	function formDone(c: Character) {
		// Back on the details and Next with nothing changed: carry on with the picks made so far.
		if (base && JSON.stringify(c) === JSON.stringify(base)) return advance(0);
		base = c;
		done = {};
		learned = {};
		picks = [];
		lastChoices = {};
		hpOverride = null;
		advance(0);
	}

	function levelDone(level: number, choices: LevelUpChoices, spells: Spell[]) {
		// Later levels were picked for what this level was; if it changed, they start over.
		if (lastChoices[level] !== undefined && lastChoices[level] !== JSON.stringify(choices)) picks = picks.slice(0, level + 1);
		lastChoices[level] = JSON.stringify(choices);
		done = { ...done, [level]: choices };
		learned = { ...learned, [level]: spells };
		advance(level);
	}

	// ---- Hit points ----------------------------------------------------------------------------

	const final = $derived(base && current > target ? before(target + 1) : null);
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
</script>

<main>
	{#if !base || current === 0}
		<h1>New character</h1>
		<CharacterForm initial={base ?? newCharacter()} isNew onsave={formDone} oncancel={() => history.back()} />
	{:else}
		<header class="top">
			<button type="button" class="cancel" onclick={() => (current = 0)}>Character details</button>
			<p class="label">
				{CLASS_MAP.get(base.classKey)?.name ?? base.classKey}{current <= target ? ` · level ${current} of ${target}` : ''}
			</p>
		</header>

		{#if current <= target}
			{#key current}
				<LevelUpFlow
					start={before(current)}
					first={current === 1}
					mode="create"
					bind:picks={picks[current]}
					finishLabel={current < target ? 'Next level' : 'Hit points'}
					onfinish={(choices, spells) => levelDone(current, choices, spells)}
					onback={() => retreat(current)}
				/>
			{/key}
		{:else if final && gain}
			<h1>Hit points</h1>
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
				<button type="button" class="secondary" onclick={() => retreat(current)}>Back</button>
				<button type="button" class="primary" disabled={!hpOk} onclick={create}>Create character</button>
			</nav>
		{/if}
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
		margin-bottom: 16px;
	}

	.top {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 8px;
		margin-bottom: 10px;
	}

	.cancel {
		min-height: 40px;
		padding: 0;
		border: 0;
		background: transparent;
		color: var(--color-accent);
		font-weight: 700;
	}

	.top .label {
		text-align: right;
	}

	.lead {
		margin-bottom: 12px;
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
