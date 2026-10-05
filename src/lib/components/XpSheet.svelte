<script lang="ts">
	import { resolve } from '$app/paths';
	import Sheet from './Sheet.svelte';
	import { session } from '$lib/session.svelte';
	import { MAX_LEVEL, xpProgress } from '$lib/rules/xp';
	import type { Character } from '$lib/types';

	let { open, onclose }: { open: boolean; onclose: () => void } = $props();

	const c = $derived(session.character as Character);
	const progress = $derived(xpProgress(c));

	let amount = $state<number | null>(null);

	$effect(() => {
		if (!open) return;
		amount = null;
	});

	const amountOk = $derived(Number.isInteger(amount) && amount! > 0 && amount! <= 1000000);
	const fmt = (n: number) => n.toLocaleString('en');

	function addXp(e: SubmitEvent) {
		e.preventDefault();
		if (!amountOk) return;
		const n = amount!;
		const total = Math.min(9999999, c.xp + n);
		session.mutate(`+${fmt(n)} XP (${fmt(total)} total)`, (d) => {
			d.xp = total;
		});
		amount = null;
	}

	/** Take back XP added by mistake. The level stays; change it in Edit if it needs to go down. */
	function removeXp() {
		if (!amountOk) return;
		const n = Math.min(amount!, c.xp);
		const total = c.xp - n;
		session.mutate(`−${fmt(n)} XP (${fmt(total)} total)`, (d) => {
			d.xp = total;
		});
		amount = null;
	}
</script>

<Sheet {open} {onclose} label="Experience">
	<h2>Level {c.level}{c.milestone ? '' : ` · ${fmt(c.xp)} XP`}</h2>
	{#if progress.next === null}
		<p class="muted">Level {MAX_LEVEL}: the highest there is.</p>
	{:else if c.milestone}
		<p class="muted">Milestone levelling: level up when your DM says so.</p>
	{:else}
		<p class="muted">
			{progress.ready ? `Enough for level ${c.level + 1}` : `${fmt(progress.next - c.xp)} XP to level ${c.level + 1} (${fmt(progress.next)})`}
		</p>
	{/if}

	{#if !c.milestone}
		<form class="add" onsubmit={addXp}>
			<label class="field">
				<span>XP</span>
				<input type="number" inputmode="numeric" min="1" step="1" bind:value={amount} placeholder="450" />
			</label>
			<div class="actions">
				<button type="button" class="secondary" disabled={!amountOk || c.xp === 0} onclick={removeXp}>Remove</button>
				<button type="submit" class="primary" disabled={!amountOk}>Add XP</button>
			</div>
		</form>
		<a class="edit-link" href={resolve('/c/[id]/edit', { id: c.id })}>Set or reset base XP from the Edit character page</a>
	{/if}

	{#if c.level < MAX_LEVEL && (progress.ready || c.milestone)}
		<section class="level" aria-labelledby="levelup-title">
			<h3 id="levelup-title">Level up to {c.level + 1}</h3>
			<p class="muted">Step through hit points, new features and the choices this level brings.</p>
			<a class="primary" href={resolve('/c/[id]/level-up', { id: c.id })} onclick={onclose}>Level up</a>
		</section>
	{/if}
</Sheet>

<style>
	h2 {
		font-size: 22px;
	}

	h3 {
		font-size: 18px;
	}

	.muted {
		margin-top: 4px;
		font-size: 14px;
		color: var(--color-text-muted);
	}

	.add {
		display: flex;
		flex-direction: column;
		gap: 8px;
		margin-top: 14px;
	}

	.actions {
		display: grid;
		grid-template-columns: minmax(0, 1fr) minmax(0, 2fr);
		gap: 8px;
	}

	.secondary {
		height: 48px;
		padding: 0 12px;
		border-radius: 14px;
		background: var(--color-surface);
		border: 1.5px solid var(--color-border-strong);
		color: var(--color-text);
		font-size: 16px;
		font-weight: 800;
	}

	.secondary:disabled {
		opacity: 0.45;
	}

	.edit-link {
		display: block;
		margin-top: 10px;
		padding: 6px 0;
		font-size: 13px;
		font-weight: 700;
		color: var(--color-accent);
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
		background: var(--color-accent);
		color: var(--color-on-accent);
		font-size: 16px;
		font-weight: 800;
	}

	.primary:disabled {
		opacity: 0.45;
	}

	.level {
		display: flex;
		flex-direction: column;
		gap: 10px;
		margin-top: 18px;
		padding: 14px;
		border-radius: var(--radius-lg);
		background: var(--color-ready-bg);
		border: 1px solid var(--color-ready-edge);
	}

	.level h3,
	.level .muted {
		color: var(--color-ready-ink);
		margin-top: 0;
	}

	.level .primary {
		display: flex;
		align-items: center;
		justify-content: center;
		background: var(--color-heal);
		color: var(--color-on-solid);
		text-decoration: none;
	}
</style>
