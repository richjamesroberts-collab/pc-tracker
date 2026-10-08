<script lang="ts" module>
	import type { ResourceDef } from '$lib/rules/features';
	import type { UseFx as UseFxKind } from '$lib/rules/usable';
	import type { CustomResource } from '$lib/types';

	/** A limited-use feature or custom counter as the card and its sheet show it. */
	export interface CounterRow {
		/** The feature's key, or `custom:<id>`. */
		id: string;
		name: string;
		/** Where it comes from: "Bard", "Protector Aasimar"; empty for custom counters. */
		source: string;
		max: number;
		left: number;
		reset: 'short' | 'long' | 'none';
		die?: string;
		/** What one is called: use, point (Ki), die (superiority dice). */
		unit: [one: string, many: string];
		/** Spent in amounts (Lay on Hands): Use on the card opens the sheet to pick how many. */
		pool: boolean;
		fx: UseFxKind;
		def?: ResourceDef;
		custom?: CustomResource;
	}
</script>

<script lang="ts">
	import Pips from './Pips.svelte';
	import CounterSheet from './CounterSheet.svelte';
	import FeatureSheet from './FeatureSheet.svelte';
	import UseFx from './UseFx.svelte';
	import { session } from '$lib/session.svelte';
	import { CLASS_MAP } from '$lib/data/classes';
	import { RACE_MAP, raceLabel } from '$lib/data/races';
	import {
		featureFx,
		resourceLeft,
		resourcesFor,
		resourceUnit,
		restoreCustom,
		restoreResource,
		spendCustom,
		spendResource
	} from '$lib/rules/features';
	import type { Character } from '$lib/types';

	// Limited-use class, subclass and racial features, plus the player's own counters. Tapping one opens its
	// details; Use spends one (or opens the details to pick how many) and plays an animation over the row.

	/** Rows with more pips than this show as a number instead. */
	const MAX_PIPS = 10;

	const c = $derived(session.character as Character);

	function source(def: ResourceDef): string {
		const { kind, key } = def.owner;
		const subclass = (cls: string, sub?: string) => CLASS_MAP.get(cls)?.subclasses.find((s) => s.key === sub)?.name ?? '';
		if (kind === 'class') return CLASS_MAP.get(key)?.name ?? '';
		if (kind === 'subclass') return subclass(...(key.split('/') as [string, string]));
		if (kind === 'race') return RACE_MAP.get(key)?.name ?? '';
		if (kind === 'subrace') return raceLabel(c);
		return subclass(c.classKey, c.subclassKey);
	}

	const rows = $derived<CounterRow[]>([
		...resourcesFor(c).map((def) => ({
			id: def.key,
			name: def.name,
			source: source(def),
			max: def.max(c),
			left: resourceLeft(c, def),
			reset: def.reset(c),
			die: def.die?.(c),
			unit: resourceUnit(def),
			pool: !!def.pool,
			fx: featureFx(c, def),
			def
		})),
		...c.customResources.map((r) => {
			const max = Math.max(0, Math.floor(r.max));
			return {
				id: `custom:${r.id}`,
				name: r.name,
				source: '',
				max,
				left: Math.min(max, Math.max(0, max - r.used)),
				reset: r.reset,
				unit: ['use', 'uses'] as [string, string],
				pool: false,
				fx: 'arcane' as const,
				custom: r
			};
		})
	]);

	// Details sheet: the row's id, kept live so pips and Use update it.
	let viewing = $state<string | null>(null);
	const viewRow = $derived(viewing ? rows.find((r) => r.id === viewing) : undefined);

	// Custom counter sheet: `editing` is the index of the counter being edited, -1 for a new one.
	let sheetOpen = $state(false);
	let editing = $state(-1);
	const editingCounter = $derived(editing >= 0 ? c.customResources[editing] : undefined);

	const RESET_LABEL = { short: 'Short rest', long: 'Long rest', none: 'No recharge' };
	const count = (n: number, [one, many]: [string, string]) => `${n} ${n === 1 ? one : many}`;

	/** The last feature used, animated over its row; `n` restarts the animation. */
	let fx = $state<{ id: string; kind: UseFxKind; label: string; n: number } | null>(null);
	let fxTimer: ReturnType<typeof setTimeout> | undefined;
	const rowEls: Record<string, HTMLElement> = $state({});

	function spendOne(row: CounterRow, d: Character, n: number) {
		if (row.def) return spendResource(d, row.def.key, n);
		for (let i = 0; i < n; i++) spendCustom(d, row.custom!.id);
	}

	function use(row: CounterRow, n = 1) {
		if (row.left < n || n < 1) return;
		const left = row.left - n;
		const what = row.unit[0] === 'use' && n === 1 ? row.name : `${count(n, row.unit)} of ${row.name}`;
		session.mutate(`Used ${what}, ${left} left`, (d) => spendOne(row, d, n));
		viewing = null;
		clearTimeout(fxTimer);
		fx = { id: row.id, kind: row.fx, label: row.unit[0] === 'use' ? `−${n}` : `−${count(n, row.unit)}`, n: (fx?.n ?? 0) + 1 };
		fxTimer = setTimeout(() => (fx = null), 1900);
		// The sheet covered the bottom of the screen; bring the row into view if it was under it or scrolled off.
		requestAnimationFrame(() => {
			const el = rowEls[row.id];
			const r = el?.getBoundingClientRect();
			if (r && (r.top < 0 || r.bottom > window.innerHeight - 80)) el.scrollIntoView({ behavior: 'smooth', block: 'center' });
		});
	}

	function spend(row: CounterRow) {
		session.mutate(`${row.name} used`, (d) => spendOne(row, d, 1));
	}

	function restore(row: CounterRow) {
		session.mutate(`${row.name} restored`, (d) => (row.def ? restoreResource(d, row.def.key) : restoreCustom(d, row.custom!.id)));
	}

	function openCounter(index: number) {
		editing = index;
		sheetOpen = true;
	}

	function editViewing() {
		const index = c.customResources.findIndex((r) => r.id === viewRow?.custom?.id);
		viewing = null;
		if (index >= 0) openCounter(index);
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
</script>

<section class="card counters" aria-labelledby="counters-title">
	<h2 id="counters-title" class="label">Limited-use features</h2>
	{#each rows as row (row.id)}
		{@const playing = fx?.id === row.id ? fx : null}
		<div class="counter" bind:this={rowEls[row.id]}>
			{#key playing?.n}
				<div class="line {playing ? `fx-${playing.kind}` : ''}">
					<button type="button" class="row" onclick={() => (viewing = row.id)}>
						<span class="name">{row.name}</span>
						<span class="sub">
							{#if row.max > MAX_PIPS}
								<span class="num">{row.left} / {row.max}</span>
							{:else}
								<Pips label={row.name} max={row.max} left={row.left} size={14} />
							{/if}
							<span class="meta">{row.die ? `${row.die} · ` : ''}{RESET_LABEL[row.reset]}</span>
						</span>
					</button>
					<button
						type="button"
						class="use"
						class:pop={!!playing}
						aria-label="Use {row.name}"
						disabled={row.left < 1}
						onclick={() => (row.pool ? (viewing = row.id) : use(row))}>Use</button
					>
				</div>
			{/key}
			{#if playing}
				{#key playing.n}
					<UseFx kind={playing.kind} label={playing.label} />
				{/key}
			{/if}
		</div>
	{/each}

	{#if !rows.length}
		<p class="none">No limited-use features at this level.</p>
	{/if}

	<button type="button" class="add" onclick={() => openCounter(-1)}>Add counter</button>
</section>

<FeatureSheet
	counter={viewRow}
	onclose={() => (viewing = null)}
	onuse={(n) => viewRow && use(viewRow, n)}
	onspend={() => viewRow && spend(viewRow)}
	onrestore={() => viewRow && restore(viewRow)}
	onedit={editViewing}
/>
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

	/* The animation sits over the row, a little wider than it, with a smaller corner than a card's. */
	.counter {
		position: relative;
		margin: 0 -6px;
		padding: 0 6px;
		--fx-ox: 28px;
		--fx-radius: 12px;
		--fx-tag-right: 84px;
	}

	.counter + .counter {
		border-top: 1px solid var(--color-border);
	}

	.line {
		display: flex;
		align-items: center;
		gap: 10px;
	}

	.row {
		flex: 1;
		display: flex;
		flex-direction: column;
		align-items: flex-start;
		gap: 2px;
		min-width: 0;
		min-height: 60px;
		padding: 8px 0;
		border: 0;
		border-radius: 0;
		background: transparent;
		color: var(--color-text);
		font-weight: 400;
		text-align: left;
	}

	.name {
		font-size: 16px;
		font-weight: 700;
		overflow-wrap: anywhere;
	}

	.sub {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 2px 10px;
	}

	.meta {
		font-size: 12px;
		font-weight: 700;
		color: var(--color-text-muted);
		white-space: nowrap;
	}

	.num {
		font-size: 16px;
		font-weight: 900;
		font-variant-numeric: tabular-nums;
		color: var(--color-spell-ink);
	}

	.use {
		flex-shrink: 0;
		height: 40px;
		padding: 0 16px;
		border: 0;
		border-radius: 12px;
		background: var(--color-accent);
		color: var(--color-on-accent);
		font-weight: 800;
	}

	.use:disabled {
		opacity: 0.45;
	}

	/* Using a feature: the button gives, and the row does what the feature does (UseFx). */
	.use.pop {
		animation: pop 0.4s ease-out;
	}

	.fx-lightning {
		animation: jolt 0.45s ease-out 0.1s;
	}

	.fx-strike {
		animation: jolt 0.35s ease-out 0.2s;
	}

	.fx-vanish .row {
		animation: vanish 1.4s ease-in-out;
	}

	@keyframes pop {
		0% {
			transform: scale(1);
		}
		30% {
			transform: scale(0.88);
		}
		65% {
			transform: scale(1.06);
		}
		100% {
			transform: scale(1);
		}
	}

	@keyframes jolt {
		0%,
		100% {
			transform: translateX(0);
		}
		20% {
			transform: translateX(-5px);
		}
		45% {
			transform: translateX(4px);
		}
		70% {
			transform: translateX(-2px);
		}
	}

	@keyframes vanish {
		0%,
		100% {
			opacity: 1;
			filter: none;
		}
		35%,
		60% {
			opacity: 0.12;
			filter: blur(3px);
		}
	}

	@media (prefers-reduced-motion: reduce) {
		.use.pop,
		.fx-lightning,
		.fx-strike,
		.fx-vanish .row {
			animation: none;
		}
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
