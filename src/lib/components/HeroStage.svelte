<script lang="ts">
	import { untrack } from 'svelte';
	import HeroSprite from './HeroSprite.svelte';
	import LookSheet from './LookSheet.svelte';
	import { session } from '$lib/session.svelte';
	import { bladesongActive } from '$lib/rules/stats';
	import { heroGear, heroLook } from '$lib/sprite';
	import type { Character } from '$lib/types';

	/**
	 * The pixel hero on a small stage, playing whatever the character just did (`session.act`). If that's out of view it
	 * jumps to the corner of the screen for the moment. `floating` leaves only that: nothing on the page until there's
	 * something to play (the Spells tab). Tapping it opens the look.
	 */
	let { floating = false }: { floating?: boolean } = $props();

	const c = $derived(session.character as Character);
	const gear = $derived(heroGear(c));
	const look = $derived(heroLook(c));
	const act = $derived(session.heroAct);
	const down = $derived(c.hpCurrent <= 0 && !c.wildShape);
	const label = $derived(`${c.name}${down ? ', down' : ''}`);

	let slot = $state<HTMLElement>();
	let lookOpen = $state(false);
	/** Out in the corner, because the slot is scrolled out of view. */
	let popped = $state(false);

	$effect(() => {
		const playing = !!act;
		untrack(() => {
			const r = slot?.getBoundingClientRect();
			popped = playing && !!r && (r.bottom < 0 || r.top > window.innerHeight);
		});
	});
</script>

{#if floating}
	{#if act}
		<span class="tile corner below" aria-hidden="true">
			<HeroSprite {gear} {look} px={2} {label} {act} {down} />
		</span>
	{/if}
{:else}
	<button type="button" class="slot" aria-label="{label}. Change how they look." bind:this={slot} onclick={() => (lookOpen = true)}>
		<span class="tile" class:corner={popped} class:song={bladesongActive(c)}>
			<HeroSprite {gear} {look} px={2} {label} {act} {down} />
		</span>
	</button>
	<LookSheet open={lookOpen} onclose={() => (lookOpen = false)} />
{/if}

<style>
	.slot {
		flex-shrink: 0;
		width: 72px;
		height: 88px;
		padding: 0;
		border: 0;
		background: transparent;
	}

	.tile {
		position: relative;
		display: flex;
		align-items: flex-end;
		justify-content: center;
		width: 72px;
		height: 88px;
		padding-bottom: 4px;
		border-radius: 14px;
		background: linear-gradient(var(--color-stage) 82%, var(--color-stage-floor) 82%);
		box-shadow: inset 0 0 0 2px var(--color-stage-edge);
	}

	.tile.song {
		box-shadow:
			inset 0 0 0 2px var(--color-spell-edge),
			0 0 0 2px var(--color-spell-bg);
	}

	/* Off the page for a moment, so what just happened is still seen. */
	.tile.corner {
		position: fixed;
		top: calc(10px + env(safe-area-inset-top));
		right: 12px;
		z-index: 31;
		box-shadow:
			inset 0 0 0 2px var(--color-stage-edge),
			var(--shadow-lg);
		pointer-events: none;
	}

	/* Clear of the cast summary at the top of the Spells tab. */
	.tile.below {
		top: calc(112px + env(safe-area-inset-top));
	}
</style>
