<script lang="ts">
	import { ordinal } from '$lib/rules/spellcasting';
	import type { Spell } from '$lib/types';

	let { spell, compact = false }: { spell: Spell; compact?: boolean } = $props();

	const kind = $derived(
		spell.level === 0 ? `${spell.school} cantrip` : `${ordinal(spell.level)}-level ${spell.school.toLowerCase()}`.trim()
	);
</script>

{#if !compact}
	<div class="title">
		<h2>{spell.name}</h2>
		<div class="tags">
			{#if spell.concentration}<span class="tag conc">Concentration</span>{/if}
			{#if spell.ritual}<span class="tag">Ritual</span>{/if}
		</div>
	</div>
	<p class="kind">{kind}{spell.source !== 'PHB' && spell.source !== 'SRD' ? ` · ${spell.source}` : ''}</p>
{/if}

<dl class="facts">
	<div><dt>Casting</dt><dd>{spell.time || '—'}</dd></div>
	<div><dt>Range</dt><dd>{spell.range || '—'}</dd></div>
	<div><dt>Duration</dt><dd>{spell.duration || '—'}</dd></div>
	<div><dt>Components</dt><dd>{spell.components || '—'}</dd></div>
</dl>

<p class="text">{spell.text}</p>
{#if spell.higher}
	<p class="text higher"><strong>At higher levels.</strong> {spell.higher}</p>
{/if}

<style>
	.title {
		display: flex;
		align-items: baseline;
		justify-content: space-between;
		gap: 8px;
	}

	h2 {
		font-size: 24px;
		font-weight: 900;
	}

	.tags {
		display: flex;
		gap: 4px;
		flex-shrink: 0;
	}

	.tag {
		font-size: 12px;
		font-weight: 800;
		padding: 2px 8px;
		border-radius: 999px;
		background: var(--color-chip);
		color: var(--color-text-muted);
	}

	.tag.conc {
		background: var(--color-conc-bg);
		color: var(--color-conc-ink);
	}

	.kind {
		font-size: 14px;
		color: var(--color-text-muted);
	}

	.facts {
		display: grid;
		grid-template-columns: repeat(2, minmax(0, 1fr));
		gap: 6px;
		margin-top: 12px;
	}

	.facts div {
		padding: 8px 10px;
		border-radius: 12px;
		background: var(--color-surface-raised);
		min-width: 0;
	}

	dt {
		font-size: 11px;
		font-weight: 800;
		color: var(--color-text-muted);
	}

	dd {
		font-size: 14px;
		font-weight: 700;
		overflow-wrap: anywhere;
	}

	.text {
		margin-top: 12px;
		font-size: 15px;
		line-height: 1.5;
		white-space: pre-line;
	}

	.higher {
		margin-top: 8px;
	}
</style>
