<script lang="ts">
	import { session } from '$lib/session.svelte';
	import { isDead, rollDeathSave, stabilise, type DeathSaveRoll } from '$lib/rules/hp';
	import type { Character } from '$lib/types';

	let { onheal, ondamage }: { onheal: () => void; ondamage: () => void } = $props();

	const c = $derived(session.character as Character);
	const dead = $derived(isDead(c));

	const LABELS: Record<DeathSaveRoll, string> = {
		success: 'Death save: success',
		failure: 'Death save: failure',
		nat20: 'Nat 20! Back up with 1 HP',
		nat1: 'Nat 1: two failures'
	};

	function roll(r: DeathSaveRoll) {
		session.mutate(LABELS[r], (ch) => rollDeathSave(ch, r));
		const after = session.character!;
		if (isDead(after)) session.notify(`${after.name} has died.`, { tone: 'warn', canUndo: true });
		else if (after.stable && r !== 'nat20') session.notify('Three successes. You are stable.', { canUndo: true });
	}
</script>

<section class="card" class:dead aria-labelledby="ds-title">
	<div class="head">
		<h2 id="ds-title" class="label">Death saves</h2>
		<span class="status">{dead ? 'Dead' : c.stable ? 'Stable · unconscious' : 'Unconscious'}</span>
	</div>

	<div class="row">
		<span class="name">Successes</span>
		<div class="marks" role="img" aria-label="{c.deathSaves.successes} of 3 successes">
			{#each { length: 3 }, i}
				<span class="mark ok" class:on={i < c.deathSaves.successes}>
					{#if i < c.deathSaves.successes}
						<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7.5" /></svg>
					{/if}
				</span>
			{/each}
		</div>
	</div>
	<div class="row">
		<span class="name">Failures</span>
		<div class="marks" role="img" aria-label="{c.deathSaves.failures} of 3 failures">
			{#each { length: 3 }, i}
				<span class="mark bad" class:on={i < c.deathSaves.failures}>
					{#if i < c.deathSaves.failures}
						<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18" /></svg>
					{/if}
				</span>
			{/each}
		</div>
	</div>

	{#if !dead && !c.stable}
		<p class="label rolled">I rolled…</p>
		<div class="grid">
			<button type="button" class="solid ok" onclick={() => roll('success')}>10 or higher</button>
			<button type="button" class="solid bad" onclick={() => roll('failure')}>9 or lower</button>
			<button type="button" class="soft ok" onclick={() => roll('nat20')}>Nat 20 · up with 1 HP</button>
			<button type="button" class="soft bad" onclick={() => roll('nat1')}>Nat 1 · two failures</button>
		</div>
	{/if}

	<div class="grid actions">
		<button type="button" class="plain" onclick={onheal}>Healed</button>
		{#if !dead}
			<button type="button" class="plain" onclick={ondamage}>Hit while down</button>
		{/if}
		{#if !dead && !c.stable}
			<button type="button" class="plain wide" onclick={() => session.mutate('Stabilised', (ch) => stabilise(ch))}>
				Stabilised (Medicine check or Spare the Dying)
			</button>
		{/if}
	</div>
</section>

<style>
	section {
		padding: 18px 16px;
		border: 2px solid var(--color-used-edge);
	}

	section.dead {
		border-color: var(--color-border-strong);
	}

	.head {
		display: flex;
		justify-content: space-between;
		align-items: baseline;
	}

	.status {
		font-size: 14px;
		font-weight: 700;
		color: var(--color-used-ink);
	}

	.row {
		display: flex;
		align-items: center;
		justify-content: space-between;
		margin-top: 14px;
	}

	.name {
		font-weight: 800;
	}

	.marks {
		display: flex;
		gap: 12px;
	}

	.mark {
		width: 48px;
		height: 48px;
		border-radius: 50%;
		box-sizing: border-box;
		display: flex;
		align-items: center;
		justify-content: center;
		color: var(--color-on-solid);
	}

	.mark.ok {
		border: 3px solid var(--color-ready-edge);
	}
	.mark.bad {
		border: 3px solid var(--color-used-edge);
	}
	.mark.ok.on {
		background: var(--color-heal);
		border-color: var(--color-heal);
	}
	.mark.bad.on {
		background: var(--color-hit);
		border-color: var(--color-hit);
	}

	.mark svg {
		width: 24px;
		height: 24px;
		fill: none;
		stroke: currentColor;
		stroke-width: 3;
		stroke-linecap: round;
		stroke-linejoin: round;
	}

	.rolled {
		margin-top: 20px;
	}

	.grid {
		display: grid;
		grid-template-columns: repeat(2, minmax(0, 1fr));
		gap: 8px;
		margin-top: 8px;
	}

	.grid button {
		min-height: 52px;
		border-radius: 14px;
		font-size: 15px;
		font-weight: 800;
		padding: 6px 8px;
	}

	.solid {
		border: 0;
		color: var(--color-on-solid);
	}
	.solid.ok {
		background: var(--color-heal);
	}
	.solid.bad {
		background: var(--color-hit);
	}

	.soft.ok {
		background: var(--color-ready-bg);
		border: 1.5px solid var(--color-ready-edge);
		color: var(--color-ready-ink);
	}
	.soft.bad {
		background: var(--color-used-bg);
		border: 1.5px solid var(--color-used-edge);
		color: var(--color-used-ink);
	}

	.actions {
		margin-top: 14px;
	}

	.plain {
		background: var(--color-surface);
		border: 1.5px solid var(--color-border-strong);
		color: var(--color-text);
	}

	.wide {
		grid-column: 1 / -1;
		font-size: 14px !important;
		font-weight: 700 !important;
	}
</style>
