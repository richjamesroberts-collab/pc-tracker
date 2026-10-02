<script lang="ts">
	import { resolve } from '$app/paths';
	import SpellDetails from '$lib/components/SpellDetails.svelte';
	import CustomSpellSheet from '$lib/components/CustomSpellSheet.svelte';
	import { session } from '$lib/session.svelte';
	import { cacheSpell, library, spellListClass, spellPool, uncacheSpell } from '$lib/library.svelte';
	import { CLASSES } from '$lib/data/classes';
	import { cantripsKnown, ordinal, prepStyle, spellLimit } from '$lib/rules/spellcasting';
	import type { Character, Spell } from '$lib/types';

	type Filter = 'class' | 'all' | 'mine';

	const c = $derived(session.character as Character);
	const listClass = $derived(spellListClass(c));
	const listName = $derived(CLASSES.find((x) => x.key === listClass)?.name ?? listClass);
	const style = $derived(prepStyle(c));

	let query = $state('');
	let filter = $state<Filter>('class');
	let level = $state<number | null>(null);
	let source = $state<string | null>(null);
	let expanded = $state<string | null>(null);
	let customOpen = $state(false);

	const mine = $derived(new Set(c.spells.map((s) => s.id)));
	const pool = $derived(spellPool(c));
	/** Source chips, only worth showing once there's more than the bundled spells. */
	const sources = $derived([...new Set(pool.map((s) => s.pack ?? 'builtin'))]);
	const myCantrips = $derived(pool.filter((s) => s.level === 0 && mine.has(s.id)).length);
	const myLevelled = $derived(pool.filter((s) => s.level > 0 && mine.has(s.id)).length);
	const cantripLimit = $derived(cantripsKnown(c));
	const knownLimit = $derived(style === 'known' ? spellLimit(c) : null);

	const results = $derived.by(() => {
		const q = query.trim().toLowerCase();
		return pool.filter(
			(s) =>
				(filter === 'all' ||
					(filter === 'mine' && mine.has(s.id)) ||
					(filter === 'class' && (s.classes.includes(listClass) || s.pack === 'custom'))) &&
				(level === null || s.level === level) &&
				(source === null || s.pack === source) &&
				(!q || s.name.toLowerCase().includes(q))
		);
	});

	const groups = $derived.by(() => {
		const map = new Map<number, Spell[]>();
		for (const s of results) map.set(s.level, [...(map.get(s.level) ?? []), s]);
		return [...map.entries()].sort((a, b) => a[0] - b[0]);
	});

	function toggle(s: Spell) {
		if (mine.has(s.id)) {
			session.mutate(`Removed ${s.name}`, (ch) => {
				ch.spells = ch.spells.filter((x) => x.id !== s.id);
				uncacheSpell(ch, s.id);
				if (ch.concentration === s.name) ch.concentration = undefined;
			});
		} else {
			session.mutate(`Added ${s.name}`, (ch) => {
				ch.spells.push({ id: s.id, prepared: true });
				cacheSpell(ch, s);
			});
		}
	}

	function deleteCustom(s: Spell) {
		session.mutate(`Deleted ${s.name}`, (ch) => {
			ch.customSpells = ch.customSpells.filter((x) => x.id !== s.id);
			ch.spells = ch.spells.filter((x) => x.id !== s.id);
		});
	}

	const LEVELS: (number | null)[] = [null, 0, 1, 2, 3, 4, 5, 6, 7, 8, 9];
</script>

<div class="top">
	<h1>Spellbook</h1>
	<p class="counts">
		{#if cantripLimit}Cantrips <b>{myCantrips}/{cantripLimit}</b> · {/if}
		{#if knownLimit !== null}Known <b>{myLevelled}/{knownLimit}</b>{:else}{style === 'spellbook' ? 'In book' : 'On list'} <b>{myLevelled}</b>{/if}
	</p>
</div>

<label class="search">
	<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="11" cy="11" r="7" /><path d="M20 20l-3.5-3.5" /></svg>
	<input type="search" placeholder="Search spells" aria-label="Search spells" bind:value={query} autocomplete="off" />
</label>

<div class="filters" role="radiogroup" aria-label="Which spells">
	<button type="button" role="radio" aria-checked={filter === 'class'} onclick={() => (filter = 'class')}>{listName} list</button>
	<button type="button" role="radio" aria-checked={filter === 'all'} onclick={() => (filter = 'all')}>All</button>
	<button type="button" role="radio" aria-checked={filter === 'mine'} onclick={() => (filter = 'mine')}>My spells</button>
	<button type="button" class="custom" onclick={() => (customOpen = true)}>+ Custom</button>
</div>

{#if sources.length > 1}
	<div class="sources" role="radiogroup" aria-label="Source">
		<button type="button" role="radio" aria-checked={source === null} onclick={() => (source = null)}>All sources</button>
		{#each sources as id (id)}
			<button type="button" role="radio" aria-checked={source === id} onclick={() => (source = id)}>{library.packName(id)}</button>
		{/each}
	</div>
{/if}

<div class="levels" role="radiogroup" aria-label="Spell level">
	{#each LEVELS as l (l)}
		<button type="button" role="radio" aria-checked={level === l} onclick={() => (level = l)}>
			{l === null ? 'All' : l === 0 ? 'Cantrip' : l}
		</button>
	{/each}
</div>

{#if groups.length === 0}
	<p class="none">No spells match.</p>
{/if}

{#if library.loaded && library.packs.length === 0 && !query}
	<p class="srd-note">
		Showing the built-in spells. Have a spell pack from your DM? <a href={resolve('/packs')}>Import it</a> to add more.
	</p>
{/if}

{#each groups as [lvl, spells] (lvl)}
	<h2 class="label group">{lvl === 0 ? 'Cantrips' : `${ordinal(lvl)} level`} · {spells.length}</h2>
	<ul class="card list">
		{#each spells as s (s.id)}
			{@const added = mine.has(s.id)}
			<li>
				<div class="row">
					<button type="button" class="info" aria-expanded={expanded === s.id} onclick={() => (expanded = expanded === s.id ? null : s.id)}>
						<span class="name">{s.name}</span>
						<span class="meta">
							{s.school || 'Custom'} · {s.time}{s.concentration ? ' · Conc' : ''}{s.ritual ? ' · Ritual' : ''}{s.source !== 'PHB' && s.source !== 'SRD' ? ` · ${s.source}` : ''}
						</span>
					</button>
					<button type="button" class="add" class:added aria-label="{added ? 'Remove' : 'Add'} {s.name}" onclick={() => toggle(s)}>
						{added ? '✓ Added' : '+ Add'}
					</button>
				</div>
				{#if expanded === s.id}
					<div class="details">
						<SpellDetails spell={s} compact />
						{#if s.pack === 'custom'}
							<button type="button" class="delete" onclick={() => deleteCustom(s)}>Delete custom spell</button>
						{/if}
					</div>
				{/if}
			</li>
		{/each}
	</ul>
{/each}

<CustomSpellSheet open={customOpen} onclose={() => (customOpen = false)} />

<style>
	.top {
		display: flex;
		align-items: baseline;
		justify-content: space-between;
		gap: 8px;
		flex-wrap: wrap;
	}

	h1 {
		font-size: 26px;
		font-weight: 900;
	}

	.counts {
		font-size: 13px;
		font-weight: 600;
		color: var(--color-text-muted);
	}

	.counts b {
		color: var(--color-spell-ink);
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

	.filters,
	.sources,
	.levels {
		display: flex;
		gap: 6px;
		margin-top: 10px;
		overflow-x: auto;
		scrollbar-width: none;
		margin-inline: -16px;
		padding-inline: 16px;
	}

	.filters button,
	.sources button,
	.levels button {
		flex-shrink: 0;
		min-height: 38px;
		background: var(--color-surface);
		border: 1px solid var(--color-border-strong);
		color: var(--color-text);
		font-size: 13px;
		font-weight: 700;
	}

	.filters button[aria-checked='true'] {
		background: var(--color-text);
		border-color: var(--color-text);
		color: var(--color-bg);
	}

	.sources button {
		min-height: 34px;
		font-size: 12px;
	}

	.sources button[aria-checked='true'] {
		background: var(--color-spell-bg);
		border-color: var(--color-spell-edge);
		color: var(--color-spell-ink);
	}

	.filters .custom {
		border-style: dashed;
	}

	.levels button {
		min-width: 40px;
		border-radius: 10px;
		background: var(--color-surface-raised);
		border-color: var(--color-border);
	}

	.levels button[aria-checked='true'] {
		background: var(--color-spell-ink);
		border-color: var(--color-spell-ink);
		color: var(--color-bg);
	}

	.srd-note {
		margin-top: 12px;
		font-size: 13px;
		color: var(--color-text-muted);
	}

	.srd-note a {
		color: var(--color-accent);
		font-weight: 700;
	}

	.none {
		margin-top: 24px;
		text-align: center;
		color: var(--color-text-muted);
	}

	.group {
		margin: 18px 4px 6px;
	}

	.list {
		list-style: none;
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
		min-height: 58px;
		justify-content: center;
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
	}

	.meta {
		font-size: 12px;
		color: var(--color-text-muted);
	}

	.add {
		flex-shrink: 0;
		min-width: 84px;
		height: 40px;
		border: 1.5px solid var(--color-spell-ink);
		background: var(--color-surface);
		color: var(--color-spell-ink);
		font-weight: 800;
	}

	.add.added {
		background: var(--color-spell-ink);
		color: var(--color-bg);
	}

	.details {
		padding: 0 12px 14px;
	}

	.delete {
		margin-top: 10px;
		min-height: 40px;
		border: 0;
		background: transparent;
		color: var(--color-danger);
		font-weight: 700;
		padding: 0;
	}
</style>
