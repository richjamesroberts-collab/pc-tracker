<script lang="ts" module>
	import type { Place } from '$lib/rules/carry';

	/** Where the player chose: a place, or a new place to make and put it in. */
	export type Destination = Place & { newPlace?: string };
</script>

<script lang="ts">
	import { untrack } from 'svelte';
	import Sheet from './Sheet.svelte';
	import { session } from '$lib/session.svelte';
	import { BAG_OF_HOLDING_LB, CARRY_STATUS, PLACE_IDEAS, carryState, containersOf, encumbrance, samePlace, worse } from '$lib/rules/carry';
	import type { Character, InventoryItem } from '$lib/types';

	let {
		open,
		title,
		message = '',
		max = 1,
		split = false,
		from,
		simulate,
		onpick,
		onclose
	}: {
		open: boolean;
		title: string;
		/** Why the sheet opened, when it wasn't asked for ("Too heavy to carry…"). */
		message?: string;
		/** How many there are; with `split`, the player can move fewer. */
		max?: number;
		split?: boolean;
		/** Where it is now, when moving; shown but not offered. */
		from?: Place;
		/** The character with it there, or null if it can't go there (a bag into itself). */
		simulate: (to: Place, count: number) => Character | null;
		onpick: (to: Destination, count: number) => void;
		onclose: () => void;
	} = $props();

	const c = $derived(session.character as Character);

	let count = $state(1);
	let newPlace = $state('');

	$effect(() => {
		if (!open) return;
		untrack(() => {
			count = max;
			newPlace = '';
		});
	});

	const before = $derived(encumbrance(c));
	const lb = (n: number) => `${Math.round(n * 100) / 100} lb`;

	interface Row {
		key: string;
		to: Place;
		label: string;
		depth: number;
		detail: string;
		warn: string;
		disabled: boolean;
		here: boolean;
	}

	/** Containers in a place, each followed by the ones inside it. */
	function boxesIn(stash: string | undefined): { item: InventoryItem; depth: number }[] {
		const parents = containersOf(c);
		const boxes = c.items.filter((i) => i.container && i.stash === stash);
		const out: { item: InventoryItem; depth: number }[] = [];
		const walk = (parent: InventoryItem | undefined, depth: number) => {
			for (const b of boxes) {
				if (parents.get(b.id) !== parent) continue;
				out.push({ item: b, depth });
				walk(b, depth + 1);
			}
		};
		walk(undefined, 0);
		return out;
	}

	function row(key: string, to: Place, label: string, depth: number): Row | null {
		const here = !!from && samePlace(from, to);
		if (here) return { key, to, label, depth, detail: 'Here now', warn: '', disabled: true, here };
		const after = simulate(to, count);
		if (!after) return null;
		const state = carryState(after);
		const enc = encumbrance(after, state.carried);
		const box = to.inside ? after.items.find((i) => i.id === to.inside) : undefined;
		const stash = box ? box.stash : to.stash;
		const bag = stash ? after.stashes.find((s) => s.id === stash)?.kind === 'bag' : false;
		let detail = '';
		let disabled = false;
		if (box?.container) {
			const load = state.itemLoads.get(box.id) ?? 0;
			const cap = box.container.lb;
			disabled = cap !== undefined && load > cap;
			detail = disabled
				? `Won't fit: ${lb(Math.max(0, cap! - (carryState(c).itemLoads.get(box.id) ?? 0)))} of room`
				: `${cap !== undefined ? `${lb(load)} of ${lb(cap)}` : `${lb(load)} inside`}${box.container.weightless ? ' · weightless' : ''}`;
		} else if (stash) {
			const load = state.stashLoads.get(stash) ?? 0;
			disabled = bag && load > BAG_OF_HOLDING_LB;
			detail = bag ? (disabled ? `Too full: ${lb(BAG_OF_HOLDING_LB)} at most` : `${lb(load)} of ${lb(BAG_OF_HOLDING_LB)}`) : `${lb(load)} kept here`;
		} else {
			detail = `Carrying ${lb(enc.carried)} of ${lb(enc.capacity)}`;
		}
		// Anything that ends up on the character can slow them down.
		const warn = !disabled && !stash && enc.status !== 'light' && (worse(enc.status, before.status) || enc.carried > before.carried) ? CARRY_STATUS[enc.status].label : '';
		return { key, to, label: key === 'carry' && warn ? 'Carry it anyway' : label, depth, detail, warn, disabled, here };
	}

	const groups = $derived.by(() => {
		if (!open) return [];
		const keep = (r: Row | null): r is Row => !!r;
		const out: { title: string; rows: Row[] }[] = [
			{
				title: 'With you',
				rows: [row('carry', {}, from?.inside && !from.stash ? 'Take it out' : from?.stash ? 'Bring it with you' : 'Carry it', 0), ...boxesIn(undefined).map(({ item, depth }) => row(item.id, { inside: item.id }, `In ${item.name}`, depth))].filter(keep)
			}
		];
		for (const s of c.stashes) {
			out.push({
				title: s.name,
				rows: [
					row(s.id, { stash: s.id }, s.kind === 'bag' ? 'In the bag' : `Leave it at ${s.name}`, 0),
					...boxesIn(s.id).map(({ item, depth }) => row(item.id, { inside: item.id }, `In ${item.name}`, depth))
				].filter(keep)
			});
		}
		return out;
	});

	const ideas = $derived(PLACE_IDEAS.filter((p) => !c.stashes.some((s) => s.name.toLowerCase() === p.toLowerCase())));

	function pick(to: Destination) {
		onpick(to, count);
		onclose();
	}
</script>

<Sheet {open} {onclose} label={title}>
	<h2>{title}</h2>
	{#if message}<p class="message">{message}</p>{/if}

	{#if split && max > 1}
		<div class="count" role="group" aria-label="How many">
			<span>How many</span>
			<button type="button" aria-label="One fewer" disabled={count <= 1} onclick={() => count--}>−</button>
			<b>{count}</b>
			<button type="button" aria-label="One more" disabled={count >= max} onclick={() => count++}>+</button>
			<button type="button" class="all" disabled={count === max} onclick={() => (count = max)}>All {max}</button>
		</div>
	{/if}

	{#each groups as g (g.title)}
		<h3 class="label">{g.title}</h3>
		<div class="card list">
			{#each g.rows as r (r.key)}
				<button type="button" class="dest" class:here={r.here} style:--depth={r.depth} disabled={r.disabled} onclick={() => pick(r.to)}>
					<span class="name">{r.label}</span>
					<span class="detail">{r.detail}{#if r.warn}{' · '}<b>{r.warn}</b>{/if}</span>
				</button>
			{/each}
		</div>
	{/each}

	<h3 class="label">Somewhere new</h3>
	<form
		class="new"
		onsubmit={(e) => {
			e.preventDefault();
			if (newPlace.trim()) pick({ newPlace: newPlace.trim() });
		}}
	>
		<input bind:value={newPlace} placeholder="Guild hall, safe house, bank…" autocapitalize="words" aria-label="New place" />
		<button type="submit" disabled={!newPlace.trim()}>Leave it there</button>
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

	.message {
		margin-top: 6px;
		padding: 10px 12px;
		border-radius: 12px;
		background: var(--color-surface-raised);
		border-left: 4px solid var(--color-warning);
		font-size: 14px;
		line-height: 1.45;
	}

	.label {
		margin: 16px 4px 6px;
	}

	.count {
		display: flex;
		align-items: center;
		gap: 8px;
		margin-top: 12px;
	}

	.count span {
		margin-right: auto;
		font-size: 14px;
		font-weight: 700;
		color: var(--color-text-muted);
	}

	.count b {
		min-width: 32px;
		text-align: center;
		font-size: 20px;
		font-weight: 900;
		font-variant-numeric: tabular-nums;
	}

	.count button {
		min-width: 44px;
		height: 40px;
		background: var(--color-surface);
		border: 1.5px solid var(--color-border-strong);
		color: var(--color-text);
		font-weight: 800;
	}

	.count button:disabled {
		opacity: 0.4;
	}

	.list {
		overflow: hidden;
	}

	.dest {
		display: flex;
		flex-direction: column;
		align-items: flex-start;
		gap: 2px;
		width: 100%;
		min-height: 54px;
		padding: 8px 14px 8px calc(14px + var(--depth) * 16px);
		border: 0;
		border-radius: 0;
		background: transparent;
		color: var(--color-text);
		text-align: left;
		font-weight: 400;
	}

	.dest + .dest {
		border-top: 1px solid var(--color-border);
	}

	.dest:disabled {
		opacity: 0.5;
	}

	.dest.here:disabled {
		opacity: 0.7;
	}

	.name {
		font-size: 16px;
		font-weight: 700;
	}

	.detail {
		font-size: 13px;
		color: var(--color-text-muted);
		font-variant-numeric: tabular-nums;
	}

	.detail b {
		color: var(--color-warning);
	}

	.new {
		display: flex;
		gap: 8px;
	}

	.new input {
		flex: 1;
		min-width: 0;
		height: 46px;
		border-radius: 12px;
	}

	.new button {
		flex-shrink: 0;
		height: 46px;
		background: var(--color-surface);
		border: 1.5px solid var(--color-accent);
		color: var(--color-accent);
		font-weight: 800;
	}

	.new button:disabled {
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
