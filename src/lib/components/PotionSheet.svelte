<script lang="ts">
	import { untrack } from 'svelte';
	import Sheet from './Sheet.svelte';
	import ItemText from './ItemText.svelte';
	import PotionIcon from './PotionIcon.svelte';
	import { session } from '$lib/session.svelte';
	import { loadItems, rarityLabel, type MagicItem } from '$lib/data/content';
	import { drinkPotion, healingDice, healingRange, isPotion, potionTempHp } from '$lib/rules/potions';
	import type { Character, InventoryItem } from '$lib/types';

	let {
		group,
		onclose,
		ondrank
	}: {
		/** Which potions to list; the sheet is open while set. */
		group: 'healing' | 'other' | null;
		onclose: () => void;
		/** After a potion that heals or gives temp HP: the hit points or temp HP actually gained. */
		ondrank: (gain: { amount: number; temp: boolean }) => void;
	} = $props();

	const c = $derived(session.character as Character);

	/** The potion whose details are showing, or null for the list. */
	let viewing = $state<string | null>(null);
	/** The healing potion being drunk: choosing action or bonus action, then the roll. */
	let drinking = $state<string | null>(null);
	let way = $state<'action' | 'bonus' | null>(null);
	let roll = $state<number | null>(null);
	/** Kept while the sheet closes, so the title doesn't flip. */
	let shown = $state<'healing' | 'other'>('healing');
	const potions = $derived(c.items.filter((i) => isPotion(i) && (shown === 'healing') === !!healingDice(i)));

	$effect(() => {
		if (!group) return;
		untrack(() => {
			shown = group!;
			viewing = drinking = way = null;
			roll = null;
		});
	});

	let library = $state<MagicItem[] | null>(null);
	$effect(() => {
		if (!group || library) return;
		loadItems().then(
			(x) => (library = x),
			() => {}
		);
	});

	const byId = $derived(new Map((library ?? []).map((m) => [m.id, m])));
	const viewItem = $derived(viewing ? c.items.find((i) => i.id === viewing) : undefined);
	const drinkItem = $derived(drinking ? c.items.find((i) => i.id === drinking) : undefined);
	const dice = $derived(drinkItem ? healingDice(drinkItem) : null);
	const range = $derived(dice ? healingRange(dice) : null);
	let rollInput = $state<HTMLInputElement>();
	// The sheet focuses itself as it opens, so autofocus is ignored; focus the roll once it shows.
	$effect(() => rollInput?.focus());
	const rollOk = $derived(roll !== null && Number.isInteger(roll) && roll >= 0 && roll <= 999);

	// A potion used up while its details or the roll are open drops back to the list.
	$effect(() => {
		if (viewing && !viewItem) viewing = null;
		if (drinking && !drinkItem) drinking = null;
	});

	const meta = (i: InventoryItem) => {
		const d = healingDice(i);
		const r = d ? healingRange(d) : null;
		const temp = potionTempHp(i);
		return [r ? `${d} (up to ${r.max})` : '', temp ? `${temp} temp HP` : '', rarityLabel(i.rarity)].filter(Boolean).join(' · ') || i.type;
	};

	function use(i: InventoryItem) {
		if (healingDice(i)) {
			drinking = i.id;
			way = null;
			roll = null;
			return;
		}
		const temp = potionTempHp(i);
		if (temp) {
			// Temp HP doesn't stack: keep whichever is higher (PHB p.198).
			const label = temp > c.tempHp ? `Drank ${i.name}: ${temp} temp HP` : `Drank ${i.name}. Kept ${c.tempHp} temp HP; temp HP doesn't stack`;
			const drunk = session.mutate(label, (d) => drinkPotion(d, i.id));
			onclose();
			if (drunk?.temp) ondrank({ amount: drunk.temp, temp: true });
			return;
		}
		session.mutate(`Drank ${i.name}`, (d) => drinkPotion(d, i.id));
		if (!potions.length) onclose();
		else viewing = null;
	}

	function heal(amount: number) {
		const i = drinkItem;
		if (!i) return;
		const regains = Math.max(0, Math.min(amount, c.hpMax - Math.max(0, c.hpCurrent)));
		const drunk = session.mutate(`Drank ${i.name}: +${regains} HP`, (d) => drinkPotion(d, i.id, amount));
		onclose();
		if (drunk) ondrank({ amount: drunk.healed, temp: false });
	}

	function back() {
		if (way === 'bonus') way = null;
		else if (drinking) drinking = null;
		else viewing = null;
	}

	const title = $derived(shown === 'healing' ? 'Healing potions' : 'Other potions');
</script>

<Sheet open={!!group} {onclose} label={title}>
	{#if drinkItem && dice && range}
		<button type="button" class="back" onclick={back}>‹ Back</button>
		<div class="head">
			<PotionIcon kind="healing" size={44} />
			<div>
				<h2>{drinkItem.name}</h2>
				<p class="sub">Regain {dice} hit points</p>
			</div>
		</div>
		{#if way !== 'bonus'}
			<p class="ask">How are you drinking it?</p>
			<div class="ways">
				<button type="button" class="way action" onclick={() => heal(range.max)}>
					<strong>Use action</strong>
					<span>Full amount: regain <b>{range.max} HP</b></span>
				</button>
				<button type="button" class="way bonus" onclick={() => (way = 'bonus')}>
					<strong>Use bonus</strong>
					<span>Bonus action: roll {dice} and enter the total</span>
				</button>
			</div>
		{:else}
			<form
				class="roll"
				onsubmit={(e) => {
					e.preventDefault();
					if (rollOk) heal(roll!);
				}}
			>
				<label>
					<span>Roll {dice} and enter the total</span>
					<input type="number" inputmode="numeric" min="0" max="999" step="1" bind:value={roll} placeholder="{range.min}–{range.max}" bind:this={rollInput} />
				</label>
				<button type="submit" class="apply" disabled={!rollOk}>Regain {rollOk ? roll : ''} HP</button>
			</form>
		{/if}
	{:else if viewItem}
		{@const data = viewItem.ref ? byId.get(viewItem.ref) : undefined}
		{@const healing = !!healingDice(viewItem)}
		<button type="button" class="back" onclick={back}>‹ {title}</button>
		<div class="head">
			<PotionIcon kind={healing ? 'healing' : 'other'} size={44} />
			<div>
				<h2>{viewItem.name}</h2>
				<p class="sub">{[viewItem.type, rarityLabel(viewItem.rarity), `${viewItem.quantity} left`].filter(Boolean).join(' · ')}</p>
			</div>
		</div>
		<div class="text">
			{#if data}
				<ItemText item={data} />
			{:else if viewItem.ref && !library}
				<p class="muted">Loading…</p>
			{/if}
			{#if viewItem.notes.trim()}
				{#if data}<p class="notes-label">Your notes</p>{/if}
				<ItemText item={{ text: viewItem.notes }} />
			{/if}
		</div>
		<button type="button" class="apply" class:other={!healing} onclick={() => use(viewItem)}>Use potion</button>
	{:else}
		<div class="head">
			<PotionIcon kind={shown} size={44} />
			<h2>{title}</h2>
		</div>
		{#if potions.length}
			<ul class="list">
				{#each potions as p (p.id)}
					<li>
						<button type="button" class="row" onclick={() => (viewing = p.id)}>
							<b>{p.name}{p.quantity > 1 ? ` ×${p.quantity}` : ''}</b>
							<span>{meta(p)}</span>
						</button>
						<button type="button" class="use" class:other={shown === 'other'} aria-label="Use {p.name}" onclick={() => use(p)}>Use</button>
					</li>
				{/each}
			</ul>
		{:else}
			<p class="muted">None left. Add potions in Inventory.</p>
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
		background: var(--color-heal);
		color: var(--color-on-solid);
		font-weight: 800;
	}

	.use.other,
	.apply.other {
		background: var(--color-spell-ink);
		color: var(--color-spell-bg);
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

	.apply {
		width: 100%;
		height: 54px;
		margin-top: 16px;
		border: 0;
		border-radius: 14px;
		background: var(--color-heal);
		color: var(--color-on-solid);
		font-size: 17px;
		font-weight: 800;
	}

	.apply:disabled {
		opacity: 0.45;
	}

	.ask {
		margin-top: 16px;
		font-weight: 800;
	}

	.ways {
		display: grid;
		gap: 10px;
		margin-top: 10px;
	}

	.way {
		display: flex;
		flex-direction: column;
		align-items: flex-start;
		gap: 2px;
		min-height: 64px;
		padding: 10px 14px;
		border-radius: 14px;
		text-align: left;
		font-weight: 400;
	}

	.way strong {
		font-size: 17px;
		font-weight: 800;
	}

	.way span {
		font-size: 14px;
	}

	.way.action {
		border: 0;
		background: var(--color-heal);
		color: var(--color-on-solid);
		box-shadow: 0 2px 0 var(--color-heal-edge);
	}

	.way.bonus {
		border: 1.5px solid var(--color-border-strong);
		background: var(--color-surface-raised);
		color: var(--color-text);
	}

	.way:active {
		transform: translateY(2px);
		box-shadow: none;
	}

	.roll {
		margin-top: 16px;
	}

	.roll label {
		display: flex;
		flex-direction: column;
		gap: 6px;
	}

	.roll label span {
		font-size: 14px;
		font-weight: 700;
		color: var(--color-text-muted);
	}

	.roll input {
		height: 64px;
		border-radius: 14px;
		text-align: center;
		font-family: var(--font-display);
		font-size: 36px;
		font-weight: 900;
	}
</style>
