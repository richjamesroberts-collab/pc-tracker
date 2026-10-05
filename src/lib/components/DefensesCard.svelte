<script lang="ts">
	import { resolve } from '$app/paths';
	import Sheet from './Sheet.svelte';
	import { session } from '$lib/session.svelte';
	import { defenses, type Defense } from '$lib/rules/defenses';
	import type { Character } from '$lib/types';

	const c = $derived(session.character as Character);
	const d = $derived(defenses(c));
	const rows = $derived(
		[
			{ k: 'Resist', list: d.resistances },
			{ k: 'Immune', list: d.immunities }
		].filter((r) => r.list.length)
	);
	let open = $state(false);

	const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
	/** "Raging" for the chip, from "while raging". */
	const short = (when: string) => cap(when.replace(/^while /, ''));
	const describe = (x: Defense) => `${cap(x.name)}${x.when ? ` (${x.when})` : ''}`;
</script>

{#if rows.length || d.notes.length}
	<button type="button" class="card defenses" aria-label="Resistances and immunities. Tap for details." onclick={() => (open = true)}>
		<span class="head">
			<span class="label">Resistances &amp; immunities</span>
			<span class="more">Details ›</span>
		</span>
		{#each rows as r (r.k)}
			<span class="row">
				<b>{r.k}</b>
				<span class="chips">
					{#each r.list as x (x.name + (x.when ?? ''))}
						<span class="chip {r.k.toLowerCase()}">{cap(x.name)}{#if x.when}<small>{short(x.when)}</small>{/if}</span>
					{/each}
				</span>
			</span>
		{/each}
		{#if d.notes.length}
			<span class="row">
				<b>Choice</b>
				<span class="chips">
					{#each d.notes as n (n.source)}<span class="chip">{n.source}</span>{/each}
				</span>
			</span>
		{/if}
	</button>

	<Sheet {open} onclose={() => (open = false)} label="Resistances and immunities">
		<h2 class="title">Resistances &amp; immunities</h2>
		{#each [{ k: 'Resistances', list: d.resistances, hint: 'Take half damage of these types.' }, { k: 'Immunities', list: d.immunities, hint: 'No damage of these types, and these conditions can’t affect you.' }].filter((g) => g.list.length) as g (g.k)}
			<h3 class="label">{g.k}</h3>
			<p class="hint">{g.hint}</p>
			<ul>
				{#each g.list as x (x.name + (x.when ?? ''))}
					<li><b>{describe(x)}</b><span>{x.sources.join(' · ')}</span></li>
				{/each}
			</ul>
		{/each}
		{#if d.notes.length}
			<h3 class="label">Your choice</h3>
			<ul>
				{#each d.notes as n (n.source)}
					<li><b>{n.source}</b><span>{n.text}</span></li>
				{/each}
			</ul>
		{/if}
		<a class="edit-link" href={resolve('/c/[id]/edit', { id: c.id })}>Add your own in Edit</a>
	</Sheet>
{/if}

<style>
	.defenses {
		display: flex;
		flex-direction: column;
		gap: 8px;
		width: 100%;
		margin-top: 12px;
		padding: 12px 14px;
		color: var(--color-text);
		font-weight: 400;
		text-align: left;
	}

	.head {
		display: flex;
		justify-content: space-between;
		align-items: baseline;
		gap: 8px;
	}

	.more {
		font-size: 12px;
		font-weight: 800;
		color: var(--color-accent);
	}

	.row {
		display: grid;
		grid-template-columns: 56px minmax(0, 1fr);
		align-items: start;
		gap: 8px;
	}

	.row b {
		padding-top: 4px;
		font-size: 13px;
		font-weight: 800;
		color: var(--color-text-muted);
	}

	.chips {
		display: flex;
		flex-wrap: wrap;
		gap: 6px;
	}

	.chip {
		display: inline-flex;
		align-items: baseline;
		gap: 6px;
		padding: 3px 10px;
		border-radius: 10px;
		background: var(--color-chip);
		font-size: 14px;
		font-weight: 700;
	}

	.chip.resist {
		background: var(--color-effect-bg);
		color: var(--color-effect-ink);
	}

	.chip.immune {
		background: var(--color-current-bg);
		color: var(--color-accent);
	}

	.chip small {
		font-size: 11px;
		font-weight: 700;
		opacity: 0.8;
	}

	.title {
		font-size: 22px;
	}

	h3 {
		margin-top: 16px;
	}

	.hint {
		margin-top: 2px;
		font-size: 13px;
		color: var(--color-text-muted);
	}

	ul {
		list-style: none;
		margin-top: 4px;
	}

	li {
		display: flex;
		flex-direction: column;
		padding: 10px 0;
	}

	li + li {
		border-top: 1px solid var(--color-border);
	}

	.edit-link {
		display: block;
		margin-top: 12px;
		padding: 12px 0;
		text-align: center;
		color: var(--color-accent);
		font-weight: 800;
	}

	li span {
		font-size: 13px;
		color: var(--color-text-muted);
	}
</style>
