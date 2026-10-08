import type { Character, Coin, Coins } from '$lib/types';

/** Largest first, the order coins are shown in. */
export const COINS: Coin[] = ['pp', 'gp', 'ep', 'sp', 'cp'];

/** Worth of one coin in copper. */
export const COIN_VALUE: Record<Coin, number> = { cp: 1, sp: 10, ep: 50, gp: 100, pp: 1000 };

export const coinCount = (coins: Coins) => COINS.reduce((n, k) => n + coins[k], 0);

/** Everything the character has, in copper. */
export const coinWorth = (coins: Coins) => COINS.reduce((n, k) => n + coins[k] * COIN_VALUE[k], 0);

/** "12.5 gp" from copper. */
export function formatGp(cp: number): string {
	const gp = cp / 100;
	return `${Number.isInteger(gp) ? gp : gp.toFixed(2).replace(/0$/, '')} gp`;
}

/** The coins on the character, or kept in a stash (by id). Undefined for a stash that doesn't exist. */
export function purseOf(c: Pick<Character, 'coins' | 'stashes'>, stash?: string): Coins | undefined {
	return stash ? c.stashes?.find((x) => x.id === stash)?.coins : c.coins;
}

export function gainCoins(c: Character, coin: Coin, n: number, stash?: string): boolean {
	const purse = purseOf(c, stash);
	if (!purse || !Number.isInteger(n) || n <= 0) return false;
	purse[coin] += n;
	return true;
}

/** Spend `n` coins of a kind from the character's coins or a stash's; see `pay`. */
export function spendCoins(c: Character, coin: Coin, n: number, stash?: string): boolean {
	const purse = purseOf(c, stash);
	const after = purse && pay(purse, coin, n);
	if (!purse || !after) return false;
	Object.assign(purse, after);
	return true;
}

/**
 * Pay `n` coins of a kind, the way you would at a shop: first with that coin and smaller ones,
 * then by breaking bigger coins and taking change back in coins no bigger than the one asked for
 * (skipping electrum unless that's what was asked for). Returns the coins left, or null if they
 * can't cover it.
 */
export function pay(coins: Coins, coin: Coin, n: number): Coins | null {
	if (!Number.isInteger(n) || n <= 0) return null;
	let due = n * COIN_VALUE[coin];
	if (coinWorth(coins) < due) return null;
	const purse = { ...coins };

	// Same coin or smaller, biggest first, never overpaying.
	for (const k of COINS.filter((k) => COIN_VALUE[k] <= COIN_VALUE[coin])) {
		const take = Math.min(purse[k], Math.floor(due / COIN_VALUE[k]));
		purse[k] -= take;
		due -= take * COIN_VALUE[k];
	}

	// Break bigger coins, smallest first.
	for (const k of [...COINS].reverse().filter((k) => COIN_VALUE[k] > COIN_VALUE[coin])) {
		if (due <= 0) break;
		const take = Math.min(purse[k], Math.ceil(due / COIN_VALUE[k]));
		purse[k] -= take;
		due -= take * COIN_VALUE[k];
	}

	// Safety net if the coins taken so far can't make the amount exactly: one more coin that covers it.
	if (due > 0) {
		const k = [...COINS].reverse().find((k) => purse[k] > 0 && COIN_VALUE[k] >= due);
		if (!k) return null;
		purse[k] -= 1;
		due -= COIN_VALUE[k];
	}

	let change = -due;
	for (const k of COINS.filter((k) => COIN_VALUE[k] <= COIN_VALUE[coin] && (k !== 'ep' || coin === 'ep'))) {
		const give = Math.floor(change / COIN_VALUE[k]);
		purse[k] += give;
		change -= give * COIN_VALUE[k];
	}
	return purse;
}
