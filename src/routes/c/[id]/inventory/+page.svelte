<script lang="ts">
	import Pips from '$lib/components/Pips.svelte';
	import ItemSheet from '$lib/components/ItemSheet.svelte';
	import ItemText from '$lib/components/ItemText.svelte';
	import ItemPickerSheet from '$lib/components/ItemPickerSheet.svelte';
	import { session } from '$lib/session.svelte';
	import { inventoryItem, loadItems, rarityLabel, type MagicItem } from '$lib/data/content';
	import {
		addItem,
		attunedCount,
		attunementLimit,
		changeQuantity,
		chargesLeft,
		dawn,
		restoreCharges,
		setAttuned,
		spendCharges,
		stacks
	} from '$lib/rules/items';
	import type { Character, InventoryItem } from '$lib/types';

	/** Rows with more charges than this show as a number with −/+ buttons instead. */
	const MAX_PIPS = 10;

	const c = $derived(session.character as Character);
	const attuned = $derived(attunedCount(c));
	const limit = $derived(attunementLimit(c));
	const recharges = $derived(c.items.some((i) => i.charges?.regain));

	let library = $state<MagicItem[] | null>(null);
	let failed = $state(false);
	let attempt = $state(0);

	$effect(() => {
		void attempt;
		failed = false;
		let live = true;
		loadItems().then(
			(x) => live && (library = x),
			() => live && (failed = true)
		);
		return () => (live = false);
	});

	const byId = $derived(new Map((library ?? []).map((i) => [i.id, i])));

	let expanded = $state<string | null>(null);
	let pickerOpen = $state(false);
	let sheetOpen = $state(false);
	/** Id of the item being edited; null for a new custom item. */
	let editing = $state<string | null>(null);
	const editingItem = $derived(editing ? c.items.find((i) => i.id === editing) : undefined);

	const meta = (i: InventoryItem) =>
		[i.type, rarityLabel(i.rarity), i.attunement && !i.attuned ? 'Attunement' : ''].filter(Boolean).join(' · ') || 'Item';

	function pick(m: MagicItem) {
		pickerOpen = false;
		const id = session.mutate(`Added ${m.name}`, (d) => addItem(d, inventoryItem(m)));
		if (id) expanded = id;
	}

	function openCustom() {
		pickerOpen = false;
		editing = null;
		sheetOpen = true;
	}

	function openEdit(i: InventoryItem) {
		editing = i.id;
		sheetOpen = true;
	}

	function saveItem(item: InventoryItem) {
		if (editing) {
			session.mutate(`${item.name} saved`, (d) => {
				const index = d.items.findIndex((x) => x.id === item.id);
				if (index >= 0) d.items[index] = item;
			});
		} else {
			session.mutate(`Added ${item.name}`, (d) => {
				d.items.push(item);
			});
			expanded = item.id;
		}
	}

	function removeItem() {
		const id = editing;
		const name = editingItem?.name ?? 'Item';
		session.mutate(`${name} removed`, (d) => {
			d.items = d.items.filter((x) => x.id !== id);
		});
	}

	function toggleAttuned(i: InventoryItem) {
		if (!i.attuned && attuned >= limit) {
			session.notify(`You can attune to ${limit} items at once. End one first.`, { tone: 'warn' });
			return;
		}
		session.mutate(i.attuned ? `Ended attunement to ${i.name}` : `Attuned to ${i.name}`, (d) => setAttuned(d, i.id, !i.attuned));
	}

	function quantity(i: InventoryItem, delta: number) {
		const label = i.quantity + delta < 1 ? `${i.name} removed` : `${i.name}: ${i.quantity + delta}`;
		session.mutate(label, (d) => changeQuantity(d, i.id, delta));
	}

	function spend(i: InventoryItem, n = 1) {
		session.mutate(`${i.name}: ${n} charge${n > 1 ? 's' : ''} used`, (d) => spendCharges(d, i.id, n));
	}

	function restore(i: InventoryItem, n = 1) {
		session.mutate(`${i.name}: charge restored`, (d) => restoreCharges(d, i.id, n));
	}

	function newDay() {
		const spent = c.items.some((i) => i.charges?.regain && chargesLeft(i) < i.charges.max);
		if (!spent) {
			session.notify('Dawn: every item is already fully charged');
			return;
		}
		const back = session.mutate(null, (d) => dawn(d)) ?? [];
		const list = back.map((r) => `${r.name} +${r.amount}`).join(', ');
		session.notify(back.length ? `Dawn: ${list}` : 'Dawn: no charges came back', { canUndo: true });
	}
</script>

<div class="top">
	<h1>Inventory</h1>
	{#if recharges}
		<button type="button" class="dawn" onclick={newDay}>
			<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 18h16M7 18a5 5 0 0 1 10 0M12 4v4M4.9 9.9l1.4 1.4M19.1 9.9l-1.4 1.4" /></svg>
			Dawn
		</button>
	{/if}
</div>

<p class="attunement" class:full={attuned >= limit}>
	Attuned <b>{attuned} / {limit}</b>
</p>

<h2 class="label group">Magic items{c.items.length ? ` · ${c.items.length}` : ''}</h2>
<div class="card list">
	{#each c.items as i (i.id)}
		{@const open = expanded === i.id}
		{@const data = i.ref ? byId.get(i.ref) : undefined}
		{@const left = chargesLeft(i)}
		<div class="item">
			<button type="button" class="info" aria-expanded={open} onclick={() => (expanded = open ? null : i.id)}>
				<span class="line">
					<span class="name">{i.name}</span>
					{#if i.quantity > 1}<span class="qty">×{i.quantity}</span>{/if}
				</span>
				<span class="meta">{meta(i)}</span>
			</button>
			<div class="badges">
				{#if i.attuned}<span class="tag attuned">Attuned</span>{/if}
				{#if i.charges}<span class="charges" aria-label="{left} of {i.charges.max} charges left">{left}/{i.charges.max}</span>{/if}
			</div>
		</div>
		{#if open}
			<div class="details">
				{#if i.charges}
					<div class="block">
						<div class="head">
							<span class="sub">Charges</span>
							<span class="meta">{i.charges.regain ? `Regains ${i.charges.regain === 'all' ? 'all charges' : i.charges.regain} at dawn` : 'No recharge'}</span>
						</div>
						{#if i.charges.max > MAX_PIPS}
							<div class="stepper">
								<span class="num">{left} / {i.charges.max}</span>
								<button type="button" aria-label="Use a charge of {i.name}" disabled={left < 1} onclick={() => spend(i)}>−</button>
								<button type="button" aria-label="Restore a charge to {i.name}" disabled={left >= i.charges.max} onclick={() => restore(i)}>+</button>
							</div>
						{:else}
							<Pips label="{i.name} charges" max={i.charges.max} {left} onspend={() => spend(i)} onrestore={() => restore(i)} />
						{/if}
					</div>
				{/if}

				<div class="actions">
					{#if i.attunement}
						<button type="button" class="attune" class:on={i.attuned} aria-pressed={i.attuned} onclick={() => toggleAttuned(i)}>
							{i.attuned ? 'Attuned' : 'Attune'}
						</button>
					{/if}
					{#if stacks(i) || i.quantity > 1}
						<div class="count" role="group" aria-label="Quantity">
							<button type="button" aria-label="One fewer {i.name}" onclick={() => quantity(i, -1)}>−</button>
							<span>{i.quantity}</span>
							<button type="button" aria-label="One more {i.name}" onclick={() => quantity(i, 1)}>+</button>
						</div>
					{/if}
					<button type="button" class="edit" onclick={() => openEdit(i)}>Edit</button>
				</div>

				<div class="text">
					{#if data}
						{#if data.name !== i.name}<p class="was">{data.name}</p>{/if}
						<ItemText item={data} />
					{:else if i.ref && !library && !failed}
						<p class="muted">Loading description…</p>
					{/if}
					{#if i.notes.trim()}
						{#if data}<h3 class="sub notes">Notes</h3>{/if}
						<p class="notes-text">{i.notes}</p>
					{:else if !i.ref}
						<p class="muted">No description. Tap Edit to add one.</p>
					{/if}
				</div>
			</div>
		{/if}
	{:else}
		<p class="none">No magic items yet.</p>
	{/each}
	<button type="button" class="add" onclick={() => (pickerOpen = true)}>Add magic item</button>
</div>

<ItemPickerSheet
	open={pickerOpen}
	items={library}
	{failed}
	onretry={() => attempt++}
	onpick={pick}
	oncustom={openCustom}
	onclose={() => (pickerOpen = false)}
/>

<ItemSheet open={sheetOpen} item={editingItem} onsave={saveItem} ondelete={removeItem} onclose={() => (sheetOpen = false)} />

<style>
	.top {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 8px;
	}

	h1 {
		font-size: 26px;
		font-weight: 900;
	}

	.dawn {
		display: inline-flex;
		align-items: center;
		gap: 6px;
		height: 38px;
		background: var(--color-surface);
		border: 1.5px solid var(--color-border-strong);
		color: var(--color-text);
		font-size: 13px;
		font-weight: 700;
	}

	.dawn svg {
		width: 18px;
		height: 18px;
		fill: none;
		stroke: var(--color-warning);
		stroke-width: 2;
		stroke-linecap: round;
		stroke-linejoin: round;
	}

	.attunement {
		margin-top: 2px;
		font-size: 13px;
		font-weight: 600;
		color: var(--color-text-muted);
	}

	.attunement b {
		color: var(--color-effect-ink);
	}

	.attunement.full b {
		color: var(--color-warning);
	}

	.group {
		margin: 18px 4px 6px;
	}

	.list {
		overflow: hidden;
		padding-bottom: 12px;
	}

	.item {
		display: flex;
		align-items: center;
		gap: 8px;
		padding-right: 12px;
	}

	.list > .item:not(:first-child) {
		border-top: 1px solid var(--color-border);
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

	.line {
		display: flex;
		align-items: baseline;
		gap: 6px;
		min-width: 0;
	}

	.name {
		font-size: 16px;
		font-weight: 700;
		overflow-wrap: anywhere;
	}

	.qty {
		flex-shrink: 0;
		font-size: 14px;
		font-weight: 800;
		color: var(--color-text-muted);
	}

	.meta {
		font-size: 12px;
		color: var(--color-text-muted);
	}

	.badges {
		display: flex;
		align-items: center;
		gap: 6px;
		flex-shrink: 0;
	}

	.tag {
		font-size: 11px;
		font-weight: 800;
		padding: 2px 8px;
		border-radius: 999px;
	}

	.tag.attuned {
		background: var(--color-effect-bg);
		color: var(--color-effect-ink);
	}

	.charges {
		min-width: 44px;
		padding: 3px 8px;
		border-radius: 10px;
		background: var(--color-spell-bg);
		color: var(--color-spell-ink);
		font-size: 14px;
		font-weight: 900;
		font-variant-numeric: tabular-nums;
		text-align: center;
	}

	.details {
		padding: 0 12px 14px;
	}

	.block {
		padding: 4px 0 2px;
	}

	.head {
		display: flex;
		align-items: baseline;
		justify-content: space-between;
		gap: 8px;
	}

	.sub {
		font-size: 13px;
		font-weight: 800;
		color: var(--color-text-muted);
	}

	.stepper {
		display: flex;
		align-items: center;
		gap: 6px;
		padding: 6px 0;
	}

	.num {
		margin-right: auto;
		font-size: 20px;
		font-weight: 900;
		font-variant-numeric: tabular-nums;
		color: var(--color-spell-ink);
	}

	.stepper button {
		min-width: 48px;
		height: 40px;
		padding: 0 10px;
		background: var(--color-surface);
		border: 1.5px solid var(--color-spell-edge);
		color: var(--color-spell-ink);
		font-weight: 800;
	}

	.stepper button:disabled {
		opacity: 0.4;
	}

	.actions {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 8px;
		margin-top: 8px;
	}

	.actions button {
		min-height: 40px;
		background: var(--color-surface);
		border: 1.5px solid var(--color-border-strong);
		color: var(--color-text);
		font-weight: 800;
	}

	.actions .attune {
		border-color: var(--color-effect-edge);
		color: var(--color-effect-ink);
	}

	.actions .attune.on {
		background: var(--color-effect-bg);
	}

	.actions .edit {
		margin-left: auto;
	}

	.count {
		display: flex;
		align-items: center;
		gap: 4px;
	}

	.count span {
		min-width: 32px;
		text-align: center;
		font-size: 18px;
		font-weight: 900;
		font-variant-numeric: tabular-nums;
	}

	.actions .count button {
		min-width: 44px;
	}

	.text {
		margin-top: 12px;
	}

	.text p {
		font-size: 15px;
		line-height: 1.5;
	}

	.was {
		margin-bottom: 6px;
		font-weight: 800;
	}

	.notes {
		margin-top: 12px;
		font-family: inherit;
	}

	.notes-text {
		white-space: pre-line;
		overflow-wrap: anywhere;
	}

	.muted {
		color: var(--color-text-muted);
	}

	.none {
		padding: 16px 16px 4px;
		font-size: 14px;
		color: var(--color-text-muted);
	}

	.add {
		display: block;
		width: calc(100% - 24px);
		min-height: 44px;
		margin: 12px 12px 0;
		border-radius: 12px;
		border: 1.5px dashed var(--color-border-strong);
		background: transparent;
		color: var(--color-accent);
		font-weight: 800;
	}
</style>
