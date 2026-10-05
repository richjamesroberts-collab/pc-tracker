<script lang="ts">
	import Sheet from './Sheet.svelte';
	import Breakdown from './Breakdown.svelte';
	import { session } from '$lib/session.svelte';
	import { signedMod } from '$lib/rules/abilities';
	import { changeQuantity } from '$lib/rules/items';
	import type { Attack } from '$lib/rules/attacks';

	let { attack, onclose }: { attack: Attack | null; onclose: () => void } = $props();

	// Keep showing the last attack while the sheet slides away.
	let shown = $state<Attack | null>(null);
	$effect(() => {
		if (attack) shown = attack;
	});

	function useAmmo(a: Attack) {
		const ammo = a.ammo;
		if (!ammo?.itemId || ammo.count < 1) return;
		session.mutate(`${ammo.name}: ${ammo.count - 1} left`, (d) => changeQuantity(d, ammo.itemId!, -1));
	}
</script>

<Sheet open={!!attack} {onclose} label={shown ? `${shown.name} attack` : 'Attack'}>
	{#if shown}
		{@const live = attack ?? shown}
		<h2>{live.name}</h2>
		<p class="muted">{[live.reach, live.properties].filter(Boolean).join(' · ')}</p>

		<div class="numbers">
			<div class="num hit">
				<span class="k">To hit</span>
				<strong>{signedMod(live.toHit)}</strong>
			</div>
			<div class="num dmg">
				<span class="k">Damage</span>
				<strong>{live.damage}</strong>
				{#if live.versatile}<span class="two">Two hands: {live.versatile}</span>{/if}
			</div>
		</div>

		<h3 class="k">How it’s worked out</h3>
		<Breakdown caption="To hit" parts={live.hitParts} total={signedMod(live.toHit)} />
		<Breakdown caption="Damage" parts={live.damageParts} total={live.damage} />

		{#if live.notes.length}
			<h3 class="k">At the table (not in the numbers)</h3>
			<ul class="notes">
				{#each live.notes as n (n)}<li>{n}</li>{/each}
			</ul>
		{/if}

		{#if live.ammo}
			<div class="ammo">
				<span><b>{live.ammo.count}</b> {live.ammo.name.toLowerCase()} left</span>
				<button type="button" disabled={!live.ammo.itemId || live.ammo.count < 1} onclick={() => useAmmo(live)}>Use one</button>
			</div>
		{/if}
	{/if}
</Sheet>

<style>
	h2 {
		font-size: 22px;
	}

	.muted {
		margin-top: 2px;
		font-size: 14px;
		color: var(--color-text-muted);
	}

	.numbers {
		display: grid;
		grid-template-columns: minmax(0, 1fr) minmax(0, 2fr);
		gap: 8px;
		margin-top: 12px;
	}

	.num {
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		padding: 10px 6px;
		border-radius: 14px;
		background: var(--color-surface-raised);
		text-align: center;
	}

	.num .k {
		font-size: 11px;
		font-weight: 800;
		letter-spacing: 0.06em;
		text-transform: uppercase;
		color: var(--color-text-muted);
	}

	.num strong {
		font-family: var(--font-display);
		font-size: 24px;
		font-weight: 900;
		line-height: 1.2;
	}

	.num.hit strong {
		color: var(--color-accent);
	}

	.num .two {
		font-size: 13px;
		font-weight: 700;
		color: var(--color-text-muted);
	}

	h3.k {
		margin-top: 16px;
		font-size: 11px;
		font-weight: 800;
		letter-spacing: 0.06em;
		text-transform: uppercase;
		color: var(--color-text-muted);
	}

	.notes {
		list-style: none;
		margin-top: 8px;
		display: flex;
		flex-direction: column;
		gap: 6px;
		font-size: 14px;
	}

	.notes li {
		padding: 8px 12px;
		border-radius: 12px;
		background: var(--color-effect-bg);
		color: var(--color-effect-ink);
		font-weight: 600;
	}

	.ammo {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 8px;
		margin-top: 14px;
		font-size: 15px;
	}

	.ammo button {
		min-height: 44px;
		background: var(--color-surface);
		border: 1.5px solid var(--color-border-strong);
		color: var(--color-text);
		font-weight: 800;
	}

	.ammo button:disabled {
		opacity: 0.45;
	}
</style>
