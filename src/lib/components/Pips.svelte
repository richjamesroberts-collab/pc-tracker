<script lang="ts">
	/**
	 * A row of resource pips. Filled = available, hollow = spent.
	 * Tapping a filled pip spends one; tapping a hollow pip gets one back.
	 */
	let {
		label,
		max,
		left,
		shape = 'circle',
		size = 24,
		onspend,
		onrestore
	}: {
		label: string;
		max: number;
		left: number;
		shape?: 'circle' | 'diamond';
		size?: number;
		onspend?: () => void;
		onrestore?: () => void;
	} = $props();

	const interactive = $derived(!!onspend || !!onrestore);
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
				<span class="pip {shape}" class:filled style:--size="{size}px"></span>
			</button>
		{:else}
			<span class="pip {shape}" class:filled style:--size="{size}px" aria-hidden="true"></span>
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
	}

	.pip.diamond.filled {
		background: var(--color-warning);
		border-color: var(--color-warning);
	}

	.hit:active .pip {
		transform: scale(0.85);
	}

	.hit:active .pip.diamond {
		transform: rotate(45deg) scale(0.6);
	}
</style>
