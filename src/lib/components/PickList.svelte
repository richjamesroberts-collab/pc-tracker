<script lang="ts" module>
	export interface PickItem {
		id: string;
		name: string;
		/** Short line under the name: prerequisite, school, level. */
		meta?: string;
		/** Plain paragraphs joined by `\n`, shown when the row is opened. */
		text?: string;
		/** Can't be picked (prerequisite not met, already known); `meta` says why. */
		disabled?: boolean;
	}
</script>

<script lang="ts">
	import type { Snippet } from 'svelte';

	let {
		items,
		selected = $bindable(),
		max,
		label,
		search = false,
		details
	}: {
		items: PickItem[];
		selected: string[];
		/** How many can be picked; 1 swaps the pick instead of refusing a second. */
		max: number;
		label: string;
		search?: boolean;
		/** Custom details for an opened row (spells use SpellDetails); `text` otherwise. */
		details?: Snippet<[PickItem]>;
	} = $props();

	let query = $state('');
	let open = $state<string | null>(null);

	const shown = $derived.by(() => {
		const q = query.trim().toLowerCase();
		// Picks stay listed while searching, so they can be taken back.
		return q ? items.filter((i) => selected.includes(i.id) || i.name.toLowerCase().includes(q)) : items;
	});

	function toggle(item: PickItem) {
		if (selected.includes(item.id)) selected = selected.filter((id) => id !== item.id);
		else if (max === 1) selected = [item.id];
		else if (selected.length < max) selected = [...selected, item.id];
	}
</script>

{#if search}
	<label class="search">
		<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="11" cy="11" r="7" /><path d="M20 20l-3.5-3.5" /></svg>
		<input type="search" placeholder="Search" aria-label="Search {label}" bind:value={query} autocomplete="off" />
	</label>
{/if}

<ul class="card list" aria-label={label}>
	{#each shown as item (item.id)}
		{@const on = selected.includes(item.id)}
		<li>
			<div class="row">
				<button
					type="button"
					class="pick"
					aria-pressed={on}
					disabled={!on && (item.disabled || (max > 1 && selected.length >= max))}
					onclick={() => toggle(item)}
				>
					<span class="box" aria-hidden="true">{on ? '✓' : ''}</span>
					<span class="body">
						<span class="name">{item.name}</span>
						{#if item.meta}<span class="meta">{item.meta}</span>{/if}
					</span>
				</button>
				{#if item.text || details}
					<button
						type="button"
						class="more"
						aria-expanded={open === item.id}
						aria-label="{open === item.id ? 'Hide' : 'Show'} {item.name} details"
						onclick={() => (open = open === item.id ? null : item.id)}
					>
						<svg viewBox="0 0 24 24" aria-hidden="true"><path d={open === item.id ? 'M6 15l6-6 6 6' : 'M6 9l6 6 6-6'} /></svg>
					</button>
				{/if}
			</div>
			{#if open === item.id}
				<div class="details">
					{#if details}
						{@render details(item)}
					{:else}
						{#each (item.text ?? '').split('\n').filter((p) => p.trim()) as para, i (i)}
							<p>{para}</p>
						{/each}
					{/if}
				</div>
			{/if}
		</li>
	{:else}
		<li class="none">Nothing matches.</li>
	{/each}
</ul>

<style>
	.search {
		display: flex;
		align-items: center;
		gap: 8px;
		height: 48px;
		margin-bottom: 8px;
		padding: 0 14px;
		border-radius: 14px;
		border: 1.5px solid var(--color-border-strong);
		background: var(--color-surface);
	}

	.search svg {
		width: 18px;
		height: 18px;
		flex-shrink: 0;
		fill: none;
		stroke: var(--color-text-muted);
		stroke-width: 2;
		stroke-linecap: round;
	}

	.search input {
		flex: 1;
		min-width: 0;
		border: 0;
		background: transparent;
		padding: 0;
		height: 100%;
	}

	.list {
		list-style: none;
		padding: 0;
		overflow: hidden;
	}

	li + li {
		border-top: 1px solid var(--color-border);
	}

	.row {
		display: flex;
		align-items: stretch;
	}

	.pick {
		flex: 1;
		display: flex;
		align-items: center;
		gap: 12px;
		min-width: 0;
		min-height: 56px;
		padding: 8px 4px 8px 14px;
		border: 0;
		border-radius: 0;
		background: transparent;
		color: var(--color-text);
		text-align: left;
	}

	.pick:disabled {
		opacity: 0.45;
	}

	.box {
		display: grid;
		place-items: center;
		flex-shrink: 0;
		width: 24px;
		height: 24px;
		border-radius: 7px;
		border: 2px solid var(--color-border-strong);
		font-size: 14px;
		font-weight: 900;
		color: var(--color-on-accent);
	}

	.pick[aria-pressed='true'] .box {
		background: var(--color-accent);
		border-color: var(--color-accent);
	}

	.body {
		display: flex;
		flex-direction: column;
		min-width: 0;
	}

	.name {
		font-size: 16px;
		font-weight: 700;
		overflow-wrap: anywhere;
	}

	.meta {
		font-size: 13px;
		color: var(--color-text-muted);
	}

	.more {
		flex-shrink: 0;
		width: 48px;
		border: 0;
		border-radius: 0;
		background: transparent;
	}

	.more svg {
		width: 20px;
		height: 20px;
		fill: none;
		stroke: var(--color-text-muted);
		stroke-width: 2;
		stroke-linecap: round;
		stroke-linejoin: round;
	}

	.details {
		padding: 0 14px 12px 50px;
		font-size: 14px;
		color: var(--color-text-muted);
	}

	.details p + p {
		margin-top: 6px;
	}

	.none {
		padding: 14px;
		color: var(--color-text-muted);
	}
</style>
