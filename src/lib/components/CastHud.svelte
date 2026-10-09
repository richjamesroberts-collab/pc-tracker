<script lang="ts">
	import { onMount } from 'svelte';
	import { fly } from 'svelte/transition';
	import Pips from './Pips.svelte';
	import type { Spent } from '$lib/rules/castfx';

	/**
	 * What a cast used, shown at the top of the screen when the Spells tab's slots are scrolled out of view: each
	 * slot, pact slot or point pool with its pips, the spent ones draining away (Pips' `fx`), or the count going down.
	 */
	let { spell, spent }: { spell: string; spent: Spent[] } = $props();

	let after = $state(false);
	onMount(() => {
		// Shown full first, then spent, so the pips play their drain.
		const t = setTimeout(() => (after = true), 260);
		return () => clearTimeout(t);
	});
</script>

<div class="hud" role="status" transition:fly={{ y: -24, duration: 220 }}>
	<p class="title">{spell}</p>
	{#each spent as s (s.key)}
		{@const left = after ? s.after : s.before}
		<div class="row">
			<b>{s.label}</b>
			{#if s.shape && s.max <= 10}
				<Pips label={s.label} max={s.max} {left} shape={s.shape} size={14} fx />
			{:else}
				<span class="num" class:dropped={after}>{left} / {s.max}</span>
			{/if}
			<span class="left">{left} left</span>
		</div>
	{/each}
</div>

<style>
	.hud {
		position: fixed;
		top: calc(10px + env(safe-area-inset-top));
		left: 12px;
		right: 12px;
		z-index: 30;
		max-width: 420px;
		margin: 0 auto;
		padding: 10px 14px;
		border-radius: 16px;
		border: 1.5px solid var(--color-spell-edge);
		background: var(--color-surface);
		box-shadow: var(--shadow-lg);
		pointer-events: none;
	}

	.title {
		font-size: 13px;
		font-weight: 800;
		color: var(--color-spell-ink);
		margin-bottom: 2px;
	}

	.row {
		display: flex;
		align-items: center;
		gap: 10px;
		min-height: 26px;
		font-size: 14px;
	}

	.row b {
		flex: none;
		min-width: 0;
		white-space: nowrap;
		color: var(--color-text);
	}

	.num {
		font-weight: 900;
		font-variant-numeric: tabular-nums;
		color: var(--color-spell-ink);
	}

	.num.dropped {
		animation: drop 0.5s ease-out;
	}

	.left {
		margin-left: auto;
		font-size: 13px;
		font-weight: 700;
		color: var(--color-text-muted);
		white-space: nowrap;
	}

	@keyframes drop {
		0% {
			transform: translateY(-6px);
			opacity: 0;
		}
		100% {
			transform: none;
			opacity: 1;
		}
	}

	@media (prefers-reduced-motion: reduce) {
		.num.dropped {
			animation: none;
		}
	}
</style>
