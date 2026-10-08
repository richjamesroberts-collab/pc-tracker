<script lang="ts">
	import { untrack } from 'svelte';
	import Sheet from './Sheet.svelte';
	import ItemText from './ItemText.svelte';
	import Pips from './Pips.svelte';
	import SpellDetails from './SpellDetails.svelte';
	import { loadContent, loadOptions, resourceFeature, type ClassOptionData, type Content } from '$lib/data/content';
	import { BUILTIN_SPELLS } from '$lib/library.svelte';
	import type { CounterRow } from './CountersCard.svelte';

	let {
		counter,
		onclose,
		onuse,
		onspend,
		onrestore,
		onedit
	}: {
		/** The counter whose details are showing; undefined when closed. */
		counter: CounterRow | undefined;
		onclose: () => void;
		/** Use it, spending `n`; the card closes this sheet and plays the animation. */
		onuse: (n: number) => void;
		onspend: () => void;
		onrestore: () => void;
		/** Edit a custom counter. */
		onedit: () => void;
	} = $props();

	/** More than this shows as a number with a give-back button instead of pips. */
	const MAX_PIPS = 20;

	const open = $derived(!!counter);
	/** How many to spend on the next use (Ki points, Lay on Hands, Healing Light dice). */
	let spend = $state(1);

	$effect(() => {
		if (!open) return;
		untrack(() => (spend = 1));
	});

	let content = $state<Content | null>(null);
	let options = $state<ClassOptionData[] | null>(null);
	$effect(() => {
		if (!open || (content && options)) return;
		Promise.all([loadContent(), loadOptions()]).then(
			([c, o]) => ((content = c), (options = o)),
			() => {}
		);
	});

	const feature = $derived(counter?.def && content && options ? resourceFeature(content, options, counter.def) : undefined);
	/** A racial spell (Darkness, Misty Step) or Star Map's Guiding Bolt: its spell, below the trait. */
	const spell = $derived.by(() => {
		const name = counter?.def?.name.replace(/\s*\(.*\)$/, '').toLowerCase();
		return name ? BUILTIN_SPELLS.find((s) => s.name.toLowerCase() === name) : undefined;
	});

	// Never more than are left, so a use from the pips doesn't leave the stepper above it.
	$effect(() => {
		if (counter && spend > Math.max(1, counter.left)) spend = Math.max(1, counter.left);
	});

	const RESET = {
		short: 'Comes back on a short or long rest',
		long: 'Comes back on a long rest',
		none: "Doesn't come back on a rest; give uses back by hand"
	};
	const count = (n: number, [one, many]: [string, string]) => `${n} ${n === 1 ? one : many}`;
	const title = (s: string) => s[0].toUpperCase() + s.slice(1);
</script>

<Sheet {open} {onclose} label={counter?.name ?? 'Feature'}>
	{#if counter}
		{@const [, many] = counter.unit}
		<h2>{counter.name}</h2>
		{#if counter.source || counter.die}<p class="sub">{[counter.source, counter.die].filter(Boolean).join(' · ')}</p>{/if}

		<div class="uses">
			<div class="uses-head">
				<span class="label">{title(many)}</span>
				<span class="count">{counter.left} / {counter.max}</span>
			</div>
			{#if counter.max <= MAX_PIPS}
				<Pips label={counter.name} max={counter.max} left={counter.left} size={18} {onspend} {onrestore} />
			{:else}
				<button type="button" class="back-one" disabled={counter.left >= counter.max} onclick={onrestore}>Give 1 back</button>
			{/if}
			<p class="reset">{RESET[counter.reset]}</p>
		</div>

		<div class="text">
			{#if counter.def}
				{#if feature}
					{#if feature.name !== counter.name}<p class="from">{feature.name}</p>{/if}
					<ItemText item={feature} />
				{:else if !(content && options)}
					<p class="muted">Loading…</p>
				{/if}
				{#if spell}
					<div class="spell"><SpellDetails {spell} /></div>
				{/if}
			{:else}
				<p class="muted">Your own counter.</p>
			{/if}
		</div>

		{#if counter.left > 1}
			<div class="spend">
				<span>{title(many)} to spend</span>
				<div class="stepper">
					<button type="button" aria-label="One fewer" disabled={spend <= 1} onclick={() => (spend = Math.max(1, spend - 1))}>−</button>
					<b>{spend}</b>
					<button type="button" aria-label="One more" disabled={spend >= counter.left} onclick={() => (spend = Math.min(counter.left, spend + 1))}
						>+</button
					>
				</div>
			</div>
		{/if}
		<button type="button" class="apply" disabled={counter.left < spend} onclick={() => onuse(spend)}>
			{#if counter.left < 1}
				None left
			{:else if counter.unit[0] === 'use' && spend === 1}
				Use {counter.name}
			{:else}
				Use {count(spend, counter.unit)}
			{/if}
		</button>
		{#if counter.custom}
			<button type="button" class="edit" onclick={onedit}>Edit counter</button>
		{/if}
	{/if}
</Sheet>

<style>
	h2 {
		font-size: 22px;
		line-height: 1.15;
		overflow-wrap: anywhere;
	}

	.sub {
		margin-top: 2px;
		font-size: 13px;
		color: var(--color-text-muted);
	}

	.uses {
		margin-top: 14px;
		padding: 10px 12px;
		border: 1px solid var(--color-border);
		border-radius: 14px;
		background: var(--color-surface-raised);
	}

	.uses-head {
		display: flex;
		justify-content: space-between;
		align-items: baseline;
		margin-bottom: 8px;
	}

	.count {
		font-family: var(--font-display);
		font-size: 18px;
		font-weight: 900;
		font-variant-numeric: tabular-nums;
	}

	.back-one {
		height: 40px;
		padding: 0 14px;
		border: 1.5px solid var(--color-spell-edge);
		border-radius: 12px;
		background: var(--color-surface);
		color: var(--color-spell-ink);
		font-weight: 800;
	}

	.back-one:disabled {
		opacity: 0.4;
	}

	.reset {
		margin-top: 6px;
		font-size: 12px;
		color: var(--color-text-muted);
	}

	.text {
		margin-top: 14px;
	}

	.from {
		margin-bottom: 6px;
		font-size: 13px;
		font-weight: 800;
		color: var(--color-text-muted);
	}

	.spell {
		margin-top: 14px;
		padding-top: 12px;
		border-top: 1px solid var(--color-border);
	}

	.muted {
		font-size: 14px;
		color: var(--color-text-muted);
	}

	.spend {
		display: flex;
		justify-content: space-between;
		align-items: center;
		gap: 12px;
		margin-top: 16px;
		font-weight: 800;
	}

	.stepper {
		display: flex;
		align-items: center;
		gap: 4px;
	}

	.stepper button {
		width: 44px;
		height: 44px;
		border-radius: 12px;
		font-size: 22px;
		font-weight: 800;
	}

	.stepper button:disabled {
		opacity: 0.4;
	}

	.stepper b {
		min-width: 36px;
		font-family: var(--font-display);
		font-size: 24px;
		font-weight: 900;
		text-align: center;
		font-variant-numeric: tabular-nums;
	}

	.apply {
		width: 100%;
		height: 54px;
		margin-top: 16px;
		border: 0;
		border-radius: 14px;
		background: var(--color-accent);
		color: var(--color-on-accent);
		font-size: 17px;
		font-weight: 800;
		overflow-wrap: anywhere;
	}

	.apply:disabled {
		opacity: 0.45;
	}

	.edit {
		width: 100%;
		height: 46px;
		margin-top: 8px;
		border: 1.5px solid var(--color-border-strong);
		border-radius: 14px;
		background: transparent;
		color: var(--color-accent);
		font-weight: 800;
	}
</style>
