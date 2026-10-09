<script lang="ts">
	import { untrack } from 'svelte';

	/**
	 * A row of resource pips. Filled = available, hollow = spent.
	 * Tapping a filled pip spends one; tapping a hollow pip gets one back.
	 * With `fx`, a pip that's spent drains away with a ring, and one that comes back pops in.
	 */
	let {
		label,
		max,
		left,
		shape = 'circle',
		size = 24,
		fx = false,
		onspend,
		onrestore
	}: {
		label: string;
		max: number;
		left: number;
		shape?: 'circle' | 'diamond';
		size?: number;
		fx?: boolean;
		onspend?: () => void;
		onrestore?: () => void;
	} = $props();

	const interactive = $derived(!!onspend || !!onrestore);

	/** The last change each pip had, by index; `n` restarts the animation when the same pip changes again. */
	let changed = $state<Record<number, { dir: 'out' | 'in'; n: number }>>({});
	let prev = untrack(() => left);
	let seq = 0;
	$effect(() => {
		const now = left;
		untrack(() => {
			if (fx && now !== prev) {
				const next = { ...changed };
				const [from, to, dir] = now < prev ? [now, prev, 'out' as const] : [prev, now, 'in' as const];
				for (let i = from; i < Math.min(to, max); i++) next[i] = { dir, n: ++seq };
				changed = next;
			}
			prev = now;
		});
	});
</script>

<div class="pips" role="group" aria-label="{label}: {left} of {max} left">
	{#each { length: max }, i}
		{@const filled = i < left}
		{#if interactive}
			<button
				type="button"
				class="hit"
				aria-label={filled ? `Use ${label}` : `Restore ${label}`}
				onclick={() => (filled ? onspend?.() : onrestore?.())}
			>
				{#key changed[i]?.n}
					<span class="pip {shape} {changed[i]?.dir ?? ''}" class:filled style:--size="{size}px"></span>
				{/key}
			</button>
		{:else}
			{#key changed[i]?.n}
				<span class="pip {shape} {changed[i]?.dir ?? ''}" class:filled style:--size="{size}px" aria-hidden="true"></span>
			{/key}
		{/if}
	{/each}
</div>

<style>
	.pips {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 2px;
	}

	.hit {
		display: flex;
		align-items: center;
		justify-content: center;
		min-width: 40px;
		min-height: 40px;
		padding: 0;
		border: 0;
		background: transparent;
		border-radius: 50%;
	}

	.pip {
		--fill: var(--color-spell-ink);
		position: relative;
		display: block;
		width: var(--size);
		height: var(--size);
		box-sizing: border-box;
		border: 2px solid var(--color-text-faint);
		border-radius: 50%;
		transition: background 0.12s, transform 0.12s;
	}

	.pip.filled {
		background: var(--color-spell-ink);
		border-color: var(--color-spell-ink);
	}

	.pip.diamond {
		border-radius: 3px;
		transform: rotate(45deg) scale(0.72);
		--fill: var(--color-warning);
	}

	.pip.diamond.filled {
		background: var(--color-warning);
		border-color: var(--color-warning);
	}

	/* Spent: the fill swells, then drains to nothing as a ring goes out. `scale` keeps a diamond's turn. */
	.pip.out::before,
	.pip.out::after {
		content: '';
		position: absolute;
		inset: -2px;
		border-radius: inherit;
		pointer-events: none;
	}

	.pip.out::before {
		background: var(--fill);
		animation: pip-drain 0.85s ease-in both;
	}

	.pip.out::after {
		border: 2px solid var(--fill);
		opacity: 0;
		animation: pip-ring 0.85s ease-out 0.15s;
	}

	/* Back: pops in. */
	.pip.in {
		animation: pip-fill 0.45s cubic-bezier(0.3, 1.6, 0.5, 1);
	}

	@keyframes pip-drain {
		0% {
			scale: 1;
			opacity: 1;
		}
		25% {
			scale: 1.35;
			opacity: 1;
			filter: brightness(1.5);
		}
		100% {
			scale: 0;
			opacity: 0;
		}
	}

	@keyframes pip-ring {
		0% {
			scale: 1;
			opacity: 0.9;
		}
		100% {
			scale: 2.6;
			opacity: 0;
		}
	}

	@keyframes pip-fill {
		0% {
			scale: 0.3;
		}
		100% {
			scale: 1;
		}
	}

	@media (prefers-reduced-motion: reduce) {
		.pip.out::before {
			animation: pip-fade 0.6s ease-out both;
		}

		.pip.out::after,
		.pip.in {
			animation: none;
		}

		@keyframes pip-fade {
			from {
				opacity: 1;
			}
			to {
				opacity: 0;
			}
		}
	}

	.hit:active .pip {
		transform: scale(0.85);
	}

	.hit:active .pip.diamond {
		transform: rotate(45deg) scale(0.6);
	}
</style>
