<script lang="ts">
	import Sheet from './Sheet.svelte';
	import { loadBeasts } from '$lib/data/content';
	import { session } from '$lib/session.svelte';
	import { beastLimit, canBecome, crLabel, shapeCost, shapeHours } from '$lib/rules/wildshape';
	import type { Beast, Character } from '$lib/types';

	let {
		open,
		left,
		onclose,
		onpick
	}: {
		open: boolean;
		/** Uses of Wild Shape left. */
		left: number;
		onclose: () => void;
		onpick: (beast: Beast) => void;
	} = $props();

	const c = $derived(session.character as Character);
	let beasts = $state.raw<Beast[]>([]);
	let failed = $state(false);
	let attempt = $state(0);
	let query = $state('');
	let expanded = $state<string | null>(null);

	$effect(() => {
		if (!open) return;
		void attempt;
		failed = false;
		loadBeasts().then(
			(b) => (beasts = b),
			() => (failed = true)
		);
	});

	const limit = $derived(beastLimit(c));
	const rules = $derived(
		[`Up to CR ${crLabel(limit.maxCr)}`, !limit.fly && !limit.swim ? 'no flying or swimming speed' : !limit.fly ? 'no flying speed' : '', `up to ${shapeHours(c)} ${shapeHours(c) === 1 ? 'hour' : 'hours'}`]
			.filter(Boolean)
			.join(' · ')
	);
	const options = $derived.by(() => {
		const q = query.trim().toLowerCase();
		return beasts.filter((b) => canBecome(c, b) && (!q || b.name.toLowerCase().includes(q)));
	});
	/** Grouped by CR, highest first: the strongest forms are what's usually wanted. */
	const groups = $derived.by(() => {
		const byCr = new Map<string, Beast[]>();
		for (const b of [...options].sort((x, y) => y.crValue - x.crValue)) {
			const key = b.elemental ? 'Elementals' : `CR ${b.cr}`;
			byCr.set(key, [...(byCr.get(key) ?? []), b]);
		}
		return [...byCr];
	});
	const speedText = (b: Beast) =>
		Object.entries(b.speed)
			.map(([k, v]) => (k === 'walk' ? `${v} ft` : `${k} ${v} ft`))
			.join(', ');
</script>

<Sheet {open} {onclose} label="Choose a wild shape">
	<h2>Wild Shape</h2>
	<p class="sub">{rules}</p>
	<p class="note">A beast you've seen before. Check with your DM.</p>

	<input type="search" bind:value={query} placeholder="Search beasts" aria-label="Search beasts" autocomplete="off" />

	{#if failed}
		<div class="status" role="alert">
			<p>Couldn't load the beasts</p>
			<button type="button" onclick={() => attempt++}>Retry</button>
		</div>
	{:else if !beasts.length}
		<p class="status">Loading…</p>
	{:else if !options.length}
		<p class="status">No beasts match.</p>
	{/if}

	{#each groups as [title, list] (title)}
		<h3 class="label">{title}</h3>
		<ul class="list">
			{#each list as b (b.id)}
				{@const cost = shapeCost(c, b)}
				<li>
					<button type="button" class="row" aria-expanded={expanded === b.id} onclick={() => (expanded = expanded === b.id ? null : b.id)}>
						<span class="name">{b.name}</span>
						<span class="meta">{b.size} · AC {b.ac} · {b.hp} HP · {speedText(b)}</span>
					</button>
					{#if expanded === b.id}
						<div class="details">
							<p class="scores"><b>STR</b> {b.str} <b>DEX</b> {b.dex} <b>CON</b> {b.con}</p>
							{#each b.attacks as a (a.name)}
								<p><b>{a.name}</b> +{a.toHit}, {a.damage}</p>
							{/each}
							{#each [...b.traits, ...b.actions] as t (t.name)}
								<p><b>{t.name}.</b> {t.text}</p>
							{/each}
							<button type="button" class="go" disabled={left < cost} onclick={() => onpick(b)}>
								{left < cost ? 'Not enough uses' : `Become ${b.name}${cost > 1 ? ` (${cost} uses)` : ''}`}
							</button>
						</div>
					{/if}
				</li>
			{/each}
		</ul>
	{/each}
</Sheet>

<style>
	h2 {
		font-size: 22px;
	}

	.sub {
		margin-top: 2px;
		font-size: 14px;
		font-weight: 700;
	}

	.note {
		margin-top: 2px;
		font-size: 13px;
		color: var(--color-text-muted);
	}

	input {
		width: 100%;
		height: 46px;
		margin-top: 12px;
		padding: 0 12px;
		border-radius: 12px;
	}

	.label {
		margin: 16px 4px 6px;
	}

	.list {
		list-style: none;
		border: 1px solid var(--color-border);
		border-radius: 14px;
		overflow: hidden;
	}

	.list li + li {
		border-top: 1px solid var(--color-border);
	}

	.row {
		display: flex;
		flex-direction: column;
		align-items: flex-start;
		width: 100%;
		height: auto;
		min-height: 56px;
		padding: 8px 12px;
		border: 0;
		border-radius: 0;
		background: transparent;
		color: var(--color-text);
		text-align: left;
		font-weight: 400;
	}

	.name {
		font-size: 16px;
		font-weight: 700;
	}

	.meta {
		font-size: 13px;
		color: var(--color-text-muted);
	}

	.details {
		display: flex;
		flex-direction: column;
		gap: 6px;
		padding: 0 12px 12px;
		font-size: 14px;
		line-height: 1.4;
	}

	.scores b + b,
	.scores b {
		margin-left: 8px;
	}

	.scores b:first-child {
		margin-left: 0;
	}

	.go {
		width: 100%;
		height: 50px;
		margin-top: 6px;
		border: 0;
		border-radius: 14px;
		background: var(--color-accent);
		color: var(--color-on-accent);
		font-size: 16px;
		font-weight: 800;
	}

	.go:disabled {
		opacity: 0.45;
	}

	.status {
		margin-top: 16px;
		text-align: center;
		font-weight: 700;
		color: var(--color-text-muted);
	}

	.status button {
		margin-top: 8px;
		min-height: 40px;
		background: var(--color-surface);
		border: 1.5px solid var(--color-border-strong);
		color: var(--color-text);
		font-weight: 800;
	}
</style>
