<script lang="ts" module>
	import type { Place } from '$lib/rules/carry';

	/** Where the player chose: a place, or a new place to make and put it in. */
	export type Destination = Place & { newPlace?: string };
</script>

<script lang="ts">
	import { untrack } from 'svelte';
	import Sheet from './Sheet.svelte';
	import { session } from '$lib/session.svelte';
	import {
		CARRY_STATUS,
		PLACE_IDEAS,
		carryState,
		coinRoom,
		containersOf,
		encumbrance,
		overLimit,
		samePlace,
		stashCapacity,
		wornContainers,
		worse
	} from '$lib/rules/carry';
	import { coinCount } from '$lib/rules/coins';
	import type { Character, InventoryItem, Stash } from '$lib/types';

	let {
		open,
		title,
		message = '',
		max = 1,
		split = false,
		coins = false,
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
		/** Placing coins: only equipped containers on the character, and stashes. */
		coins?: boolean;
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
	const num = (n: number) => n.toLocaleString('en');

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

	/** Containers in a stash, each followed by the ones inside it. */
	function boxesIn(stash: string): { item: InventoryItem; depth: number }[] {
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

	function row(key: string, to: Place, label: string, depth = 0): Row | null {
		const here = !!from && samePlace(from, to);
		if (here) return { key, to, label, depth, detail: 'Here now', warn: '', disabled: true, here };
		const after = simulate(to, count);
		if (!after) return null;
		const state = carryState(after);
		const enc = encumbrance(after, state.carried);
		const box = to.inside ? after.items.find((i) => i.id === to.inside) : undefined;
		const stashId = box ? box.stash : to.stash;
		const stash = stashId ? after.stashes.find((s) => s.id === stashId) : undefined;
		const problem = overLimit(c, after, to);
		let detail = '';
		if (box?.container) {
			const load = state.loads.get(box.id) ?? 0;
			const cap = box.container.lb;
			if (coins) {
				const room = coinRoom(state, box);
				detail = `${num(box.coins ? coinCount(box.coins) : 0)} coins${Number.isFinite(room) ? ` · room for ${num(room)} more` : ''}`;
			} else detail = `${cap !== undefined ? `${lb(load)} of ${lb(cap)}` : `${lb(load)} inside`}${box.container.weightless ? ' · weightless' : ''}`;
		} else if (stash) {
			const load = state.stashLoads.get(stash.id) ?? 0;
			const cap = stashCapacity(stash);
			detail = cap !== undefined ? `${lb(load)} of ${lb(cap)}` : `${lb(load)} kept here`;
		} else {
			detail = `Carrying ${lb(enc.carried)} of ${lb(enc.capacity)}`;
		}
		if (problem) {
			const was = box && c.items.find((i) => i.id === box.id);
			detail = coins && was ? `Only room for ${num(coinRoom(carryState(c), was))} more coins` : `Won't fit: ${problem}`;
		}
		// Anything that ends up on the character can slow them down.
		const warn = !problem && !stash && enc.status !== 'light' && (worse(enc.status, before.status) || enc.carried > before.carried) ? CARRY_STATUS[enc.status].label : '';
		return { key, to, label, depth, detail, warn, disabled: !!problem, here };
	}

	const KIND_TITLE: Record<Stash['kind'], string> = { mount: 'Mount', bag: 'Party bag', place: 'Place' };

	const groups = $derived.by(() => {
		if (!open) return [];
		const keep = (r: Row | null): r is Row => !!r;
		const worn = wornContainers(c);
		const person = coins
			? []
			: [row('carry', {}, from?.inside && !from.stash ? 'Take it out: worn, held or strapped on' : 'On you: worn, held or strapped on')];
		const out: { title: string; rows: Row[]; empty?: string }[] = [
			{
				title: 'With you',
				rows: [...person, ...worn.map((i) => row(i.id, { inside: i.id }, `In ${i.name}`))].filter(keep),
				empty: coins ? 'Nothing to keep coins in. Equip a pouch, sack or other container.' : undefined
			}
		];
		for (const s of [...c.stashes].sort((a, b) => ['mount', 'bag', 'place'].indexOf(a.kind) - ['mount', 'bag', 'place'].indexOf(b.kind))) {
			const label = s.kind === 'place' ? `Leave it at ${s.name}` : s.kind === 'mount' ? `On ${s.name}` : 'In the bag';
			out.push({
				title: `${s.name} · ${KIND_TITLE[s.kind]}`,
				rows: [row(s.id, { stash: s.id }, label), ...(coins ? [] : boxesIn(s.id).map(({ item, depth }) => row(item.id, { inside: item.id }, `In ${item.name}`, depth)))].filter(keep)
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
			{#if !g.rows.length && g.empty}<p class="empty">{g.empty}</p>{/if}
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

	.empty {
		padding: 12px 14px;
		font-size: 14px;
		color: var(--color-warning);
		font-weight: 700;
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
