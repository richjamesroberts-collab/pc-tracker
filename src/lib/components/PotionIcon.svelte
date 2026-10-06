<script lang="ts">
	/** A round flask of red with a cross for healing potions; a tall stoppered vial with bubbles for the rest. */
	let { kind, size = 40 }: { kind: 'healing' | 'other'; size?: number } = $props();
</script>

<svg class="potion {kind}" viewBox="0 0 32 32" width={size} height={size} aria-hidden="true">
	{#if kind === 'healing'}
		<rect class="cork" x="12.5" y="2" width="7" height="4" rx="1.2" />
		<path class="glass" d="M13 6h6v5.2a10 10 0 1 1-6 0z" />
		<path class="liquid" d="M7.53 18H24.47A8.9 8.9 0 1 1 7.53 18z" />
		<path class="mark" d="M16 20v6.2M12.9 23.1h6.2" />
		<path class="shine" d="M9.9 16.8a7 7 0 0 1 2.9-3.2" />
	{:else}
		<rect class="cork" x="12.5" y="1.5" width="7" height="4" rx="1.2" />
		<path class="glass" d="M13.2 5.5h5.6v4.2l3.6 4.6a3 3 0 0 1 .6 1.8V27a3 3 0 0 1-3 3h-8a3 3 0 0 1-3-3V16.1a3 3 0 0 1 .6-1.8l3.6-4.6z" />
		<path class="liquid" d="M10.2 18h11.6v9a1.8 1.8 0 0 1-1.8 1.8h-8a1.8 1.8 0 0 1-1.8-1.8z" />
		<circle class="bubble" cx="14" cy="23.5" r="1.4" />
		<circle class="bubble" cx="18" cy="21" r="1" />
		<circle class="bubble" cx="17" cy="26" r="0.8" />
		<path class="shine" d="M11.8 16.6v4" />
	{/if}
</svg>

<style>
	.potion {
		flex-shrink: 0;
		display: block;
	}

	.cork {
		fill: var(--color-effect-ink);
		opacity: 0.7;
	}

	.glass {
		fill: var(--color-surface-raised);
		stroke: var(--color-text);
		stroke-width: 1.6;
		stroke-linejoin: round;
	}

	.healing .liquid {
		fill: var(--color-hit);
	}

	.other .liquid {
		fill: var(--color-spell-ink);
		opacity: 0.85;
	}

	.mark {
		fill: none;
		stroke: var(--color-on-solid);
		stroke-width: 2.2;
		stroke-linecap: round;
	}

	.bubble {
		fill: var(--color-surface-raised);
		opacity: 0.9;
	}

	.shine {
		fill: none;
		stroke: var(--color-text-faint);
		stroke-width: 1.4;
		stroke-linecap: round;
	}
</style>
