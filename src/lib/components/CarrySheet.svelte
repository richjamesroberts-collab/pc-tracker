<script lang="ts">
	import Sheet from './Sheet.svelte';
	import { session } from '$lib/session.svelte';
	import { CARRY_STATUS, PLACE_IDEAS, addStash, encumbrance, partyBag, removeStash } from '$lib/rules/carry';
	import { coinCount } from '$lib/rules/coins';
	import type { Character } from '$lib/types';

	let { open, onclose, onplace }: { open: boolean; onclose: () => void; onplace?: (id: string) => void } = $props();

	const c = $derived(session.character as Character);
	const load = $derived(encumbrance(c));
	const bag = $derived(partyBag(c));
	const places = $derived(c.stashes.filter((s) => s.kind === 'place'));
	const variant = $derived(c.encumbranceRule === 'variant');

	let newPlace = $state('');
	/** The place being renamed, and its new name. */
	let renaming = $state<string | null>(null);
	let rename = $state('');

	const ideas = $derived(PLACE_IDEAS.filter((p) => !c.stashes.some((s) => s.name.toLowerCase() === p.toLowerCase())));
	const lb = (n: number) => `${Math.round(n * 100) / 100} lb`;
	/** Things and coins kept in a stash, for the remove label. */
	const held = (id: string) => c.items.filter((i) => i.stash === id).length + (coinCount(c.stashes.find((s) => s.id === id)!.coins) ? 1 : 0);

	function setVariant(on: boolean) {
		session.mutate(on ? 'Using variant encumbrance' : 'Using carrying capacity only', (d) => {
			if (on) d.encumbranceRule = 'variant';
			else delete d.encumbranceRule;
		});
	}

	function setBag(on: boolean) {
		if (on) session.mutate('The party has a Bag of Holding', (d) => addStash(d, 'bag'));
		else if (bag) session.mutate(held(bag.id) ? 'Bag of Holding gone: what was yours in it is back with you' : 'No party Bag of Holding', (d) => removeStash(d, bag.id));
	}

	function add(e: SubmitEvent) {
		e.preventDefault();
		const name = newPlace.trim();
		if (!name) return;
		const id = session.mutate(`Added ${name}`, (d) => addStash(d, 'place', name));
		newPlace = '';
		if (id) onplace?.(id);
	}

	function saveRename(e: SubmitEvent) {
		e.preventDefault();
		const id = renaming;
		const name = rename.trim();
		renaming = null;
		if (!id || !name) return;
		session.mutate(`Renamed to ${name}`, (d) => {
			const s = d.stashes.find((x) => x.id === id);
			if (s) s.name = name;
		});
	}

	function remove(id: string, name: string) {
		session.mutate(held(id) ? `${name} removed: everything kept there is back with you` : `${name} removed`, (d) => removeStash(d, id));
	}
</script>

<Sheet {open} {onclose} label="Carrying">
	<h2>Carrying</h2>
	<p class="total" class:warn={load.status !== 'light'}>
		<b>{lb(load.carried)}</b> of {lb(load.capacity)}
		{#if load.status !== 'light'}<span>{CARRY_STATUS[load.status].label}</span>{/if}
	</p>
	{#if CARRY_STATUS[load.status].note}<p class="note">{CARRY_STATUS[load.status].note}</p>{/if}

	<dl class="rules">
		<div>
			<dt>Carrying capacity</dt>
			<dd>STR {load.str} × 15{load.powerfulBuild ? ' × 2' : ''} = {lb(load.capacity)}</dd>
		</div>
		{#if load.powerfulBuild}
			<div>
				<dt>Powerful Build</dt>
				<dd>Counts as one size larger</dd>
			</div>
		{/if}
		{#if variant}
			<div>
				<dt>Encumbered over</dt>
				<dd>{lb(load.encumberedAt!)}: speed −10 ft</dd>
			</div>
			<div>
				<dt>Heavily encumbered over</dt>
				<dd>{lb(load.heavyAt!)}: speed −20 ft, disadvantage</dd>
			</div>
		{/if}
		<div>
			<dt>Push, drag or lift</dt>
			<dd>{lb(load.pushDrag)}</dd>
		</div>
		<div>
			<dt>Coins</dt>
			<dd>50 per lb · pouch 300 · sack 1,500</dd>
		</div>
	</dl>

	<label class="toggle">
		<input type="checkbox" checked={variant} onchange={(e) => setVariant(e.currentTarget.checked)} />
		<span>
			<b>Variant encumbrance</b>
			<small>Slower above STR × 5 and STR × 10 (PHB, if the DM uses it)</small>
		</span>
	</label>

	<label class="toggle">
		<input type="checkbox" checked={!!bag} onchange={(e) => setBag(e.currentTarget.checked)} />
		<span>
			<b>The party has a Bag of Holding</b>
			<small>Someone else carries it: what you put in doesn't weigh on you. Holds 500 lb.</small>
		</span>
	</label>

	<h3 class="label">Places</h3>
	<p class="hint">Somewhere to keep things you aren't carrying: a guild hall, a safe house, a bank. They don't weigh on you, and can't be used until you fetch them.</p>
	{#if places.length}
		<div class="card list">
			{#each places as p (p.id)}
				{#if renaming === p.id}
					<form class="row" onsubmit={saveRename}>
						<!-- svelte-ignore a11y_autofocus -->
						<input bind:value={rename} aria-label="Name" autofocus />
						<button type="submit" disabled={!rename.trim()}>Save</button>
					</form>
				{:else}
					<div class="row">
						<button type="button" class="name" onclick={() => onplace?.(p.id)}>{p.name}</button>
						<button
							type="button"
							onclick={() => {
								renaming = p.id;
								rename = p.name;
							}}>Rename</button
						>
						<button type="button" class="remove" onclick={() => remove(p.id, p.name)}>Remove</button>
					</div>
				{/if}
			{/each}
		</div>
	{/if}
	<form class="add" onsubmit={add}>
		<input bind:value={newPlace} placeholder="Name a place" autocapitalize="words" aria-label="New place" />
		<button type="submit" disabled={!newPlace.trim()}>Add place</button>
	</form>
	{#if ideas.length}
		<div class="ideas">
			{#each ideas as idea (idea)}
				<button type="button" onclick={() => (newPlace = idea)}>{idea}</button>
			{/each}
		</div>
	{/if}
</Sheet>

<style>
	h2 {
		font-size: 22px;
	}

	.total {
		margin-top: 6px;
		font-size: 15px;
		font-variant-numeric: tabular-nums;
		color: var(--color-text-muted);
	}

	.total b {
		font-size: 26px;
		font-weight: 900;
		color: var(--color-effect-ink);
	}

	.total span {
		margin-left: 6px;
		font-weight: 800;
		color: var(--color-warning);
	}

	.total.warn b {
		color: var(--color-warning);
	}

	.note {
		margin-top: 4px;
		font-size: 14px;
		line-height: 1.45;
	}

	.rules {
		margin-top: 12px;
		border-top: 1px solid var(--color-border);
	}

	.rules div {
		display: flex;
		justify-content: space-between;
		gap: 12px;
		padding: 8px 0;
		border-bottom: 1px solid var(--color-border);
		font-size: 14px;
	}

	.rules dt {
		font-weight: 700;
		color: var(--color-text-muted);
	}

	.rules dd {
		text-align: right;
		font-weight: 700;
		font-variant-numeric: tabular-nums;
	}

	.toggle {
		display: flex;
		align-items: flex-start;
		gap: 10px;
		margin-top: 14px;
	}

	.toggle input {
		flex-shrink: 0;
		width: 22px;
		height: 22px;
		margin-top: 2px;
		accent-color: var(--color-effect-ink);
	}

	.toggle span {
		display: flex;
		flex-direction: column;
	}

	.toggle small {
		font-size: 13px;
		color: var(--color-text-muted);
	}

	.label {
		margin: 20px 4px 4px;
	}

	.hint {
		margin: 0 4px 8px;
		font-size: 13px;
		line-height: 1.4;
		color: var(--color-text-muted);
	}

	.list {
		overflow: hidden;
		margin-bottom: 10px;
	}

	.row {
		display: flex;
		align-items: center;
		gap: 6px;
		padding: 6px 10px;
	}

	.row + .row {
		border-top: 1px solid var(--color-border);
	}

	.row .name {
		flex: 1;
		min-width: 0;
		padding: 8px 4px;
		border: 0;
		background: transparent;
		color: var(--color-text);
		text-align: left;
		font-size: 16px;
		font-weight: 700;
		overflow-wrap: anywhere;
	}

	.row input {
		flex: 1;
		min-width: 0;
		height: 40px;
		border-radius: 10px;
	}

	.row button:not(.name),
	.add button {
		flex-shrink: 0;
		min-height: 40px;
		background: var(--color-surface);
		border: 1.5px solid var(--color-border-strong);
		color: var(--color-text);
		font-weight: 800;
	}

	.row .remove {
		color: var(--color-danger);
	}

	.add {
		display: flex;
		gap: 8px;
	}

	.add input {
		flex: 1;
		min-width: 0;
		height: 46px;
		border-radius: 12px;
	}

	.add button {
		height: 46px;
		border-color: var(--color-accent);
		color: var(--color-accent);
	}

	button:disabled {
		opacity: 0.45;
	}

	.ideas {
		display: flex;
		flex-wrap: wrap;
		gap: 6px;
		margin-top: 8px;
	}

	.ideas button {
		min-height: 34px;
		padding: 0 12px;
		border-radius: 999px;
		background: var(--color-chip);
		border: 0;
		color: var(--color-text);
		font-size: 13px;
		font-weight: 700;
	}
</style>
