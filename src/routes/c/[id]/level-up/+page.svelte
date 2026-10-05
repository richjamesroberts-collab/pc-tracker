<script lang="ts">
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import LevelUpFlow, { newPicks } from '$lib/components/LevelUpFlow.svelte';
	import { session } from '$lib/session.svelte';
	import { CLASS_MAP } from '$lib/data/classes';
	import { applyLevelUp, type LevelUpChoices } from '$lib/rules/levelup';
	import { recompute } from '$lib/rules/stats';
	import { MAX_LEVEL } from '$lib/rules/xp';
	import { cacheSpell } from '$lib/library.svelte';
	import type { Character, Spell } from '$lib/types';

	// The character as it was when level up started; everything is applied in one change at the end.
	const start = $state.snapshot(session.character) as Character;
	const level = start.level + 1;
	let picks = $state(newPicks(start));

	function finish(choices: LevelUpChoices, learned: Spell[]) {
		if (start.level >= MAX_LEVEL) return;
		const after = structuredClone(start);
		applyLevelUp(after, choices);
		const maxAfter = recompute(after).hpMax;
		session.mutate(`Level ${level}! Max HP ${start.hpMax} → ${maxAfter}`, (d) => {
			applyLevelUp(d, choices);
			for (const s of learned) cacheSpell(d, s);
		});
		goto(resolve('/c/[id]', { id: start.id }), { replaceState: true });
	}
</script>

<header class="top">
	<a class="cancel" href={resolve('/c/[id]', { id: start.id })}>Cancel</a>
	<p class="label">Level {start.level} → {level} · {CLASS_MAP.get(start.classKey)?.name ?? start.classKey}</p>
</header>

{#if start.level >= MAX_LEVEL}
	<p class="muted">{start.name} is level {MAX_LEVEL}: the highest there is.</p>
{:else}
	<LevelUpFlow {start} mode="level-up" bind:picks finishLabel="Level up to {level}" onfinish={finish} />
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

	.muted {
		color: var(--color-text-muted);
		font-size: 14px;
	}
</style>
