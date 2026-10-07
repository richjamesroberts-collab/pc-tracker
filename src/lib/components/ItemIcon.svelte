<script lang="ts">
	/** A drawstring pouch with a glint of magic: things to pull out and use. */
	let { size = 40 }: { size?: number } = $props();
</script>

<svg class="item" viewBox="0 0 32 32" width={size} height={size} aria-hidden="true">
	<path class="ruffle" d="M10.6 11.2 8.6 6.4c1.6.9 2.6.5 3.5-.4.9 1 2.1 1 3 0 .9 1 2.1 1 3 0 .8.9 1.7 1.2 3 .5l-1.6 4.7z" />
	<path class="bag" d="M11 11.2h10c4.4 3 7 7.4 7 11.3 0 4-3 6.5-7.4 6.5h-9.2C7 29 4 26.5 4 22.5c0-3.9 2.6-8.3 7-11.3z" />
	<path class="cord" d="M10.4 11.2h11.2" />
	<path class="tail" d="M16 11.4c-.6 2-1.8 3.2-3.4 3.8M16 11.4c.9 1.7 2.2 2.6 3.9 2.9" />
	<circle class="knot" cx="16" cy="11.2" r="1.5" />
	<path class="shine" d="M8.4 21.2a6.6 6.6 0 0 1 2.4-4.4" />
	<path class="glint" d="M25.6 1.6l.9 2.6 2.6.9-2.6.9-.9 2.6-.9-2.6-2.6-.9 2.6-.9z" />
	<path class="glint small" d="M5.2 3.6l.5 1.4 1.4.5-1.4.5-.5 1.4-.5-1.4-1.4-.5 1.4-.5z" />
</svg>

<style>
	.item {
		flex-shrink: 0;
		display: block;
	}

	.bag,
	.ruffle {
		fill: var(--color-effect-bg);
		stroke: var(--color-text);
		stroke-width: 1.6;
		stroke-linejoin: round;
	}

	.cord,
	.tail {
		fill: none;
		stroke: var(--color-effect-ink);
		stroke-width: 1.8;
		stroke-linecap: round;
	}

	.knot {
		fill: var(--color-effect-ink);
	}

	.shine {
		fill: none;
		stroke: var(--color-surface-raised);
		stroke-width: 1.6;
		stroke-linecap: round;
		opacity: 0.9;
	}

	.glint {
		fill: var(--color-warning);
	}

	.glint.small {
		opacity: 0.8;
	}
</style>
