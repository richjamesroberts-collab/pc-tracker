<script lang="ts">
	import { untrack } from 'svelte';
	import Sheet from './Sheet.svelte';
	import ItemText from './ItemText.svelte';
	import ItemIcon from './ItemIcon.svelte';
	import Pips from './Pips.svelte';
	import { session } from '$lib/session.svelte';
	import { loadGear, loadItems, rarityLabel, type GearItem, type MagicItem } from '$lib/data/content';
	import { chargesLeft, restoreCharges, spendCharges } from '$lib/rules/items';
	import { isUsable, useCost, useFx, useItem, useTimes, type UseFx } from '$lib/rules/usable';
	import type { Character, InventoryItem } from '$lib/types';

	let {
		open,
		onclose,
		onused
	}: {
		open: boolean;
		onclose: () => void;
		/** After an item is used (the sheet has closed): its kind of animation and what was spent ("−2 charges"). */
		onused: (used: { kind: UseFx; label: string }) => void;
	} = $props();

	const c = $derived(session.character as Character);
	const items = $derived(c.items.filter(isUsable));

	/** The item whose details are showing, or null for the list. */
	let viewing = $state<string | null>(null);
	/** Charges to spend on the next use, for items that can spend more than one (Wand of Fireballs). */
	let spend = $state(1);

	$effect(() => {
		if (!open) return;
		untrack(() => {
			viewing = null;
			spend = 1;
		});
	});

	let magic = $state<MagicItem[] | null>(null);
	let gear = $state<GearItem[] | null>(null);
	$effect(() => {
		if (!open || (magic && gear)) return;
		Promise.all([loadItems(), loadGear()]).then(
			([m, g]) => ((magic = m), (gear = g)),
			() => {}
		);
	});

	const byId = $derived(new Map<string, MagicItem | GearItem>([...(magic ?? []), ...(gear ?? [])].map((x) => [x.id, x])));
	const viewItem = $derived(viewing ? items.find((i) => i.id === viewing) : undefined);

	// An item used up (or unattuned elsewhere) while its details are open drops back to the list.
	$effect(() => {
		if (viewing && !viewItem) viewing = null;
	});

	const plural = (n: number, one: string) => `${n} ${one}${n === 1 ? '' : 's'}`;
	const chargeWord = (i: InventoryItem) => (i.kind === 'gear' ? 'use' : 'charge');

	function meta(i: InventoryItem): string {
		const cost = useCost(i);
		const left =
			cost === 'charges' ? `${chargesLeft(i)}/${i.charges!.max} ${chargeWord(i)}s` : cost === 'consumed' ? 'Used up on use' : '';
		return [useTimes(i), left, rarityLabel(i.rarity)].filter(Boolean).join(' · ') || i.type;
	}

	const canUse = (i: InventoryItem, n = 1) => useCost(i) !== 'charges' || chargesLeft(i) >= n;

	function use(i: InventoryItem, n = 1) {
		const cost = useCost(i);
		let spent = 'Used';
		if (cost === 'free') {
			session.notify(`Used ${i.name}`);
		} else if (cost === 'charges') {
			const left = chargesLeft(i) - n;
			if (!session.mutate(`Used ${i.name}: ${plural(n, chargeWord(i))}, ${left} left`, (d) => useItem(d, i.id, n))) return;
			spent = `−${plural(n, chargeWord(i))}`;
		} else {
			const left = i.quantity - 1;
			session.mutate(left ? `Used ${i.name}: ${left} left` : `Used ${i.name}. That was the last one`, (d) => useItem(d, i.id));
			spent = '−1';
		}
		onclose();
		onused({ kind: useFx(i), label: spent });
	}

	function view(i: InventoryItem) {
		viewing = i.id;
		spend = 1;
	}
</script>

<Sheet {open} {onclose} label="Usable items">
	{#if viewItem}
		{@const data = viewItem.ref ? byId.get(viewItem.ref) : undefined}
		{@const cost = useCost(viewItem)}
		{@const left = chargesLeft(viewItem)}
		{@const word = chargeWord(viewItem)}
		<button type="button" class="back" onclick={() => (viewing = null)}>‹ Usable items</button>
		<div class="head">
			<ItemIcon size={44} />
			<div>
				<h2>{viewItem.name}</h2>
				<p class="sub">
					{[viewItem.type, rarityLabel(viewItem.rarity), cost === 'consumed' || viewItem.quantity > 1 ? `${viewItem.quantity} left` : ''].filter(Boolean).join(' · ')}
				</p>
			</div>
		</div>
		{#if useTimes(viewItem) || cost === 'consumed'}
			<p class="tags">
				{#each useTimes(viewItem).split(' · ').filter(Boolean) as t (t)}<span class="tag">{t}</span>{/each}
				{#if cost === 'consumed'}<span class="tag used">Used up on use</span>{/if}
			</p>
		{/if}
		{#if cost === 'charges'}
			<div class="charges">
				<div class="charges-head">
					<span class="label">{word === 'use' ? 'Uses' : 'Charges'}</span>
					<span class="count">{left} / {viewItem.charges!.max}</span>
				</div>
				<Pips
					label={word}
					max={viewItem.charges!.max}
					{left}
					size={18}
					onspend={() => session.mutate(`Spent a ${word} of ${viewItem.name}`, (d) => spendCharges(d, viewItem.id))}
					onrestore={() => session.mutate(`Got a ${word} of ${viewItem.name} back`, (d) => restoreCharges(d, viewItem.id))}
				/>
				{#if viewItem.charges!.regain}<p class="regain">Regains {viewItem.charges!.regain} at dawn</p>{/if}
			</div>
		{/if}
		<div class="text">
			{#if data}
				<ItemText item={data} />
			{:else if viewItem.ref && !(magic && gear)}
				<p class="muted">Loading…</p>
			{/if}
			{#if viewItem.notes.trim()}
				{#if data}<p class="notes-label">Your notes</p>{/if}
				<ItemText item={{ text: viewItem.notes }} />
			{/if}
		</div>
		{#if cost === 'charges' && left > 1}
			<div class="spend">
				<span>{word === 'use' ? 'Uses' : 'Charges'} to spend</span>
				<div class="stepper">
					<button type="button" aria-label="One fewer" disabled={spend <= 1} onclick={() => (spend = Math.max(1, spend - 1))}>−</button>
					<b>{spend}</b>
					<button type="button" aria-label="One more" disabled={spend >= left} onclick={() => (spend = Math.min(left, spend + 1))}>+</button>
				</div>
			</div>
		{/if}
		<button type="button" class="apply" disabled={!canUse(viewItem, spend)} onclick={() => use(viewItem, spend)}>
			{#if !canUse(viewItem, spend)}
				No {word}s left
			{:else if cost === 'charges'}
				Use item ({plural(spend, word)})
			{:else}
				Use item
			{/if}
		</button>
	{:else}
		<div class="head">
			<ItemIcon size={44} />
			<h2>Usable items</h2>
		</div>
		{#if items.length}
			<ul class="list">
				{#each items as i (i.id)}
					<li>
						<button type="button" class="row" onclick={() => view(i)}>
							<b>{i.name}{i.quantity > 1 ? ` ×${i.quantity}` : ''}</b>
							<span>{meta(i)}</span>
						</button>
						<button type="button" class="use" aria-label="Use {i.name}" disabled={!canUse(i)} onclick={() => use(i)}>Use</button>
					</li>
				{/each}
			</ul>
		{:else}
			<p class="muted">Nothing to use. Add magic items and gear in Inventory.</p>
		{/if}
	{/if}
</Sheet>

<style>
	h2 {
		font-size: 22px;
		line-height: 1.15;
		overflow-wrap: anywhere;
	}

	.head {
		display: flex;
		align-items: center;
		gap: 12px;
	}

	.sub {
		margin-top: 2px;
		font-size: 13px;
		color: var(--color-text-muted);
	}

	.back {
		margin: -6px 0 8px -4px;
		height: 36px;
		padding: 0 4px;
		border: 0;
		background: transparent;
		color: var(--color-accent);
		font-weight: 800;
	}

	.muted {
		margin-top: 12px;
		font-size: 14px;
		color: var(--color-text-muted);
	}

	.list {
		list-style: none;
		margin: 12px 0 0;
		padding: 0;
	}

	.list li {
		display: flex;
		align-items: center;
		gap: 8px;
		min-height: 60px;
	}

	.list li + li {
		border-top: 1px solid var(--color-border);
	}

	.row {
		flex: 1;
		display: flex;
		flex-direction: column;
		align-items: flex-start;
		min-width: 0;
		padding: 8px 0;
		border: 0;
		border-radius: 0;
		background: transparent;
		color: var(--color-text);
		font-weight: 400;
		text-align: left;
	}

	.row b {
		font-size: 16px;
		overflow-wrap: anywhere;
	}

	.row span {
		font-size: 12px;
		color: var(--color-text-muted);
	}

	.use {
		flex-shrink: 0;
		height: 40px;
		padding: 0 16px;
		border: 0;
		border-radius: 12px;
		background: var(--color-accent);
		color: var(--color-on-accent);
		font-weight: 800;
	}

	.use:disabled,
	.apply:disabled {
		opacity: 0.45;
	}

	.tags {
		display: flex;
		flex-wrap: wrap;
		gap: 6px;
		margin-top: 12px;
	}

	.tag {
		padding: 3px 10px;
		border-radius: 999px;
		background: var(--color-chip);
		font-size: 13px;
		font-weight: 700;
	}

	.tag.used {
		background: var(--color-effect-bg);
		color: var(--color-effect-ink);
	}

	.charges {
		margin-top: 14px;
		padding: 10px 12px;
		border: 1px solid var(--color-border);
		border-radius: 14px;
		background: var(--color-surface-raised);
	}

	.charges-head {
		display: flex;
		justify-content: space-between;
		align-items: baseline;
		margin-bottom: 8px;
	}

	.count {
		font-family: var(--font-display);
		font-size: 18px;
		font-weight: 900;
		font-variant-numeric: tabular-nums;
	}

	.regain {
		margin-top: 6px;
		font-size: 12px;
		color: var(--color-text-muted);
	}

	.text {
		margin-top: 14px;
	}

	.notes-label {
		margin-top: 12px;
		font-size: 13px;
		font-weight: 800;
		color: var(--color-text-muted);
	}

	.spend {
		display: flex;
		justify-content: space-between;
		align-items: center;
		gap: 12px;
		margin-top: 16px;
		font-weight: 800;
	}

	.stepper {
		display: flex;
		align-items: center;
		gap: 4px;
	}

	.stepper button {
		width: 44px;
		height: 44px;
		border-radius: 12px;
		font-size: 22px;
		font-weight: 800;
	}

	.stepper button:disabled {
		opacity: 0.4;
	}

	.stepper b {
		min-width: 36px;
		font-family: var(--font-display);
		font-size: 24px;
		font-weight: 900;
		text-align: center;
		font-variant-numeric: tabular-nums;
	}

	.apply {
		width: 100%;
		height: 54px;
		margin-top: 16px;
		border: 0;
		border-radius: 14px;
		background: var(--color-accent);
		color: var(--color-on-accent);
		font-size: 17px;
		font-weight: 800;
	}
</style>
