<script lang="ts">
	import Sheet from './Sheet.svelte';
	import Pips from './Pips.svelte';
	import { session } from '$lib/session.svelte';
	import { abilityMod, signedMod } from '$lib/rules/abilities';
	import { hitDiceLeft, hitDiceMax, hitDieHealing, shortRest, spendHitDie } from '$lib/rules/resources';
	import { pactSlots } from '$lib/rules/spellcasting';
	import { abilityScores } from '$lib/rules/stats';
	import { hitDie } from '$lib/rules/xp';
	import type { Character } from '$lib/types';

	let { open, onclose }: { open: boolean; onclose: () => void } = $props();

	/** Rows with more pips than this show as a number instead. */
	const MAX_PIPS = 10;

	const c = $derived(session.character as Character);
	const die = $derived(hitDie(c.classKey));
	const left = $derived(hitDiceLeft(c));
	const max = $derived(hitDiceMax(c));
	const con = $derived(abilityMod(abilityScores(c).con));
	const full = $derived(c.hpCurrent >= c.hpMax);

	/** The hit die roll the player made. */
	let roll = $state<number | null>(null);

	$effect(() => {
		if (open) roll = null;
	});

	const rollOk = $derived(Number.isInteger(roll) && roll! >= 1 && roll! <= die);
	const heal = $derived(rollOk ? hitDieHealing(c, roll!) : 0);

	function spend(e: SubmitEvent) {
		e.preventDefault();
		if (!rollOk || left < 1) return;
		const r = roll!;
		const hp = heal;
		session.mutate(`Hit die spent: +${hp} HP`, (d) => spendHitDie(d, r));
		roll = null;
	}

	function finish() {
		session.mutate('Short rest taken', shortRest);
		onclose();
	}
</script>

<Sheet {open} {onclose} label="Short rest">
	<h2>Short rest</h2>
	<p class="muted">Spend hit dice to heal, then finish the rest to get short-rest features{pactSlots(c) ? ' and pact slots' : ''} back.</p>

	<div class="dice">
		<div class="dice-head">
			<span class="label">Hit dice · d{die}</span>
			<span class="hp">HP {c.hpCurrent} / {c.hpMax}</span>
		</div>
		{#if max > MAX_PIPS}
			<span class="num">{left} / {max}</span>
		{:else}
			<Pips label="Hit dice" {max} {left} size={18} />
		{/if}
	</div>

	{#if left < 1}
		<p class="muted">No hit dice left. Half come back on a long rest.</p>
	{:else}
		<form class="spend" onsubmit={spend}>
			<label class="field">
				<span>Your d{die} roll</span>
				<input
					type="number"
					inputmode="numeric"
					min="1"
					max={die}
					step="1"
					bind:value={roll}
					placeholder="1–{die}"
					aria-invalid={roll !== null && !rollOk}
				/>
			</label>
			<button type="submit" class="primary" disabled={!rollOk || full}>{rollOk ? `Spend: +${heal} HP` : 'Spend hit die'}</button>
		</form>
		<p class="muted small">{full ? 'Hit points are full.' : `CON ${signedMod(con)} is added to each roll.`}</p>
	{/if}

	<button type="button" class="finish" onclick={finish}>Finish short rest</button>
</Sheet>

<style>
	h2 {
		font-size: 22px;
	}

	.muted {
		margin-top: 4px;
		font-size: 14px;
		color: var(--color-text-muted);
	}

	.small {
		font-size: 13px;
	}

	.dice {
		display: flex;
		flex-direction: column;
		gap: 8px;
		margin-top: 14px;
		padding: 12px 14px;
		border-radius: var(--radius-lg);
		background: var(--color-surface-raised);
	}

	.dice-head {
		display: flex;
		justify-content: space-between;
		align-items: baseline;
		gap: 8px;
	}

	.hp {
		font-size: 14px;
		font-weight: 800;
		font-variant-numeric: tabular-nums;
	}

	.num {
		font-family: var(--font-display);
		font-size: 22px;
		font-weight: 900;
		font-variant-numeric: tabular-nums;
	}

	.spend {
		display: grid;
		grid-template-columns: minmax(0, 1fr) auto;
		align-items: end;
		gap: 8px;
		margin-top: 14px;
	}

	.field {
		display: flex;
		flex-direction: column;
		gap: 4px;
		min-width: 0;
	}

	.field span {
		font-size: 13px;
		font-weight: 700;
		color: var(--color-text-muted);
	}

	.field input {
		height: 48px;
		border-radius: 12px;
		width: 100%;
	}

	.primary {
		height: 48px;
		padding: 0 18px;
		border: 0;
		border-radius: 14px;
		background: var(--color-heal);
		color: var(--color-on-solid);
		font-size: 16px;
		font-weight: 800;
	}

	.primary:disabled {
		opacity: 0.45;
	}

	.finish {
		width: 100%;
		height: 52px;
		margin-top: 18px;
		border: 0;
		border-radius: 14px;
		background: var(--color-accent);
		color: var(--color-on-accent);
		font-size: 17px;
		font-weight: 800;
	}
</style>
