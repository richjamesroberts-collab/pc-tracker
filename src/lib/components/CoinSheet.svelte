<script lang="ts">
	import { untrack } from 'svelte';
	import Sheet from './Sheet.svelte';
	import PlaceSheet, { type Destination } from './PlaceSheet.svelte';
	import { session } from '$lib/session.svelte';
	import { addStash, carriedCoins, gainCoinsAt, moveCoinsTo, overLimit, putCoinsAway, spendCarried, wornContainers, type Place } from '$lib/rules/carry';
	import { COINS, coinCount, coinWorth, formatGp, purseOf, spendCoins } from '$lib/rules/coins';
	import type { Character, Coin, Coins } from '$lib/types';

	let { open, stash, onclose }: { open: boolean; /** Coins kept in this stash; what the character carries when absent. */ stash?: string; onclose: () => void } = $props();

	const EMPTY: Coins = { cp: 0, sp: 0, ep: 0, gp: 0, pp: 0 };
	const c = $derived(session.character as Character);
	const place = $derived(stash ? c.stashes.find((s) => s.id === stash) : undefined);
	const purse = $derived(stash ? (purseOf(c, stash) ?? EMPTY) : carriedCoins(c));

	/** Where coins with the character are: each container holding some, and any loose ones. */
	const holders = $derived(
		stash
			? []
			: [
					...c.items.filter((i) => !i.stash && i.container && i.coins && coinCount(i.coins)).map((i) => ({ id: i.id, name: i.name, coins: i.coins! })),
					...(coinCount(c.coins) ? [{ id: '', name: 'Loose, in nothing', coins: c.coins }] : [])
				]
	);

	let coin = $state<Coin>('gp');
	let amount = $state<number | null>(null);
	let counts = $state<Coins>({ ...EMPTY });
	/** The holder whose exact counts are being edited: a container id, '' for loose coins. */
	let holder = $state('');
	/** Choosing where gained or moved coins go. */
	let placing = $state<'gain' | 'move' | null>(null);
	let placeMessage = $state('');

	// Seed when the sheet opens; reading the coins untracked keeps typed counts if Undo runs underneath.
	$effect(() => {
		if (!open) return;
		untrack(() => {
			coin = 'gp';
			amount = null;
			placing = null;
			holder = holders[0]?.id ?? '';
			counts = { ...(stash ? purse : (holders[0]?.coins ?? EMPTY)) };
		});
	});

	const n = $derived(amount !== null && Number.isInteger(amount) && amount > 0 ? amount : 0);
	const copy = () => structuredClone($state.snapshot(c)) as Character;
	const what = $derived(`${n} ${coin}`);
	const where = $derived(place ? ` at ${place.name}` : '');

	/** Coins after spending, or null if they can't cover it. */
	const afterSpend = $derived.by(() => {
		if (!n) return null;
		const next = copy();
		const ok = stash ? spendCoins(next, coin, n, stash) : spendCarried(next, coin, n);
		return ok ? (stash ? purseOf(next, stash)! : carriedCoins(next)) : null;
	});

	const preview = $derived.by(() => {
		if (!n) return '';
		if (!afterSpend) return `Spending needs more than ${stash ? 'is here' : 'you have with you'} (${formatGp(coinWorth(purse))} in all).`;
		const changes = COINS.filter((k) => afterSpend[k] !== purse[k]).map((k) => `${k} ${purse[k]} → ${afterSpend[k]}`);
		return `Spend: ${changes.join(', ')}`;
	});

	function spend() {
		if (!afterSpend) return;
		session.mutate(`Spent ${what}${where}`, (d) => (stash ? spendCoins(d, coin, n, stash) : spendCarried(d, coin, n)));
		onclose();
	}

	function gain() {
		if (!n) return;
		// In a stash, they go there unless it can't carry them; with you, the player says which container.
		if (stash) {
			const next = copy();
			gainCoinsAt(next, coin, n, { stash });
			const problem = overLimit(c, next, { stash });
			if (!problem) {
				session.mutate(`Gained ${what}${where}`, (d) => gainCoinsAt(d, coin, n, { stash }));
				onclose();
				return;
			}
			placeMessage = `${what} won't fit: ${problem}. Where should they go?`;
		} else placeMessage = '';
		placing = 'gain';
	}

	function simulate(to: Place): Character | null {
		const next = copy();
		const ok = placing === 'move' ? moveCoinsTo(next, coin, n, stash, to) : gainCoinsAt(next, coin, n, to);
		return ok ? next : null;
	}

	function placeName(d: Character, to: Place) {
		if (to.inside) return d.items.find((i) => i.id === to.inside)?.name ?? 'the container';
		return d.stashes.find((s) => s.id === to.stash)?.name ?? 'the stash';
	}

	function placed(to: Destination) {
		const mode = placing;
		placing = null;
		session.mutate(null, (d) => {
			const target: Place = to.newPlace ? { stash: addStash(d, 'place', to.newPlace) } : to;
			const ok = mode === 'move' ? moveCoinsTo(d, coin, n, stash, target) : gainCoinsAt(d, coin, n, target);
			if (ok) session.notify(`${mode === 'move' ? 'Moved' : 'Gained'} ${what}: in ${placeName(d, target)}`, { canUndo: true });
		});
		onclose();
	}

	function putAway() {
		session.mutate(null, (d) => {
			const moved = putCoinsAway(d);
			session.notify(moved ? `${moved.toLocaleString('en')} coins put away` : 'No room in a pouch or sack', { canUndo: !!moved, tone: moved ? undefined : 'warn' });
		});
	}

	const canMove = $derived(!!n && purse[coin] >= n);
	const countsValid = $derived(COINS.every((k) => Number.isInteger(counts[k]) && counts[k] >= 0 && counts[k] <= 9_999_999));
	const editing = $derived(stash ? purse : (holders.find((h) => h.id === holder)?.coins ?? EMPTY));
	const countsChanged = $derived(COINS.some((k) => counts[k] !== editing[k]));

	function pickHolder(id: string) {
		holder = id;
		counts = { ...(holders.find((h) => h.id === id)?.coins ?? EMPTY) };
	}

	function saveCounts(e: SubmitEvent) {
		e.preventDefault();
		if (!countsValid || !countsChanged) return;
		const next = $state.snapshot(counts) as Coins;
		const id = holder;
		session.mutate(`Coins updated${where}`, (d) => {
			const p = stash ? purseOf(d, stash) : id ? d.items.find((i) => i.id === id)?.coins : d.coins;
			if (p) Object.assign(p, next);
		});
		onclose();
	}

	const list = (k: Coins) =>
		COINS.filter((x) => k[x])
			.map((x) => `${k[x].toLocaleString('en')} ${x}`)
			.join(', ');
</script>

<Sheet {open} {onclose} label="Coins">
	<div class="title">
		<h2>{place ? `Coins at ${place.name}` : 'Coins with you'}</h2>
		<span class="worth">{formatGp(coinWorth(purse))} in all</span>
	</div>

	{#if holders.length}
		<ul class="holders">
			{#each holders as h (h.id)}
				<li class:loose={!h.id}>
					<b>{h.name}</b> <span>{list(h.coins)}</span>
					{#if !h.id && wornContainers(c).length}<button type="button" onclick={putAway}>Put away</button>{/if}
				</li>
			{/each}
		</ul>
	{/if}

	<div class="coins" role="radiogroup" aria-label="Coin">
		{#each COINS as k (k)}
			<button type="button" role="radio" aria-checked={coin === k} onclick={() => (coin = k)}>
				<span class="code">{k}</span>
				<span class="have">{purse[k].toLocaleString('en')}</span>
			</button>
		{/each}
	</div>

	<label class="field">
		<span>Amount</span>
		<input type="number" inputmode="numeric" min="1" step="1" bind:value={amount} placeholder="0" />
	</label>
	<p class="preview" class:warn={!!n && !afterSpend}>{preview || ' '}</p>

	<div class="actions">
		<button type="button" class="spend" disabled={!afterSpend} onclick={spend}>Spend {n || ''} {coin}</button>
		<button type="button" class="gain" disabled={!n} onclick={gain}>Gain {n || ''} {coin}</button>
	</div>
	<button type="button" class="move" disabled={!canMove} onclick={() => ((placeMessage = ''), (placing = 'move'))}>
		Move {n || ''} {coin} {stash ? 'somewhere else' : 'to another container, mount or place'}
	</button>

	<form class="exact" onsubmit={saveCounts}>
		<h3 class="label">Exact counts</h3>
		{#if !stash && holders.length > 1}
			<div class="tabs" role="radiogroup" aria-label="Which coins">
				{#each holders as h (h.id)}
					<button type="button" role="radio" aria-checked={holder === h.id} onclick={() => pickHolder(h.id)}>{h.name}</button>
				{/each}
			</div>
		{/if}
		{#if stash || holders.length}
			<div class="grid">
				{#each COINS as k (k)}
					<label class="field">
						<span>{k}</span>
						<input type="number" inputmode="numeric" min="0" step="1" bind:value={counts[k]} />
					</label>
				{/each}
			</div>
			<button type="submit" class="save" disabled={!countsValid || !countsChanged}>Save counts</button>
		{:else}
			<p class="preview">No coins with you yet. Gain some into a pouch or sack.</p>
		{/if}
	</form>
</Sheet>

<PlaceSheet
	open={!!placing}
	coins
	title={placing === 'move' ? `Move ${what} to…` : `Where do the ${what} go?`}
	message={placeMessage}
	from={stash ? { stash } : undefined}
	{simulate}
	onpick={placed}
	onclose={() => (placing = null)}
/>

<style>
	.title {
		display: flex;
		align-items: baseline;
		justify-content: space-between;
		gap: 8px;
	}

	h2 {
		font-size: 22px;
	}

	.worth {
		font-size: 14px;
		font-weight: 700;
		color: var(--color-text-muted);
	}

	.coins {
		display: grid;
		grid-template-columns: repeat(5, minmax(0, 1fr));
		gap: 4px;
		margin-top: 12px;
		padding: 4px;
		background: var(--color-chip);
		border-radius: 14px;
	}

	.coins button {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 0;
		min-width: 0;
		padding: 6px 2px;
		border: 0;
		border-radius: 10px;
		background: transparent;
		color: var(--color-text);
	}

	.coins button[aria-checked='true'] {
		background: var(--color-effect-ink);
		color: var(--color-bg);
	}

	.code {
		font-size: 12px;
		font-weight: 800;
		text-transform: uppercase;
		letter-spacing: 0.06em;
	}

	.have {
		max-width: 100%;
		overflow: hidden;
		text-overflow: ellipsis;
		font-size: 15px;
		font-weight: 900;
		font-variant-numeric: tabular-nums;
	}

	.field {
		display: flex;
		flex-direction: column;
		gap: 4px;
		min-width: 0;
		margin-top: 12px;
	}

	.field > span {
		font-size: 13px;
		font-weight: 700;
		color: var(--color-text-muted);
	}

	.field input {
		height: 46px;
		border-radius: 12px;
		width: 100%;
	}

	.preview {
		min-height: 22px;
		margin-top: 6px;
		font-size: 13px;
		font-weight: 700;
		color: var(--color-text-muted);
		font-variant-numeric: tabular-nums;
	}

	.preview.warn {
		color: var(--color-danger);
	}



	.actions {
		display: grid;
		grid-template-columns: repeat(2, minmax(0, 1fr));
		gap: 8px;
		margin-top: 8px;
	}

	.actions button {
		height: 52px;
		border-radius: 14px;
		font-size: 16px;
		font-weight: 800;
	}

	.spend {
		background: var(--color-surface);
		border: 1.5px solid var(--color-effect-ink);
		color: var(--color-effect-ink);
	}

	.gain {
		background: var(--color-effect-ink);
		border: 1.5px solid var(--color-effect-ink);
		color: var(--color-bg);
	}

	.move {
		width: 100%;
		min-height: 46px;
		margin-top: 8px;
		border-radius: 14px;
		background: var(--color-surface);
		border: 1.5px solid var(--color-accent);
		color: var(--color-accent);
		font-weight: 800;
	}

	.holders {
		display: flex;
		flex-direction: column;
		gap: 4px;
		margin: 8px 0 0;
		padding: 0;
		list-style: none;
		font-size: 14px;
	}

	.holders li {
		display: flex;
		align-items: center;
		gap: 6px;
		flex-wrap: wrap;
	}

	.holders span {
		color: var(--color-text-muted);
		font-variant-numeric: tabular-nums;
	}

	.holders .loose b {
		color: var(--color-warning);
	}

	.holders button {
		margin-left: auto;
		min-height: 34px;
		padding: 0 12px;
		background: var(--color-surface);
		border: 1.5px solid var(--color-accent);
		color: var(--color-accent);
		font-weight: 800;
	}

	.tabs {
		display: flex;
		flex-wrap: wrap;
		gap: 6px;
		margin-bottom: 6px;
	}

	.tabs button {
		min-height: 34px;
		padding: 0 12px;
		border-radius: 999px;
		border: 0;
		background: var(--color-chip);
		color: var(--color-text);
		font-size: 13px;
		font-weight: 700;
	}

	.tabs button[aria-checked='true'] {
		background: var(--color-effect-ink);
		color: var(--color-bg);
	}

	.actions button:disabled,
	.move:disabled,
	.save:disabled {
		opacity: 0.45;
	}

	.exact {
		margin-top: 22px;
		padding-top: 14px;
		border-top: 1px solid var(--color-border);
	}

	.grid {
		display: grid;
		grid-template-columns: repeat(5, minmax(0, 1fr));
		gap: 6px;
	}

	.grid .field {
		margin-top: 6px;
	}

	.grid .field > span {
		text-transform: uppercase;
		text-align: center;
	}

	.grid input {
		padding: 0.4rem 0.3rem;
		text-align: center;
	}

	.save {
		width: 100%;
		height: 46px;
		margin-top: 10px;
		border-radius: 14px;
		background: var(--color-surface);
		border: 1.5px solid var(--color-border-strong);
		color: var(--color-text);
		font-weight: 800;
	}
</style>
