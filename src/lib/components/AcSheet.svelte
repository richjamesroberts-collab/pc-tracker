<script lang="ts">
	import { untrack } from 'svelte';
	import Sheet from './Sheet.svelte';
	import { session } from '$lib/session.svelte';
	import { armorClass, setAcTotal } from '$lib/rules/stats';
	import type { Character } from '$lib/types';

	let { open, onclose }: { open: boolean; onclose: () => void } = $props();

	const c = $derived(session.character as Character);

	let ac = $state<number | null>(10);

	// Seed when the sheet opens, so Undo underneath doesn't overwrite what's typed.
	$effect(() => {
		if (!open) return;
		untrack(() => (ac = c.ac));
	});

	const valid = $derived(ac !== null && Number.isInteger(ac) && ac >= 0 && ac <= 40);

	function step(n: number) {
		ac = Math.min(40, Math.max(0, (ac ?? c.ac) + n));
	}

	function save(e: SubmitEvent) {
		e.preventDefault();
		if (!valid || ac === null) return;
		const next = ac;
		if (next !== c.ac) session.mutate(`AC ${c.ac} → ${next}`, (d) => setAcTotal(d, next));
		onclose();
	}

	const breakdown = $derived(armorClass(c));

	function clearAdjustment() {
		session.mutate(`AC adjustment cleared`, (d) => (d.acAdjust = 0));
		onclose();
	}
</script>

<Sheet {open} {onclose} label="Armor class">
	<h2>Armor class</h2>
	<p class="muted">{breakdown.parts.map((p) => `${p.label} ${p.value}`).join(' · ')}</p>
	<p class="muted small">
		{c.acAuto
			? 'Changes here are a temporary adjustment on top of your armor, for things like the Shield spell or cover.'
			: 'Changes here update the AC you entered. Magic item bonuses are added on top.'}
	</p>
	<form onsubmit={save}>
		<div class="row">
			<button type="button" aria-label="Lower AC by 1" onclick={() => step(-1)}>−</button>
			<input type="number" inputmode="numeric" min="0" max="40" step="1" aria-label="Armor class" bind:value={ac} />
			<button type="button" aria-label="Raise AC by 1" onclick={() => step(1)}>+</button>
		</div>
		{#if c.acAuto && c.acAdjust}
			<button type="button" class="clear" onclick={clearAdjustment}>Clear the {c.acAdjust > 0 ? '+' : ''}{c.acAdjust} adjustment</button>
		{/if}
		<button type="submit" class="save" disabled={!valid || ac === c.ac}>Set AC{valid && ac !== c.ac ? ` ${c.ac} → ${ac}` : ''}</button>
	</form>
</Sheet>

<style>
	h2 {
		font-size: 22px;
	}

	.muted {
		font-size: 14px;
		color: var(--color-text-muted);
	}

	form {
		display: flex;
		flex-direction: column;
		gap: 12px;
		margin-top: 14px;
	}

	.row {
		display: grid;
		grid-template-columns: 64px minmax(0, 1fr) 64px;
		gap: 10px;
	}

	.row button {
		height: 64px;
		border-radius: 16px;
		border: 1.5px solid var(--color-accent);
		background: var(--color-surface);
		color: var(--color-accent);
		font-size: 28px;
		font-weight: 800;
	}

	.row input {
		height: 64px;
		width: 100%;
		border-radius: 16px;
		text-align: center;
		font-family: var(--font-display);
		font-size: 36px;
		font-weight: 900;
	}

	.small {
		margin-top: 4px;
		font-size: 13px;
	}

	.clear {
		height: 44px;
		border-radius: 14px;
		background: var(--color-surface);
		border: 1.5px solid var(--color-border-strong);
		color: var(--color-text);
		font-weight: 800;
	}

	.save {
		height: 52px;
		border: 0;
		border-radius: 14px;
		background: var(--color-accent);
		color: var(--color-on-accent);
		font-size: 16px;
		font-weight: 800;
	}

	.save:disabled {
		opacity: 0.45;
	}
</style>
