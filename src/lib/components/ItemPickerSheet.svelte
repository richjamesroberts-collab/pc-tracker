<script lang="ts" module>
	export interface PickerEntry {
		id: string;
		name: string;
		/** Second line: type, rarity, price… */
		meta: string;
		/** Key of the filter chip it belongs to. */
		group: string;
		/** Present when it needs attunement ('' for anyone). */
		attunement?: string;
		stats?: string;
		text: string;
	}
</script>

<script lang="ts">
	import Sheet from './Sheet.svelte';
	import ItemText from './ItemText.svelte';

	let {
		open,
		title,
		noun,
		entries,
		filters,
		failed = false,
		onretry,
		onpick,
		oncustom,
		onclose
	}: {
		open: boolean;
		title: string;
		/** "magic items", "gear": used in the search box and messages. */
		noun: string;
		/** Null while loading. */
		entries: PickerEntry[] | null;
		filters: { key: string; label: string }[];
		failed?: boolean;
		onretry: () => void;
		onpick: (id: string) => void;
		oncustom: () => void;
		onclose: () => void;
	} = $props();

	let query = $state('');
	let filter = $state<string | null>(null);
	let expanded = $state<string | null>(null);

	// Start fresh each time it opens.
	$effect(() => {
		if (!open) return;
		query = '';
		filter = null;
		expanded = null;
	});

	const results = $derived.by(() => {
		const q = query.trim().toLowerCase();
		return (entries ?? []).filter((i) => (filter === null || i.group === filter) && (!q || i.name.toLowerCase().includes(q)));
	});
</script>

<Sheet {open} {onclose} label={title}>
	<!-- Fixed height so the sheet doesn't jump as the results shrink while typing. -->
	<div class="body">
		<div class="head">
			<h2>{title}</h2>
			<button type="button" class="custom" onclick={oncustom}>+ Custom</button>
		</div>

		<label class="search">
			<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="11" cy="11" r="7" /><path d="M20 20l-3.5-3.5" /></svg>
			<input type="search" placeholder="Search {noun}" aria-label="Search {noun}" bind:value={query} autocomplete="off" />
		</label>

		<div class="filters" role="radiogroup" aria-label="Filter">
			<button type="button" role="radio" aria-checked={filter === null} onclick={() => (filter = null)}>All</button>
			{#each filters as f (f.key)}
				<button type="button" role="radio" aria-checked={filter === f.key} onclick={() => (filter = f.key)}>{f.label}</button>
			{/each}
		</div>

		{#if failed}
			<div class="status" role="alert">
				<p>Couldn't load {noun}</p>
				<button type="button" onclick={onretry}>Retry</button>
			</div>
		{:else if !entries}
			<p class="status">Loading {noun}…</p>
		{:else if results.length === 0}
			<p class="status">Nothing matches. Add it as a custom item instead.</p>
		{:else}
			<ul class="list">
				{#each results as i (i.id)}
					<li>
						<div class="row">
							<button type="button" class="info" aria-expanded={expanded === i.id} onclick={() => (expanded = expanded === i.id ? null : i.id)}>
								<span class="name">{i.name}</span>
								<span class="meta">{i.meta}</span>
							</button>
							<button type="button" class="add" aria-label="Add {i.name}" onclick={() => onpick(i.id)}>+ Add</button>
						</div>
						{#if expanded === i.id}
							<div class="details">
								<ItemText item={i} />
							</div>
						{/if}
					</li>
				{/each}
			</ul>
		{/if}
	</div>
</Sheet>

<style>
	.body {
		min-height: 80dvh;
	}

	.head {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 8px;
	}

	h2 {
		font-size: 22px;
	}

	.custom {
		flex-shrink: 0;
		min-height: 38px;
		background: var(--color-surface);
		border: 1px dashed var(--color-border-strong);
		color: var(--color-text);
		font-size: 13px;
		font-weight: 700;
	}

	.search {
		display: flex;
		align-items: center;
		gap: 8px;
		height: 48px;
		margin-top: 12px;
		padding: 0 14px;
		border-radius: 14px;
		border: 1.5px solid var(--color-border-strong);
		background: var(--color-surface);
	}

	.search svg {
		width: 18px;
		height: 18px;
		fill: none;
		stroke: var(--color-text-muted);
		stroke-width: 2.2;
		stroke-linecap: round;
		flex-shrink: 0;
	}

	.search input {
		flex: 1;
		min-width: 0;
		border: 0;
		background: transparent;
		padding: 0;
		box-shadow: none;
	}

	.filters {
		display: flex;
		gap: 6px;
		margin: 10px -16px 0;
		padding-inline: 16px;
		overflow-x: auto;
		scrollbar-width: none;
	}

	.filters button {
		flex-shrink: 0;
		min-height: 36px;
		border-radius: 10px;
		background: var(--color-surface-raised);
		border: 1px solid var(--color-border);
		color: var(--color-text);
		font-size: 13px;
		font-weight: 700;
	}

	.filters button[aria-checked='true'] {
		background: var(--color-effect-ink);
		border-color: var(--color-effect-ink);
		color: var(--color-bg);
	}

	.status {
		margin-top: 24px;
		text-align: center;
		color: var(--color-text-muted);
	}

	.status button {
		margin-top: 10px;
		min-height: 40px;
		background: var(--color-surface);
		border: 1.5px solid var(--color-border-strong);
		color: var(--color-text);
		font-weight: 800;
	}

	.list {
		list-style: none;
		margin-top: 12px;
		border: 1px solid var(--color-border);
		border-radius: 16px;
		overflow: hidden;
	}

	.list li + li {
		border-top: 1px solid var(--color-border);
	}

	.row {
		display: flex;
		align-items: center;
		gap: 8px;
		padding-right: 10px;
	}

	.info {
		flex: 1;
		min-width: 0;
		display: flex;
		flex-direction: column;
		align-items: flex-start;
		justify-content: center;
		min-height: 58px;
		padding: 8px 12px;
		border: 0;
		border-radius: 0;
		background: transparent;
		color: var(--color-text);
		text-align: left;
		font-weight: 400;
	}

	.name {
		font-size: 16px;
		font-weight: 700;
		overflow-wrap: anywhere;
	}

	.meta {
		font-size: 12px;
		color: var(--color-text-muted);
	}

	.add {
		flex-shrink: 0;
		min-width: 76px;
		height: 40px;
		border: 1.5px solid var(--color-effect-ink);
		background: var(--color-surface);
		color: var(--color-effect-ink);
		font-weight: 800;
	}

	.details {
		padding: 0 12px 14px;
	}
</style>
