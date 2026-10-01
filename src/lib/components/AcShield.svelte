<script lang="ts">
	let { ac }: { ac: number } = $props();
</script>

<div class="shield" role="img" aria-label="Armour class {ac}">
	<svg viewBox="0 0 24 26" aria-hidden="true">
		<path d="M12 1.5l9 3.3v7c0 5.6-3.9 10.2-9 12.4-5.1-2.2-9-6.8-9-12.4v-7z" />
	</svg>
	<div class="text" aria-hidden="true">
		<span class="k">AC</span>
		<span class="v">{ac}</span>
	</div>
</div>

<style>
	.shield {
		position: relative;
		width: 54px;
		height: 60px;
		flex-shrink: 0;
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
		font-size: 9px;
		font-weight: 800;
		letter-spacing: 0.06em;
		color: var(--color-accent);
	}

	.v {
		font-family: var(--font-display);
		font-weight: 900;
		font-size: 22px;
		line-height: 1;
		color: var(--color-conc-ink);
	}
</style>
