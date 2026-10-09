<script lang="ts">
	import { untrack } from 'svelte';
	import { Tween } from 'svelte/motion';
	import { cubicOut } from 'svelte/easing';
	import { COINS } from '$lib/rules/coins';
	import type { Coin, Coins } from '$lib/types';

	/**
	 * Inventory's coins card: a column per coin. When a count changes the number runs to its new value, coins drop
	 * into the column (gained) or fly out of it (spent), and the difference floats up. Switching `scope` (another
	 * stash's tab) just shows the new counts.
	 */
	let { purse, scope, label, onclick }: { purse: Coins; scope: string; label: string; onclick: () => void } = $props();

	const reduced = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
	const shown = Object.fromEntries(COINS.map((k) => [k, new Tween(untrack(() => purse[k]), { duration: 700, easing: cubicOut })])) as Record<Coin, Tween<number>>;

	/** The last change to each coin; `n` restarts its animation. */
	let changes = $state<Partial<Record<Coin, { d: number; n: number }>>>({});
	let prev = untrack(() => ({ ...purse }));
	let prevScope = untrack(() => scope);
	let seq = 0;
	let timer: ReturnType<typeof setTimeout> | undefined;

	$effect(() => {
		const now = { ...purse };
		const sc = scope;
		untrack(() => {
			const same = sc === prevScope;
			const next: typeof changes = {};
			for (const k of COINS) {
				const d = now[k] - prev[k];
				if (same && d) next[k] = { d, n: ++seq };
				void shown[k].set(now[k], { duration: same && d && !reduced ? 700 : 0 });
			}
			if (Object.keys(next).length) {
				changes = { ...changes, ...next };
				clearTimeout(timer);
				timer = setTimeout(() => (changes = {}), 1800);
			} else if (!same) changes = {};
			prev = now;
			prevScope = sc;
		});
	});
	$effect(() => () => clearTimeout(timer));

	/** How many coins to throw for a change: one per coin up to three, then more for bigger amounts. */
	const discs = (d: number) => {
		const n = Math.abs(d);
		return n <= 3 ? n : n < 10 ? 4 : n < 100 ? 5 : 6;
	};
	/** Spread across the column: sideways (px) and delay (ms). */
	const SPREAD = [0, -12, 11, -6, 7, -15].map((x, i) => ({ x, d: i * 70 }));
</script>

<button type="button" class="card coins" aria-label={label} {onclick}>
	{#each COINS as k (k)}
		{@const ch = changes[k]}
		<span class="coin {k}" class:empty={!purse[k]} class:gain={ch && ch.d > 0} class:spend={ch && ch.d < 0}>
			{#key ch?.n}
				<span class="amount">{Math.round(shown[k].current).toLocaleString('en')}</span>
				{#if ch}
					<span class="fx" aria-hidden="true">
						{#each SPREAD.slice(0, discs(ch.d)) as p, i (i)}
							<span class="disc" style:--x="{p.x}px" style:animation-delay="{p.d}ms"></span>
						{/each}
						<span class="delta">{ch.d > 0 ? '+' : '−'}{Math.abs(ch.d).toLocaleString('en')}</span>
					</span>
				{/if}
			{/key}
			<span class="code">{k}</span>
		</span>
	{/each}
</button>

<style>
	.coins {
		display: grid;
		grid-template-columns: repeat(5, minmax(0, 1fr));
		width: 100%;
		padding: 10px 6px;
		color: var(--color-text);
		font-weight: 400;
		text-align: center;
	}

	.coin {
		position: relative;
		display: flex;
		flex-direction: column;
		align-items: center;
		min-width: 0;
	}

	.coin + .coin {
		border-left: 1px solid var(--color-border);
	}

	.pp {
		--coin: var(--color-coin-pp);
	}
	.gp {
		--coin: var(--color-coin-gp);
	}
	.ep {
		--coin: var(--color-coin-ep);
	}
	.sp {
		--coin: var(--color-coin-sp);
	}
	.cp {
		--coin: var(--color-coin-cp);
	}

	.amount {
		max-width: 100%;
		overflow: hidden;
		text-overflow: ellipsis;
		font-size: 20px;
		font-weight: 900;
		font-variant-numeric: tabular-nums;
		color: var(--color-effect-ink);
	}

	.code {
		font-size: 11px;
		font-weight: 800;
		letter-spacing: 0.08em;
		text-transform: uppercase;
		color: var(--color-text-muted);
	}

	.coin.empty .amount {
		color: var(--color-text-faint);
	}

	/* The count bumps as coins land or leave. */
	.gain .amount {
		animation: bump 0.5s ease-out 0.35s;
	}

	.spend .amount {
		animation: bump 0.45s ease-out;
	}

	.fx {
		position: absolute;
		inset: 0;
		pointer-events: none;
	}

	.disc {
		position: absolute;
		left: 50%;
		top: 4px;
		width: 14px;
		height: 14px;
		margin-left: calc(-7px + var(--x));
		border-radius: 50%;
		background: var(--coin);
		box-shadow:
			inset 0 -2px 0 var(--color-coin-rim),
			0 0 0 1px var(--color-coin-rim);
		opacity: 0;
		animation-fill-mode: both;
	}

	/* Gained: coins fall into the column, flipping, and settle on the count. */
	.gain .disc {
		animation-name: drop-in;
		animation-duration: 0.6s;
		animation-timing-function: cubic-bezier(0.5, 0, 0.75, 0.4);
	}

	/* Spent: coins flip up out of the column and away. */
	.spend .disc {
		animation-name: fly-out;
		animation-duration: 0.75s;
		animation-timing-function: ease-out;
	}

	.delta {
		position: absolute;
		left: 50%;
		top: -20px;
		font-family: var(--font-display);
		font-size: 16px;
		font-weight: 900;
		white-space: nowrap;
		text-shadow: 0 0 6px var(--color-surface);
		opacity: 0;
		animation: float 1.6s ease-out both;
	}

	.gain .delta {
		color: var(--color-heal);
	}

	/* After the coins have mostly gone, so they don't cross it. */
	.spend .delta {
		color: var(--color-hit);
		animation-delay: 0.2s;
	}

	@keyframes drop-in {
		0% {
			opacity: 0;
			transform: translateY(-34px) scaleX(1);
		}
		20% {
			opacity: 1;
			transform: translateY(-24px) scaleX(0.3);
		}
		45% {
			transform: translateY(-12px) scaleX(1);
		}
		70% {
			transform: translateY(-2px) scaleX(0.3);
		}
		85% {
			opacity: 1;
			transform: translateY(4px) scaleX(1);
		}
		100% {
			opacity: 0;
			transform: translateY(8px) scaleX(1) scaleY(0.6);
		}
	}

	@keyframes fly-out {
		0% {
			opacity: 0;
			transform: translate(0, 10px) scaleX(1);
		}
		15% {
			opacity: 1;
		}
		40% {
			transform: translate(calc(var(--x) * 1), -8px) scaleX(0.3);
		}
		70% {
			opacity: 1;
			transform: translate(calc(var(--x) * 2), -18px) scaleX(1);
		}
		100% {
			opacity: 0;
			transform: translate(calc(var(--x) * 2.6), -24px) scaleX(0.3);
		}
	}

	@keyframes float {
		0% {
			opacity: 0;
			transform: translate(-50%, 4px) scale(0.7);
		}
		18% {
			opacity: 1;
			transform: translate(-50%, -6px) scale(1.08);
		}
		70% {
			opacity: 1;
			transform: translate(-50%, -14px) scale(1);
		}
		100% {
			opacity: 0;
			transform: translate(-50%, -26px);
		}
	}

	@keyframes bump {
		0%,
		100% {
			transform: scale(1);
		}
		40% {
			transform: scale(1.18);
		}
	}

	@media (prefers-reduced-motion: reduce) {
		.disc,
		.gain .amount,
		.spend .amount {
			animation: none;
			opacity: 0;
		}

		.gain .amount,
		.spend .amount {
			opacity: 1;
		}

		.delta {
			animation: float-still 1.6s ease-out both;
			transform: translate(-50%, -10px);
		}

		@keyframes float-still {
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
