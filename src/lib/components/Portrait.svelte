<script lang="ts">
	import { initials } from '$lib/character';

	let { name, image, size = 60, muted = false }: { name: string; image?: string; size?: number; muted?: boolean } = $props();
</script>

<div class="portrait" class:muted style:width="{size}px" style:height="{size}px" style:font-size="{Math.round(size * 0.37)}px">
	{#if image}
		<img src={image} alt="" />
	{:else}
		<span aria-hidden="true">{initials(name)}</span>
	{/if}
</div>

<style>
	.portrait {
		flex-shrink: 0;
		border-radius: 50%;
		overflow: hidden;
		display: flex;
		align-items: center;
		justify-content: center;
		background: var(--color-spell-bg);
		border: 2px solid var(--color-spell-edge);
		color: var(--color-spell-ink);
		font-family: var(--font-display);
		font-weight: 900;
	}

	.muted {
		filter: grayscale(1);
		opacity: 0.7;
	}

	img {
		width: 100%;
		height: 100%;
		object-fit: cover;
	}
</style>
