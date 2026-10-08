<script lang="ts">
	import { untrack } from 'svelte';
	import Sheet from './Sheet.svelte';
	import { session } from '$lib/session.svelte';
	import { BAG_OF_HOLDING_LB, CARRY_STATUS, carryState, encumbrance, worse } from '$lib/rules/carry';
	import { COINS, coinWorth, formatGp, gainCoins, moveCoins, purseOf, spendCoins } from '$lib/rules/coins';
	import type { Character, Coin, Coins } from '$lib/types';

	let { open, stash, onclose }: { open: boolean; /** Coins kept in this stash; the character's own when absent. */ stash?: string; onclose: () => void } = $props();

	const EMPTY: Coins = { cp: 0, sp: 0, ep: 0, gp: 0, pp: 0 };
	const c = $derived(session.character as Character);
	const place = $derived(stash ? c.stashes.find((s) => s.id === stash) : undefined);
	const purse = $derived(purseOf(c, stash) ?? EMPTY);

	let coin = $state<Coin>('gp');
	let amount = $state<number | null>(null);
	let counts = $state<Coins>({ ...EMPTY });
	/** Where Move sends coins: '' for the character, else a stash id. */
	let target = $state('');

	// Seed when the sheet opens; reading the coins untracked keeps typed counts if Undo runs underneath.
	$effect(() => {
		if (!open) return;
		untrack(() => {
			coin = 'gp';
			amount = null;
			counts = { ...purse };
			target = stash ? '' : (c.stashes[0]?.id ?? '');
		});
	});

	const n = $derived(amount !== null && Number.isInteger(amount) && amount > 0 ? amount : 0);
	const copy = () => structuredClone($state.snapshot(c)) as Character;

	/** Coins after spending, or null if they can't cover it. */
	const afterSpend = $derived.by(() => {
		if (!n) return null;
		const next = copy();
		return spendCoins(next, coin, n, stash) ? purseOf(next, stash)! : null;
	});

	const preview = $derived.by(() => {
		if (!n) return '';
		if (!afterSpend) return `Spending needs more than ${stash ? 'is here' : 'you have'} (${formatGp(coinWorth(purse))} in all).`;
		const changes = COINS.filter((k) => afterSpend[k] !== purse[k]).map((k) => `${k} ${purse[k]} → ${afterSpend[k]}`);
		return `Spend: ${changes.join(', ')}`;
	});

	/** What gaining these coins would mean for carrying them: no pouch to put them in, or too heavy. */
	const gainWarning = $derived.by(() => {
		if (!n) return '';
		const next = copy();
		gainCoins(next, coin, n, stash);
		const state = carryState(next);
		if (place?.kind === 'bag') {
			return (state.stashLoads.get(place.id) ?? 0) > BAG_OF_HOLDING_LB ? `More than the bag's ${BAG_OF_HOLDING_LB} lb.` : '';
		}
		if (stash) return '';
		const was = encumbrance(c);
		const now = encumbrance(next, state.carried);
		const parts: string[] = [];
		const loose = state.looseCoins - carryState(c).looseCoins;
		if (loose > 0) parts.push(`${loose.toLocaleString('en')} of them won't fit in a pouch or sack.`);
		if (worse(now.status, was.status)) parts.push(`You'd be ${CARRY_STATUS[now.status].label.toLowerCase()} (${now.carried} of ${now.capacity} lb).`);
		return parts.join(' ');
	});

	const purses = $derived([{ id: '', name: 'You' }, ...c.stashes.map((s) => ({ id: s.id, name: s.name }))].filter((p) => p.id !== (stash ?? '')));
	const canMove = $derived(!!n && purse[coin] >= n && purses.some((p) => p.id === target));
	const targetName = $derived(purses.find((p) => p.id === target)?.name ?? '');

	const countsValid = $derived(COINS.every((k) => Number.isInteger(counts[k]) && counts[k] >= 0 && counts[k] <= 9_999_999));
	const countsChanged = $derived(COINS.some((k) => counts[k] !== purse[k]));
	const where = $derived(place ? ` at ${place.name}` : '');

	function spend() {
		if (!afterSpend) return;
		session.mutate(`Spent ${n} ${coin}${where}`, (d) => spendCoins(d, coin, n, stash));
		onclose();
	}

	function gain() {
		if (!n) return;
		session.mutate(`Gained ${n} ${coin}${where}`, (d) => gainCoins(d, coin, n, stash));
		onclose();
	}

	function move() {
		if (!canMove) return;
		const to = target || undefined;
		session.mutate(to ? `Left ${n} ${coin} at ${targetName}` : `Took ${n} ${coin} from ${place?.name ?? 'the stash'}`, (d) => moveCoins(d, coin, n, stash, to));
		onclose();
	}

	function saveCounts(e: SubmitEvent) {
		e.preventDefault();
		if (!countsValid || !countsChanged) return;
		const next = $state.snapshot(counts) as Coins;
		session.mutate(`Coins updated${where}`, (d) => {
			const p = purseOf(d, stash);
			if (p) Object.assign(p, next);
		});
		onclose();
	}
</script>

<Sheet {open} {onclose} label="Coins">
	<div class="title">
		<h2>{place ? `Coins at ${place.name}` : 'Coins'}</h2>
		<span class="worth">{formatGp(coinWorth(purse))} in all</span>
	</div>

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
	{#if gainWarning}<p class="preview caution">If gained: {gainWarning}</p>{/if}

	<div class="actions">
		<button type="button" class="spend" disabled={!afterSpend} onclick={spend}>Spend {n || ''} {coin}</button>
		<button type="button" class="gain" disabled={!n} onclick={gain}>Gain {n || ''} {coin}</button>
	</div>

	{#if purses.length}
		<div class="move">
			<label class="field">
				<span>{stash ? 'Move to' : 'Leave with'}</span>
				<select bind:value={target}>
					{#each purses as p (p.id)}
						<option value={p.id}>{p.name}</option>
					{/each}
				</select>
			</label>
			<button type="button" disabled={!canMove} onclick={move}>Move {n || ''} {coin}</button>
		</div>
		{#if n && purse[coin] < n}<p class="preview">Only {purse[coin].toLocaleString('en')} {coin} {stash ? 'here' : 'on you'} to move.</p>{/if}
	{/if}

	<form class="exact" onsubmit={saveCounts}>
		<h3 class="label">Exact counts</h3>
		<div class="grid">
			{#each COINS as k (k)}
				<label class="field">
					<span>{k}</span>
					<input type="number" inputmode="numeric" min="0" step="1" bind:value={counts[k]} />
				</label>
			{/each}
		</div>
		<button type="submit" class="save" disabled={!countsValid || !countsChanged}>Save counts</button>
	</form>
</Sheet>

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

	.preview.caution {
		min-height: 0;
		margin-top: 0;
		color: var(--color-warning);
	}

	.move {
		display: flex;
		align-items: flex-end;
		gap: 8px;
		margin-top: 4px;
	}

	.move .field {
		flex: 1;
	}

	.move select {
		height: 46px;
		border-radius: 12px;
		width: 100%;
	}

	.move button {
		flex-shrink: 0;
		height: 46px;
		border-radius: 12px;
		background: var(--color-surface);
		border: 1.5px solid var(--color-accent);
		color: var(--color-accent);
		font-weight: 800;
	}

	.move button:disabled {
		opacity: 0.45;
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

	.actions button:disabled,
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
