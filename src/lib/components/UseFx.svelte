<script lang="ts">
	import type { UseFx } from '$lib/rules/usable';

	/**
	 * The animation Vitals plays over the Usable items card when an item is used, one per kind of item: flames for
	 * fire, a bolt for lightning, snow for frost, notes for music, smoke for a summoned creature and so on. Sits
	 * over the card (its parent is positioned); the icon is at the card's left, which is where most of it starts.
	 */
	let { kind, label }: { kind: UseFx; label: string } = $props();

	/** Spread along the card for things that rise or fall: left (%), delay (ms), sideways drift (px). */
	const ROW = [8, 22, 36, 50, 64, 78, 92].map((x, i) => ({ x, d: (i * 97) % 420, dx: i % 2 ? 10 : -8 }));
	/** Thrown out from the icon: direction and distance as x/y offsets (px), delay (ms). */
	const BURST = [0, 50, 105, 160, 210, 260, 310].map((deg, i) => {
		const a = (deg * Math.PI) / 180;
		const r = 46 + (i % 3) * 12;
		return { dx: Math.round(Math.cos(a) * r), dy: Math.round(Math.sin(a) * r * 0.7), d: i * 40 };
	});
	/** Scattered over the card for twinkles: left (%), top (%), delay (ms). */
	const SCATTER = [
		[14, 30],
		[30, 70],
		[46, 22],
		[58, 62],
		[72, 34],
		[86, 68],
		[94, 24]
	].map(([x, y], i) => ({ x, y, d: i * 110 }));
	const NOTES = ['♪', '♫', '♩', '♬', '♪', '♫'];
	const STREAKS = [
		{ y: 18, w: 70, d: 0 },
		{ y: 40, w: 110, d: 90 },
		{ y: 58, w: 60, d: 40 },
		{ y: 76, w: 95, d: 160 },
		{ y: 30, w: 50, d: 230 }
	];

	const burst = $derived(['arcane', 'summon', 'lightning', 'radiant', 'scroll'].includes(kind));
</script>

{#snippet star()}
	<svg viewBox="0 0 10 10"><path d="M5 0l1.2 3.8L10 5 6.2 6.2 5 10 3.8 6.2 0 5l3.8-1.2z" /></svg>
{/snippet}

<span class="fx {kind}" aria-hidden="true">
	<span class="clip">
		<span class="wash"></span>
		{#if kind === 'lightning'}
			<svg class="bolt" viewBox="0 0 100 60" preserveAspectRatio="none">
				<polyline points="8,30 26,14 34,36 52,12 60,40 76,18 84,38 98,26" />
			</svg>
		{:else if kind === 'radiant'}
			<span class="rays"></span>
		{:else if kind === 'frost'}
			<span class="rime"></span>
		{:else if kind === 'wind'}
			{#each STREAKS as s, i (i)}
				<span class="streak" style:top="{s.y}%" style:width="{s.w}px" style:animation-delay="{s.d}ms"></span>
			{/each}
		{:else if kind === 'strike'}
			<svg class="swing" viewBox="0 0 100 60" preserveAspectRatio="none">
				<path d="M6 52 Q50 -14 96 40" />
			</svg>
		{:else if kind === 'scroll'}
			{#each [24, 40, 56, 72] as y, i (y)}
				<span class="line" style:top="{y}%" style:animation-delay="{i * 90}ms"></span>
			{/each}
		{/if}
	</span>
	<span class="edge"></span>

	{#if kind === 'fire'}
		{#each ROW as p, i (i)}
			<span class="p flame" style:left="{p.x}%" style:--dx="{p.dx}px" style:animation-delay="{p.d}ms"></span>
		{/each}
	{:else if kind === 'heal'}
		{#each ROW.slice(1, 6) as p, i (i)}
			<span class="p cross" style:left="{p.x}%" style:--dx="{p.dx}px" style:animation-delay="{p.d}ms">+</span>
		{/each}
	{:else if kind === 'poison'}
		{#each ROW as p, i (i)}
			{#if i % 2}
				<span class="p drip" style:left="{p.x}%" style:animation-delay="{p.d}ms"></span>
			{:else}
				<span class="p bubble" style:left="{p.x}%" style:--dx="{p.dx}px" style:animation-delay="{p.d}ms"></span>
			{/if}
		{/each}
	{:else if kind === 'light'}
		<span class="bloom"></span>
		{#each [0, 45, 90, 135, 180, 225, 270, 315] as deg (deg)}
			<span class="beam" style:--r="{deg}deg"></span>
		{/each}
		{#each ROW.slice(2) as p, i (i)}
			<span class="p mote" style:left="{p.x}%" style:--dx="{p.dx}px" style:animation-delay="{p.d + 200}ms"></span>
		{/each}
	{:else if kind === 'frost'}
		{#each ROW as p, i (i)}
			<span class="p flake" style:left="{p.x}%" style:--dx="{p.dx}px" style:animation-delay="{p.d}ms">
				<svg viewBox="0 0 12 12"><path d="M6 0v12M0.8 3l10.4 6M0.8 9l10.4-6M4.4 1.2 6 2.6l1.6-1.4M4.4 10.8 6 9.4l1.6 1.4" /></svg>
			</span>
		{/each}
	{:else if kind === 'music'}
		{#each NOTES as n, i (i)}
			<span class="p note" style:--dx="{(i % 2 ? 1 : -1) * (14 + i * 6)}px" style:animation-delay="{i * 150}ms">{n}</span>
		{/each}
	{:else if kind === 'force'}
		{#each [0, 220, 440] as d (d)}
			<svg class="hex" viewBox="0 0 40 40" style:animation-delay="{d}ms"><polygon points="20,2 36,11 36,29 20,38 4,29 4,11" /></svg>
		{/each}
	{:else if kind === 'vanish'}
		{#each SCATTER as p, i (i)}
			<span class="p glitter" style:left="{p.x}%" style:top="{p.y}%" style:animation-delay="{p.d}ms">{@render star()}</span>
		{/each}
	{:else if kind === 'summon'}
		{#each BURST.slice(0, 6) as p, i (i)}
			<span class="p puff" style:--dx="{p.dx}px" style:--dy="{p.dy - 14}px" style:animation-delay="{p.d}ms"></span>
		{/each}
	{:else if kind === 'gear'}
		<span class="ring"></span>
		<svg class="tick" viewBox="0 0 24 24"><path d="M5 12.5l4.5 4.5L19 7.5" /></svg>
	{:else if kind === 'strike'}
		<span class="p glint">{@render star()}</span>
	{/if}

	{#if burst}
		{#each BURST as p, i (i)}
			<span class="p spark" style:--dx="{p.dx}px" style:--dy="{p.dy}px" style:animation-delay="{p.d + (kind === 'summon' ? 260 : 0)}ms">
				{@render star()}
			</span>
		{/each}
	{/if}
	{#if kind === 'arcane'}
		<svg class="circle" viewBox="0 0 40 40"><circle cx="20" cy="20" r="17" /><circle class="inner" cx="20" cy="20" r="11" /></svg>
	{/if}

	<span class="tag">{label}</span>
</span>

<style>
	.fx {
		/* Where the icon sits on the card: things thrown out start here. */
		--ox: 31px;
		position: absolute;
		inset: 0;
		z-index: 2;
		pointer-events: none;
	}

	.fire {
		--c: var(--color-warning);
		--c2: var(--color-hit);
	}
	.lightning {
		--c: var(--color-accent);
		--c2: var(--color-conc-edge);
	}
	.frost {
		--c: var(--color-accent);
		--c2: var(--color-conc-edge);
	}
	.poison {
		--c: var(--color-hp-high);
		--c2: var(--color-ready-edge);
	}
	.radiant {
		--c: var(--color-warning);
		--c2: var(--color-effect-edge);
	}
	.heal {
		--c: var(--color-heal);
		--c2: var(--color-ready-edge);
	}
	.light {
		--c: var(--color-warning);
		--c2: var(--color-effect-edge);
	}
	.force {
		--c: var(--color-accent);
		--c2: var(--color-conc-edge);
	}
	.vanish {
		--c: var(--color-lair);
		--c2: var(--color-spell-edge);
	}
	.summon {
		--c: var(--color-text-muted);
		--c2: var(--color-text-faint);
	}
	.music {
		--c: var(--color-cond-ink);
		--c2: var(--color-cond-edge);
	}
	.wind {
		--c: var(--color-accent);
		--c2: var(--color-conc-edge);
	}
	.strike {
		--c: var(--color-text-faint);
		--c2: var(--color-warning);
	}
	.scroll {
		--c: var(--color-effect-ink);
		--c2: var(--color-effect-edge);
	}
	.arcane {
		--c: var(--color-lair);
		--c2: var(--color-spell-edge);
	}
	.gear {
		--c: var(--color-accent);
		--c2: var(--color-accent-dim);
	}

	.clip {
		position: absolute;
		inset: 0;
		border-radius: var(--radius-xl);
		overflow: hidden;
	}

	.edge {
		position: absolute;
		inset: -1px;
		border-radius: var(--radius-xl);
		box-shadow: 0 0 0 2px var(--c);
		opacity: 0;
		animation: fx-fade 1.7s ease-out;
	}

	.wash {
		position: absolute;
		inset: 0;
		background: radial-gradient(circle at var(--ox) 50%, var(--c2), transparent 75%);
		opacity: 0;
		animation: fx-wash 1.3s ease-out;
	}

	.fire .wash,
	.poison .wash,
	.heal .wash {
		background: linear-gradient(to top, var(--c2), transparent 85%);
	}

	.scroll .wash {
		background: var(--color-effect-bg);
	}

	/* Particles: placed by the markup, started by their own keyframes. */
	.p {
		position: absolute;
		opacity: 0;
		animation-fill-mode: both;
	}

	.p svg {
		display: block;
		width: 100%;
		height: 100%;
		fill: currentColor;
	}

	/* What was spent ("−2 charges", "Used"), floating up over the count. */
	.tag {
		position: absolute;
		right: 58px;
		top: 50%;
		font-family: var(--font-display);
		font-size: 20px;
		font-weight: 900;
		white-space: nowrap;
		color: var(--c);
		text-shadow: 0 1px 0 var(--color-surface), 0 0 6px var(--color-surface);
		opacity: 0;
		animation: fx-tag 1.8s ease-out;
	}

	/* Fire: flames lick up off the bottom of the card and the card warms. */
	.flame {
		bottom: 2px;
		width: 13px;
		height: 20px;
		margin-left: -6px;
		border-radius: 50% 50% 50% 50% / 62% 62% 38% 38%;
		background: linear-gradient(to top, var(--color-hit), var(--color-warning) 55%, var(--color-effect-edge));
		transform-origin: 50% 100%;
		animation: flame 1.1s ease-out;
	}

	@keyframes flame {
		0% {
			opacity: 0;
			transform: translate(0, 6px) scale(0.5);
		}
		20% {
			opacity: 1;
			transform: translate(calc(var(--dx) * 0.3), -8px) scale(1.1, 1);
		}
		45% {
			transform: translate(calc(var(--dx) * -0.4), -26px) scale(0.85, 1.15);
		}
		100% {
			opacity: 0;
			transform: translate(var(--dx), -64px) scale(0.3);
		}
	}

	/* Lightning: a bolt cracks across, the card flashes twice and jolts (the jolt is the page's). */
	.bolt {
		position: absolute;
		inset: 0;
		width: 100%;
		height: 100%;
		fill: none;
		stroke: var(--c);
		stroke-width: 3;
		stroke-linejoin: round;
		vector-effect: non-scaling-stroke;
		stroke-dasharray: 200;
		filter: drop-shadow(0 0 4px var(--c2));
		animation: bolt 0.9s ease-out both;
	}

	.lightning .wash {
		background: var(--c2);
		animation: flash 0.8s ease-out;
	}

	@keyframes bolt {
		0% {
			stroke-dashoffset: 200;
			opacity: 1;
		}
		25% {
			stroke-dashoffset: 0;
			opacity: 1;
		}
		35% {
			opacity: 0.2;
		}
		45% {
			opacity: 1;
		}
		100% {
			stroke-dashoffset: 0;
			opacity: 0;
		}
	}

	@keyframes flash {
		0%,
		40% {
			opacity: 0;
		}
		10%,
		50% {
			opacity: 0.7;
		}
		100% {
			opacity: 0;
		}
	}

	/* Frost: rime creeps in from the edges and snowflakes drift down. */
	.rime {
		position: absolute;
		inset: 0;
		box-shadow: inset 0 0 22px 6px var(--c2);
		opacity: 0;
		animation: fx-fade 1.6s ease-out;
	}

	.flake {
		top: -14px;
		width: 13px;
		height: 13px;
		color: var(--c);
		animation: flake 1.5s ease-in;
	}

	.flake svg {
		fill: none;
		stroke: currentColor;
		stroke-width: 1.4;
		stroke-linecap: round;
	}

	@keyframes flake {
		0% {
			opacity: 0;
			transform: translate(0, -10px) rotate(0);
		}
		20% {
			opacity: 1;
		}
		100% {
			opacity: 0;
			transform: translate(var(--dx), 66px) rotate(160deg);
		}
	}

	/* Poison and acid: drips run down from the top, bubbles rise from the bottom. */
	.drip {
		top: 0;
		width: 11px;
		height: 11px;
		border-radius: 0 50% 50% 50%;
		background: var(--c);
		transform: rotate(45deg);
		animation: drip 1.3s ease-in;
	}

	.bubble {
		bottom: 4px;
		width: 12px;
		height: 12px;
		border: 2px solid var(--c);
		border-radius: 50%;
		animation: bubble 1.3s ease-out;
	}

	@keyframes drip {
		0% {
			opacity: 0;
			transform: translateY(-6px) rotate(45deg) scale(0.4);
		}
		25% {
			opacity: 1;
			transform: translateY(0) rotate(45deg) scale(1);
		}
		100% {
			opacity: 0;
			transform: translateY(54px) rotate(45deg) scale(0.8);
		}
	}

	@keyframes bubble {
		0% {
			opacity: 0;
			transform: translate(0, 0) scale(0.4);
		}
		25% {
			opacity: 0.9;
		}
		85% {
			opacity: 0.9;
			transform: translate(var(--dx), -48px) scale(1.1);
		}
		100% {
			opacity: 0;
			transform: translate(var(--dx), -54px) scale(1.6);
		}
	}

	/* Radiant: golden rays turn out from the icon. */
	.rays {
		position: absolute;
		left: var(--ox);
		top: 50%;
		width: 260px;
		height: 260px;
		margin: -130px 0 0 -130px;
		background: repeating-conic-gradient(var(--c2) 0 9deg, transparent 9deg 30deg);
		mask: radial-gradient(circle, #000 12%, transparent 62%);
		opacity: 0;
		animation: rays 1.6s ease-out;
	}

	@keyframes rays {
		0% {
			opacity: 0;
			transform: rotate(0) scale(0.3);
		}
		25% {
			opacity: 0.85;
		}
		100% {
			opacity: 0;
			transform: rotate(50deg) scale(1.3);
		}
	}

	/* Healing: little crosses rise, as for a healing potion. */
	.cross {
		bottom: 6px;
		font-size: 18px;
		font-weight: 900;
		line-height: 1;
		color: var(--c);
		animation: rise 1.3s ease-out;
	}

	@keyframes rise {
		0% {
			opacity: 0;
			transform: translate(0, 0) scale(0.6);
		}
		30% {
			opacity: 0.9;
		}
		100% {
			opacity: 0;
			transform: translate(var(--dx), -76px) scale(1.2);
		}
	}

	/* Light: a bloom of light from the icon, beams flaring out and motes drifting up. */
	.bloom {
		position: absolute;
		left: var(--ox);
		top: 50%;
		width: 24px;
		height: 24px;
		margin: -12px 0 0 -12px;
		border-radius: 50%;
		background: radial-gradient(circle, var(--color-surface-raised), var(--c2) 45%, transparent 70%);
		opacity: 0;
		animation: bloom 1.4s ease-out;
	}

	.beam {
		position: absolute;
		left: var(--ox);
		top: 50%;
		width: 3px;
		height: 16px;
		margin: -8px 0 0 -1.5px;
		border-radius: 2px;
		background: var(--c);
		opacity: 0;
		animation: beam 0.9s ease-out;
	}

	.mote {
		bottom: 10px;
		width: 5px;
		height: 5px;
		border-radius: 50%;
		background: var(--c2);
		box-shadow: 0 0 6px var(--c2);
		animation: rise 1.6s ease-out;
	}

	@keyframes bloom {
		0% {
			opacity: 0;
			transform: scale(0.5);
		}
		25% {
			opacity: 1;
		}
		100% {
			opacity: 0;
			transform: scale(9);
		}
	}

	@keyframes beam {
		0% {
			opacity: 0;
			transform: rotate(var(--r)) translateY(-14px) scaleY(0.3);
		}
		30% {
			opacity: 1;
		}
		100% {
			opacity: 0;
			transform: rotate(var(--r)) translateY(-40px) scaleY(1);
		}
	}

	/* Music: notes float up from the icon, swaying. */
	.note {
		left: var(--ox);
		top: 50%;
		margin: -12px 0 0 -6px;
		font-size: 22px;
		font-weight: 700;
		line-height: 1;
		color: var(--c);
		animation: note 1.6s ease-out;
	}

	@keyframes note {
		0% {
			opacity: 0;
			transform: translate(0, 0) scale(0.6);
		}
		20% {
			opacity: 1;
			transform: translate(calc(var(--dx) * 0.5), -16px) rotate(-12deg) scale(1);
		}
		50% {
			transform: translate(calc(var(--dx) * 1.4), -40px) rotate(10deg);
		}
		75% {
			opacity: 1;
		}
		100% {
			opacity: 0;
			transform: translate(calc(var(--dx) * 2.2), -74px) rotate(-8deg);
		}
	}

	/* Force: hexagonal shields ripple out from the icon. */
	.hex {
		position: absolute;
		left: var(--ox);
		top: 50%;
		width: 40px;
		height: 40px;
		margin: -20px 0 0 -20px;
		fill: var(--c2);
		fill-opacity: 0.25;
		stroke: var(--c);
		stroke-width: 2;
		vector-effect: non-scaling-stroke;
		opacity: 0;
		animation: hex 1.2s ease-out both;
	}

	@keyframes hex {
		0% {
			opacity: 0;
			transform: scale(0.3);
		}
		20% {
			opacity: 1;
		}
		100% {
			opacity: 0;
			transform: scale(3.2);
		}
	}

	/* Vanish: the card fades out of sight (the page's) and glitters back. */
	.glitter {
		width: 12px;
		height: 12px;
		margin: -6px 0 0 -6px;
		color: var(--c);
		animation: twinkle 1s ease-in-out;
	}

	@keyframes twinkle {
		0%,
		100% {
			opacity: 0;
			transform: scale(0) rotate(0);
		}
		50% {
			opacity: 1;
			transform: scale(1.2) rotate(45deg);
		}
	}

	/* Summon: a puff of smoke from the icon, then sparks as the creature appears. */
	.puff {
		left: var(--ox);
		top: 50%;
		width: 22px;
		height: 22px;
		margin: -11px 0 0 -11px;
		border-radius: 50%;
		background: var(--c2);
		filter: blur(2px);
		animation: puff 1.2s ease-out;
	}

	@keyframes puff {
		0% {
			opacity: 0;
			transform: translate(0, 0) scale(0.3);
		}
		20% {
			opacity: 0.6;
		}
		100% {
			opacity: 0;
			transform: translate(var(--dx), var(--dy)) scale(2.4);
		}
	}

	/* Wind: gusts sweep across the card. */
	.streak {
		position: absolute;
		left: 0;
		height: 3px;
		border-radius: 2px;
		background: linear-gradient(to right, transparent, var(--c));
		opacity: 0;
		animation: streak 0.9s ease-in-out both;
	}

	@keyframes streak {
		0% {
			opacity: 0;
			transform: translateX(-120px);
		}
		30% {
			opacity: 0.9;
		}
		100% {
			opacity: 0;
			transform: translateX(440px);
		}
	}

	/* Strike: a blade's arc sweeps across with a glint where it ends. */
	.swing {
		position: absolute;
		inset: 0;
		width: 100%;
		height: 100%;
		fill: none;
		stroke: var(--c);
		stroke-width: 2.5;
		stroke-linecap: round;
		vector-effect: non-scaling-stroke;
		stroke-dasharray: 200;
		filter: drop-shadow(0 0 3px var(--color-surface-raised));
		animation: swing 0.7s ease-out both;
	}

	.glint {
		right: 10px;
		top: 30%;
		width: 20px;
		height: 20px;
		color: var(--c2);
		animation: twinkle 0.7s ease-in-out 0.25s both;
	}

	@keyframes swing {
		0% {
			stroke-dashoffset: 200;
			opacity: 1;
		}
		40% {
			stroke-dashoffset: 0;
			opacity: 1;
		}
		100% {
			stroke-dashoffset: 0;
			opacity: 0;
		}
	}

	/* Scroll: the words lift off the page, then it crumbles (sparks fall as dust). */
	.line {
		position: absolute;
		left: 64px;
		width: 42%;
		height: 2px;
		border-radius: 2px;
		background: var(--c2);
		opacity: 0;
		animation: words 1.2s ease-out both;
	}

	@keyframes words {
		0% {
			opacity: 0;
			transform: translateY(4px);
		}
		25% {
			opacity: 0.5;
			transform: translateY(-4px);
		}
		100% {
			opacity: 0;
			transform: translateY(-22px) scaleX(0.3);
		}
	}

	/* Sparks thrown out from the icon: arcane, summon, lightning, radiant and scroll. */
	.spark {
		left: var(--ox);
		top: 50%;
		width: 11px;
		height: 11px;
		margin: -5.5px 0 0 -5.5px;
		color: var(--c);
		animation: spark 1s ease-out;
	}

	.radiant .spark {
		color: var(--c2);
	}

	.scroll .spark {
		width: 6px;
		height: 6px;
		margin: -3px 0 0 -3px;
		animation: dust 1.4s ease-in;
	}

	@keyframes spark {
		0% {
			opacity: 0;
			transform: translate(0, 0) scale(0.3) rotate(0);
		}
		25% {
			opacity: 1;
		}
		100% {
			opacity: 0;
			transform: translate(var(--dx), var(--dy)) scale(1) rotate(90deg);
		}
	}

	@keyframes dust {
		0% {
			opacity: 0;
			transform: translate(0, 0);
		}
		20% {
			opacity: 0.9;
		}
		100% {
			opacity: 0;
			transform: translate(calc(var(--dx) * 0.5), 40px) rotate(120deg);
		}
	}

	/* Arcane: a runic circle turns around the icon as sparks fly. */
	.circle {
		position: absolute;
		left: var(--ox);
		top: 50%;
		width: 52px;
		height: 52px;
		margin: -26px 0 0 -26px;
		fill: none;
		stroke: var(--c);
		stroke-width: 1.6;
		stroke-dasharray: 5 3;
		opacity: 0;
		animation: circle 1.4s ease-out;
	}

	.circle .inner {
		stroke-dasharray: 2 4;
	}

	@keyframes circle {
		0% {
			opacity: 0;
			transform: scale(0.4) rotate(0);
		}
		25% {
			opacity: 1;
			transform: scale(1) rotate(60deg);
		}
		100% {
			opacity: 0;
			transform: scale(1.3) rotate(200deg);
		}
	}

	/* Gear: a tick over the icon and a ring. */
	.ring {
		position: absolute;
		left: var(--ox);
		top: 50%;
		width: 40px;
		height: 40px;
		margin: -20px 0 0 -20px;
		border: 2px solid var(--c);
		border-radius: 50%;
		opacity: 0;
		animation: hex 1s ease-out;
	}

	.tick {
		position: absolute;
		left: calc(var(--ox) + 6px);
		top: 4px;
		width: 22px;
		height: 22px;
		padding: 2px;
		border-radius: 50%;
		background: var(--c);
		fill: none;
		stroke: var(--color-on-accent);
		stroke-width: 3;
		stroke-linecap: round;
		stroke-linejoin: round;
		stroke-dasharray: 24;
		opacity: 0;
		animation: tick 1.4s ease-out both;
	}

	@keyframes tick {
		0% {
			opacity: 0;
			stroke-dashoffset: 24;
			transform: scale(0.4);
		}
		20% {
			opacity: 1;
			transform: scale(1.15);
		}
		40% {
			stroke-dashoffset: 0;
			transform: scale(1);
		}
		80% {
			opacity: 1;
		}
		100% {
			opacity: 0;
			stroke-dashoffset: 0;
		}
	}

	@keyframes fx-fade {
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

	@keyframes fx-wash {
		0% {
			opacity: 0;
		}
		25% {
			opacity: 0.35;
		}
		100% {
			opacity: 0;
		}
	}

	@keyframes fx-tag {
		0% {
			opacity: 0;
			transform: translateY(-30%) scale(0.7);
		}
		18% {
			opacity: 1;
			transform: translateY(-50%) scale(1.08);
		}
		70% {
			opacity: 1;
			transform: translateY(-80%) scale(1);
		}
		100% {
			opacity: 0;
			transform: translateY(-150%);
		}
	}

	@media (prefers-reduced-motion: reduce) {
		.fx *:not(.tag) {
			animation: none !important;
			opacity: 0;
		}

		.tag {
			animation: fx-tag-still 1.8s ease-out;
			transform: translateY(-50%);
		}

		@keyframes fx-tag-still {
			0%,
			70% {
				opacity: 1;
			}
			100% {
				opacity: 0;
			}
		}
	}
</style>
