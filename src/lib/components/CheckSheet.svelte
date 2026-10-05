<script lang="ts" module>
	import type { StatSource } from '$lib/rules/stats';

	/** A skill or saving throw, ready to show. */
	export interface Check {
		name: string;
		/** "Dexterity · Proficient". */
		sub: string;
		total: number;
		parts: StatSource[];
		notes: string[];
	}
</script>

<script lang="ts">
	import { resolve } from '$app/paths';
	import Sheet from './Sheet.svelte';
	import Breakdown from './Breakdown.svelte';
	import { session } from '$lib/session.svelte';
	import { signedMod } from '$lib/rules/abilities';

	/** A skill or saving throw and how it was worked out. `edit` is the link text to change it in Edit. */
	let { check, edit, onclose }: { check: Check | null; edit: string; onclose: () => void } = $props();

	// Keep showing the last check while the sheet slides away.
	let shown = $state<Check | null>(null);
	$effect(() => {
		if (check) shown = check;
	});
</script>

<Sheet open={!!check} {onclose} label={shown?.name ?? 'Check'}>
	{#if shown}
		{@const live = check ?? shown}
		<div class="head">
			<div>
				<h2>{live.name}</h2>
				<p class="muted">{live.sub}</p>
			</div>
			<strong class="total">{signedMod(live.total)}</strong>
		</div>

		<h3 class="k">How it’s worked out</h3>
		<Breakdown parts={live.parts} total={signedMod(live.total)} />

		{#if live.notes.length}
			<h3 class="k">At the table (not in the number)</h3>
			<ul class="notes">
				{#each live.notes as n (n)}<li>{n}</li>{/each}
			</ul>
		{/if}

		{#if session.character}
			<a class="edit-link" href={resolve('/c/[id]/edit', { id: session.character.id })}>{edit}</a>
		{/if}
	{/if}
</Sheet>

<style>
	.head {
		display: flex;
		justify-content: space-between;
		align-items: center;
		gap: 12px;
	}

	h2 {
		font-size: 22px;
	}

	.muted {
		margin-top: 2px;
		font-size: 14px;
		color: var(--color-text-muted);
	}

	.total {
		min-width: 64px;
		padding: 6px 10px;
		border-radius: 14px;
		background: var(--color-current-bg);
		color: var(--color-accent);
		font-family: var(--font-display);
		font-size: 28px;
		font-weight: 900;
		text-align: center;
		font-variant-numeric: tabular-nums;
	}

	h3.k {
		margin-top: 16px;
		font-size: 11px;
		font-weight: 800;
		letter-spacing: 0.06em;
		text-transform: uppercase;
		color: var(--color-text-muted);
	}

	.notes {
		list-style: none;
		margin-top: 8px;
		display: flex;
		flex-direction: column;
		gap: 6px;
		font-size: 14px;
	}

	.notes li {
		padding: 8px 12px;
		border-radius: 12px;
		background: var(--color-effect-bg);
		color: var(--color-effect-ink);
		font-weight: 600;
	}

	.edit-link {
		display: block;
		margin-top: 12px;
		padding: 12px 0;
		text-align: center;
		color: var(--color-accent);
		font-weight: 800;
	}
</style>
