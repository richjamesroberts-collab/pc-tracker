<script lang="ts">
	import type { StatSource } from '$lib/rules/stats';

	/** A worked-out number as a table: each part with where it comes from, then the total. */
	let { caption, parts, total }: { caption?: string; parts: StatSource[]; total: string } = $props();
</script>

<table class="calc">
	{#if caption}<caption>{caption}</caption>{/if}
	<tbody>
		{#each parts as p, n (n)}
			<tr>
				<th scope="row">{p.label}{#if p.from}<span class="from">{p.from}</span>{/if}</th>
				<td>{p.value}</td>
			</tr>
		{/each}
	</tbody>
	<tfoot>
		<tr><th scope="row">Total</th><td>{total}</td></tr>
	</tfoot>
</table>

<style>
	.calc {
		width: 100%;
		margin-top: 8px;
		border-collapse: collapse;
		border-radius: 14px;
		overflow: hidden;
		background: var(--color-surface-raised);
		font-size: 14px;
	}

	caption {
		caption-side: top;
		padding: 0 2px 4px;
		text-align: left;
		font-weight: 800;
	}

	th,
	td {
		padding: 8px 12px;
		vertical-align: top;
		text-align: left;
		font-weight: 700;
	}

	td {
		text-align: right;
		white-space: nowrap;
		font-variant-numeric: tabular-nums;
	}

	tbody tr + tr {
		border-top: 1px solid var(--color-border);
	}

	.from {
		display: block;
		margin-top: 1px;
		font-size: 12px;
		font-weight: 500;
		color: var(--color-text-muted);
	}

	tfoot tr {
		border-top: 1.5px solid var(--color-border-strong);
	}

	tfoot th,
	tfoot td {
		font-weight: 900;
	}
</style>
