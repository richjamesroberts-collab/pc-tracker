<script lang="ts">
	import { untrack } from 'svelte';
	import { HERO_H, HERO_W, PLAIN_LOOK, drawHero, runs, type HeroAct, type HeroGear, type HeroLook, type Layer } from '$lib/sprite';

	/**
	 * The pixel hero as the character looks, in what it has on; whatever goes on flashes in. `act` plays a moment
	 * (a hit, a swing, a cast) with its coloured sparks, and `down` lays it out flat.
	 */
	let {
		gear,
		look = PLAIN_LOOK,
		px = 5,
		label,
		act = null,
		down = false
	}: { gear: HeroGear; look?: HeroLook; px?: number; label: string; act?: HeroAct | null; down?: boolean } = $props();

	const SPARKS = [
		{ x: 4, y: 28, d: 0 },
		{ x: 26, y: 24, d: 70 },
		{ x: 9, y: 14, d: 140 },
		{ x: 22, y: 10, d: 60 },
		{ x: 15, y: 5, d: 190 },
		{ x: 29, y: 18, d: 240 }
	];

	const pixels = $derived(runs(drawHero(gear, look)));

	/** Layers just put on, and a count so the flash starts over each time. */
	let flash = $state<Layer[]>([]);
	let flashes = $state(0);
	const glow = $derived(flash.length ? runs(drawHero(gear, look, flash)) : []);

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

<div class="hero" class:down style:width="{HERO_W * px}px" style:height="{HERO_H * px}px" style:--px="{px}px" style:--tint={act ? `var(${act.tint})` : undefined}>
	<span class="shadow" aria-hidden="true"></span>
	{#key act?.n}
		<div class="pose {act?.pose ?? ''}">
			<svg class:bob={!down} viewBox="0 0 {HERO_W} {HERO_H}" width={HERO_W * px} height={HERO_H * px} role="img" aria-label={label} shape-rendering="crispEdges">
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
				{#if act}
					<g class="blink">
						{#each pixels as p, n (n)}
							<rect x={p.x} y={p.y} width={p.w} height="1" />
						{/each}
					</g>
				{/if}
			</svg>
		</div>
		{#if act}
			<span class="sparks {act.pose}" aria-hidden="true">
				{#if act.pose === 'swing'}
					<span class="slash"></span>
				{:else if act.pose === 'shoot'}
					<span class="bolt"></span>
				{:else if act.pose === 'rest'}
					<span class="zed">z</span><span class="zed second">z</span>
				{:else}
					{#each SPARKS as s, i (i)}
						<span class="spark" style:--x={s.x} style:--y={s.y} style:animation-delay="{s.d}ms"></span>
					{/each}
				{/if}
			</span>
		{/if}
	{/key}
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

	/* Flat on the floor at 0 hit points, turned a pixel-exact quarter. */
	.down svg {
		/* The hero's full height is wider than the Vitals stage, so it's drawn a little smaller lying down. */
		transform: rotate(90deg) translateX(calc(var(--px) * 9)) scale(0.875);
		filter: grayscale(0.7);
		opacity: 0.8;
	}

	.down .shadow {
		left: calc(var(--px) * 2);
		width: calc(var(--px) * 28);
	}

	/* Moments, moved a sprite's pixel at a time. */
	.pose.hit {
		animation: hit 0.5s steps(1);
	}

	.pose.heal,
	.pose.use {
		animation: hop 0.7s steps(1);
	}

	.pose.temp {
		animation: brace 0.6s steps(1);
	}

	.pose.swing {
		animation: swing 0.55s steps(1);
	}

	.pose.shoot {
		animation: shoot 0.6s steps(1);
	}

	.pose.cast {
		animation: rise 0.8s steps(1);
	}

	.pose.rest {
		animation: sink 1s steps(1);
	}

	@keyframes hit {
		0% {
			transform: translateX(calc(var(--px) * -3));
		}
		20% {
			transform: translateX(calc(var(--px) * 2));
		}
		40% {
			transform: translateX(calc(var(--px) * -2));
		}
		60% {
			transform: translateX(var(--px));
		}
		80% {
			transform: none;
		}
	}

	@keyframes hop {
		0%,
		50% {
			transform: translateY(calc(var(--px) * -2));
		}
		25%,
		75% {
			transform: translateY(calc(var(--px) * -4));
		}
		100% {
			transform: none;
		}
	}

	@keyframes brace {
		0% {
			transform: translateY(var(--px));
		}
		50% {
			transform: translateY(calc(var(--px) * -1));
		}
	}

	@keyframes swing {
		0% {
			transform: translateX(calc(var(--px) * -2));
		}
		20% {
			transform: translateX(calc(var(--px) * 3));
		}
		40% {
			transform: translateX(calc(var(--px) * 6));
		}
		75% {
			transform: translateX(calc(var(--px) * 2));
		}
		100% {
			transform: none;
		}
	}

	@keyframes shoot {
		0% {
			transform: translateX(var(--px));
		}
		30% {
			transform: translateX(calc(var(--px) * -2));
		}
		60% {
			transform: translateX(calc(var(--px) * -1));
		}
		100% {
			transform: none;
		}
	}

	@keyframes rise {
		0% {
			transform: translateY(calc(var(--px) * -1));
		}
		25% {
			transform: translateY(calc(var(--px) * -3));
		}
		75% {
			transform: translateY(calc(var(--px) * -2));
		}
		100% {
			transform: none;
		}
	}

	@keyframes sink {
		0% {
			transform: translateY(var(--px));
		}
		50% {
			transform: translateY(calc(var(--px) * 2));
		}
		100% {
			transform: none;
		}
	}

	/* The whole figure blinks the moment's colour. */
	.blink rect {
		fill: var(--tint);
	}

	.blink {
		opacity: 0;
		animation: blink 0.6s steps(1);
	}

	.hit .blink,
	.hit + .sparks {
		animation-duration: 0.5s;
	}

	@keyframes blink {
		0%,
		40% {
			opacity: 0.85;
		}
		20%,
		60% {
			opacity: 0;
		}
	}

	.sparks {
		position: absolute;
		inset: 0;
		pointer-events: none;
	}

	.spark {
		position: absolute;
		left: calc(var(--px) * var(--x));
		top: calc(var(--px) * var(--y));
		width: calc(var(--px) * 2);
		height: calc(var(--px) * 2);
		background: var(--tint);
		opacity: 0;
		animation: spark 0.75s steps(5) forwards;
	}

	.hit .spark {
		animation-name: scatter;
		animation-duration: 0.45s;
	}

	.cast .spark {
		border-radius: 0;
		animation-duration: 0.9s;
	}

	@keyframes spark {
		0% {
			opacity: 1;
			transform: translateY(calc(var(--px) * 6));
		}
		100% {
			opacity: 0;
			transform: translateY(calc(var(--px) * -8));
		}
	}

	@keyframes scatter {
		0% {
			opacity: 1;
			transform: none;
		}
		100% {
			opacity: 0;
			transform: translate(calc((var(--x) - 16) * var(--px)), calc((var(--y) - 20) * var(--px)));
		}
	}

	/* A blade's arc off to the side of the lunge. */
	.slash {
		position: absolute;
		left: calc(var(--px) * 24);
		top: calc(var(--px) * 8);
		width: calc(var(--px) * 12);
		height: calc(var(--px) * 22);
		border: calc(var(--px) * 2) solid var(--tint);
		border-left-color: transparent;
		border-bottom-color: transparent;
		border-radius: 50%;
		opacity: 0;
		animation: slash 0.4s steps(4) 0.1s forwards;
	}

	@keyframes slash {
		0% {
			opacity: 1;
			transform: rotate(-50deg);
		}
		100% {
			opacity: 0;
			transform: rotate(70deg);
		}
	}

	.bolt {
		position: absolute;
		left: calc(var(--px) * 26);
		top: calc(var(--px) * 18);
		width: calc(var(--px) * 7);
		height: calc(var(--px) * 1);
		background: var(--tint);
		opacity: 0;
		animation: bolt 0.4s steps(6) 0.15s forwards;
	}

	@keyframes bolt {
		0% {
			opacity: 1;
			transform: none;
		}
		100% {
			opacity: 0;
			transform: translateX(calc(var(--px) * 26));
		}
	}

	.zed {
		position: absolute;
		left: calc(var(--px) * 24);
		top: calc(var(--px) * 8);
		font-family: var(--font-display);
		font-size: calc(var(--px) * 6);
		font-weight: 900;
		line-height: 1;
		color: var(--tint);
		opacity: 0;
		animation: zed 0.9s steps(5) forwards;
	}

	.zed.second {
		left: calc(var(--px) * 28);
		animation-delay: 0.2s;
	}

	@keyframes zed {
		0% {
			opacity: 1;
		}
		100% {
			opacity: 0;
			transform: translateY(calc(var(--px) * -8));
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

	/* Keeps the coloured blink, which says what happened without moving. */
	@media (prefers-reduced-motion: reduce) {
		.bob,
		.pose {
			animation: none !important;
		}

		.sparks {
			display: none;
		}
	}
</style>
