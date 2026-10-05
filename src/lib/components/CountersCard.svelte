<script lang="ts">
	import Pips from './Pips.svelte';
	import CounterSheet from './CounterSheet.svelte';
	import { session } from '$lib/session.svelte';
	import { resourceLeft, resourcesFor, restoreCustom, restoreResource, spendCustom, spendResource, type ResourceDef } from '$lib/rules/features';
	import type { Character, CustomResource } from '$lib/types';

	// Limited-use class, subclass and racial features, plus the player's own counters.

	/** Rows with more pips than this show as a number with −/+ buttons instead. */
	const MAX_PIPS = 10;

	const c = $derived(session.character as Character);
	const defs = $derived(resourcesFor(c));

	// Sheet state: `editing` is the index of the custom counter being edited, -1 for a new one.
	let sheetOpen = $state(false);
	let editing = $state(-1);
	const editingCounter = $derived(editing >= 0 ? c.customResources[editing] : undefined);

	const RESET_LABEL = { short: 'Short rest', long: 'Long rest', none: 'No recharge' };
	const resetLabel = (kind: CustomResource['reset']) => RESET_LABEL[kind];

	function spend(def: ResourceDef, n = 1) {
		session.mutate(`${def.name} used`, (d) => spendResource(d, def.key, n));
	}

	function restore(def: ResourceDef, n = 1) {
		session.mutate(`${def.name} restored`, (d) => restoreResource(d, def.key, n));
	}

	function openCounter(index: number) {
		editing = index;
		sheetOpen = true;
	}

	function saveCounter(r: CustomResource) {
		const index = editing;
		if (index >= 0) {
			session.mutate(`${r.name} saved`, (d) => {
				if (d.customResources[index]) d.customResources[index] = r;
			});
		} else {
			session.mutate(`${r.name} added`, (d) => {
				d.customResources.push(r);
			});
		}
	}

	function deleteCounter() {
		const index = editing;
		const name = c.customResources[index]?.name ?? 'Counter';
		session.mutate(`${name} deleted`, (d) => {
			d.customResources.splice(index, 1);
		});
	}

	function spendCounter(r: CustomResource) {
		session.mutate(`${r.name} used`, (d) => spendCustom(d, r.id));
	}

	function restoreCounter(r: CustomResource) {
		session.mutate(`${r.name} restored`, (d) => restoreCustom(d, r.id));
	}
</script>

<section class="card counters" aria-labelledby="counters-title">
	<h2 id="counters-title" class="label">Limited-use features</h2>
	{#each defs as def (def.key)}
		{@const max = def.max(c)}
		{@const left = resourceLeft(c, def)}
		<div class="counter">
			<div class="head">
				<span class="name">{def.name}</span>
				<span class="meta">{def.die ? `${def.die(c)} · ` : ''}{resetLabel(def.reset(c))}</span>
			</div>
			{#if def.pool}
				<div class="stepper">
					<span class="num">{left} / {max}</span>
					<button type="button" disabled={left < 1} onclick={() => spend(def, 1)}>−1</button>
					<button type="button" disabled={left < 5} onclick={() => spend(def, 5)}>−5</button>
					<button type="button" disabled={left >= max} onclick={() => restore(def, 1)}>+1</button>
					<button type="button" disabled={left + 5 > max} onclick={() => restore(def, 5)}>+5</button>
				</div>
			{:else if max > MAX_PIPS}
				<div class="stepper">
					<span class="num">{left} / {max}</span>
					<button type="button" aria-label="Use {def.name}" disabled={left < 1} onclick={() => spend(def)}>−</button>
					<button type="button" aria-label="Restore {def.name}" disabled={left >= max} onclick={() => restore(def)}>+</button>
				</div>
			{:else}
				<Pips label={def.name} {max} {left} onspend={() => spend(def)} onrestore={() => restore(def)} />
			{/if}
		</div>
	{/each}

	{#each c.customResources as r, i (`${r.id}-${i}`)}
		{@const max = Math.max(0, Math.floor(r.max))}
		{@const left = Math.min(max, Math.max(0, max - r.used))}
		<div class="counter">
			<div class="head">
				<button type="button" class="edit" aria-label="Edit {r.name}" onclick={() => openCounter(i)}>
					<span class="name">{r.name}</span>
					<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 20h4L19 9l-4-4L4 16zM14 6l4 4" /></svg>
				</button>
				<span class="meta">{resetLabel(r.reset)}</span>
			</div>
			{#if max > MAX_PIPS}
				<div class="stepper">
					<span class="num">{left} / {max}</span>
					<button type="button" aria-label="Use {r.name}" disabled={left < 1} onclick={() => spendCounter(r)}>−</button>
					<button type="button" aria-label="Restore {r.name}" disabled={left >= max} onclick={() => restoreCounter(r)}>+</button>
				</div>
			{:else}
				<Pips label={r.name} {max} {left} onspend={() => spendCounter(r)} onrestore={() => restoreCounter(r)} />
			{/if}
		</div>
	{/each}

	{#if !defs.length && !c.customResources.length}
		<p class="none">No limited-use features at this level.</p>
	{/if}

	<button type="button" class="add" onclick={() => openCounter(-1)}>Add counter</button>
</section>

<CounterSheet
	open={sheetOpen}
	counter={editingCounter}
	onsave={saveCounter}
	ondelete={deleteCounter}
	onclose={() => (sheetOpen = false)}
/>
<style>
	.counters {
		margin-top: 12px;
		padding: 14px 12px 12px 16px;
	}

	.counters > .label {
		margin-bottom: 2px;
	}

	.counter {
		padding: 10px 0 4px;
	}

	.counter + .counter {
		border-top: 1px solid var(--color-border);
	}

	.head {
		display: flex;
		align-items: baseline;
		justify-content: space-between;
		gap: 8px;
		min-width: 0;
	}

	.name {
		font-size: 16px;
		font-weight: 700;
		overflow-wrap: anywhere;
	}

	.meta {
		flex-shrink: 0;
		font-size: 13px;
		font-weight: 700;
		color: var(--color-text-muted);
		white-space: nowrap;
	}

	.edit {
		display: inline-flex;
		align-items: center;
		gap: 6px;
		min-width: 0;
		min-height: 32px;
		padding: 0;
		border: 0;
		border-radius: 0;
		background: transparent;
		color: var(--color-text);
		text-align: left;
	}

	.edit svg {
		width: 16px;
		height: 16px;
		flex-shrink: 0;
		fill: none;
		stroke: var(--color-text-faint);
		stroke-width: 2;
		stroke-linecap: round;
		stroke-linejoin: round;
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

	.none {
		padding: 12px 0 4px;
		font-size: 14px;
		color: var(--color-text-muted);
	}

	.add {
		width: 100%;
		min-height: 44px;
		margin-top: 10px;
		border-radius: 12px;
		border: 1.5px dashed var(--color-border-strong);
		background: transparent;
		color: var(--color-accent);
		font-weight: 800;
	}
</style>
