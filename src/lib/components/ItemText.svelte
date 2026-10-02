<script lang="ts">
	import type { MagicItem } from '$lib/data/content';

	let { item }: { item: Pick<MagicItem, 'attunement' | 'text'> } = $props();

	const paragraphs = $derived(item.text.split('\n').filter((p) => p.trim()));
</script>

{#if item.attunement !== undefined}
	<p class="attune">Requires attunement{item.attunement ? ` ${item.attunement}` : ''}</p>
{/if}
{#each paragraphs as para, i (i)}
	<p>{para}</p>
{/each}

<style>
	p {
		font-size: 15px;
		line-height: 1.5;
		overflow-wrap: anywhere;
	}

	p + p {
		margin-top: 8px;
	}

	.attune {
		font-size: 13px;
		font-weight: 700;
		font-style: italic;
		color: var(--color-text-muted);
	}
</style>
