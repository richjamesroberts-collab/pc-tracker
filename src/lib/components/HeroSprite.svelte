<script lang="ts">
	import { untrack } from 'svelte';
	import { HERO_H, HERO_W, drawHero, runs, type HeroGear, type Layer } from '$lib/sprite';

	/** The pixel hero in what it has on; whatever goes on flashes in. */
	let { gear, px = 5, label }: { gear: HeroGear; px?: number; label: string } = $props();

	const pixels = $derived(runs(drawHero(gear)));

	/** Layers just put on, and a count so the flash starts over each time. */
	let flash = $state<Layer[]>([]);
	let flashes = $state(0);
	const glow = $derived(flash.length ? runs(drawHero(gear, flash)) : []);

	// What it had on last time, to tell what's new (nothing flashes when the screen opens). Armor counts by kind.
	let seen: Set<string> | null = null;
	let timer: ReturnType<typeof setTimeout> | undefined;
	const key = (l: Layer, g: HeroGear) => (l === 'armor' ? `armor:${g.armor}` : l);

	$effect(() => {
		const now = new Set(gear.layers.map((l) => key(l, gear)));
		const fresh = seen ? gear.layers.filter((l) => !seen!.has(key(l, gear))) : [];
		seen = now;
		if (!fresh.length) return;
		untrack(() => {
			flash = fresh;
			flashes++;
		});
		clearTimeout(timer);
		timer = setTimeout(() => (flash = []), 900);
	});

	$effect(() => () => clearTimeout(timer));
</script>

<div class="hero" style:width="{HERO_W * px}px" style:height="{HERO_H * px}px" style:--px="{px}px">
	<span class="shadow" aria-hidden="true"></span>
	<svg class="bob" viewBox="0 0 {HERO_W} {HERO_H}" width={HERO_W * px} height={HERO_H * px} role="img" aria-label={label} shape-rendering="crispEdges">
		{#each pixels as p, n (n)}
			<rect x={p.x} y={p.y} width={p.w} height="1" style:fill="var(--color-px-{p.c})" />
		{/each}
		{#key flashes}
			{#if glow.length}
				<g class="flash">
					{#each glow as p, n (n)}
						<rect x={p.x} y={p.y} width={p.w} height="1" />
					{/each}
				</g>
			{/if}
		{/key}
	</svg>
</div>

<style>
	.hero {
		position: relative;
		flex-shrink: 0;
	}

	.shadow {
		position: absolute;
		left: calc(var(--px) * 9);
		top: calc(var(--px) * 37.5);
		width: calc(var(--px) * 14);
		height: calc(var(--px) * 3);
		border-radius: 50%;
		background: var(--color-px-outline);
		opacity: 0.22;
	}

	svg {
		position: relative;
		display: block;
		overflow: visible;
	}

	/* An idle bob, a sprite's pixel at a time. */
	.bob {
		animation: bob 1.4s steps(1) infinite;
	}

	@keyframes bob {
		50% {
			transform: translateY(calc(var(--px) * -1));
		}
	}

	.flash rect {
		fill: var(--color-px-flash);
	}

	.flash {
		animation: flash 0.9s ease-out forwards;
	}

	@keyframes flash {
		0% {
			opacity: 0;
		}
		15% {
			opacity: 1;
		}
		100% {
			opacity: 0;
		}
	}

	@media (prefers-reduced-motion: reduce) {
		.bob {
			animation: none;
		}
	}
</style>
