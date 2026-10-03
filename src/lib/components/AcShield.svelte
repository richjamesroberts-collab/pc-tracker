<script lang="ts">
	/** With `onclick`, the shield is a button (tap to change AC). `size` is the width in pixels. */
	let { ac, onclick, size = 54 }: { ac: number; onclick?: () => void; size?: number } = $props();
</script>

{#snippet face()}
	<svg viewBox="0 0 24 26" aria-hidden="true">
		<path d="M12 1.5l9 3.3v7c0 5.6-3.9 10.2-9 12.4-5.1-2.2-9-6.8-9-12.4v-7z" />
	</svg>
	<span class="text" aria-hidden="true">
		<span class="k">AC</span>
		<span class="v">{ac}</span>
	</span>
{/snippet}

{#if onclick}
	<button type="button" class="shield" style:--s={size / 54} aria-label="Armour class {ac}. Tap to change." {onclick}>{@render face()}</button>
{:else}
	<div class="shield" style:--s={size / 54} role="img" aria-label="Armour class {ac}">{@render face()}</div>
{/if}

<style>
	.shield {
		position: relative;
		display: block;
		width: calc(54px * var(--s, 1));
		height: calc(60px * var(--s, 1));
		flex-shrink: 0;
	}

	button.shield {
		padding: 0;
		border: 0;
		border-radius: 0;
		background: transparent;
	}

	button.shield:active {
		transform: scale(0.94);
	}

	svg {
		position: absolute;
		inset: 0;
		width: 100%;
		height: 100%;
	}

	path {
		fill: var(--color-current-bg);
		stroke: var(--color-accent);
		stroke-width: 1.6;
	}

	.text {
		position: absolute;
		inset: 0;
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		padding-bottom: 4px;
	}

	.k {
		font-size: calc(9px * var(--s, 1));
		font-weight: 800;
		letter-spacing: 0.06em;
		color: var(--color-accent);
	}

	.v {
		font-family: var(--font-display);
		font-weight: 900;
		font-size: calc(22px * var(--s, 1));
		line-height: 1;
		color: var(--color-conc-ink);
	}
</style>
