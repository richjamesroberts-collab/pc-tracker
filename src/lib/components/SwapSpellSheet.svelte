<script lang="ts">
	import Sheet from './Sheet.svelte';
	import PickList, { type PickItem } from './PickList.svelte';
	import SpellDetails from './SpellDetails.svelte';
	import { session } from '$lib/session.svelte';
	import { cacheSpell, uncacheSpell } from '$lib/library.svelte';
	import { canSwapTo, swapGrantSpell, type SpellGrant } from '$lib/rules/grants';
	import { ordinal } from '$lib/rules/spellcasting';
	import type { Spell } from '$lib/types';

	let {
		swap,
		pool,
		known,
		onclose
	}: {
		/** The spell in a swappable list (Aberrant Mind, Clockwork Soul) to trade, and the fixed spell it stands for. */
		swap: { grant: SpellGrant; id: string; original: string } | null;
		pool: Spell[];
		/** Spells the character already has, which can't be swapped in. */
		known: Set<string>;
		onclose: () => void;
	} = $props();

	let selected = $state<string[]>([]);

	$effect(() => {
		if (swap) selected = [];
	});

	const byId = $derived(new Map(pool.map((s) => [s.id, s])));
	const current = $derived(swap ? byId.get(swap.id) : undefined);
	const original = $derived(swap ? byId.get(swap.original) : undefined);
	const rule = $derived(swap?.grant.swap);
	const items = $derived.by((): PickItem[] => {
		if (!swap || !current) return [];
		return pool
			.filter((s) => s.id !== swap.id && s.id !== swap.original && canSwapTo(swap.grant, current, s) && !known.has(s.id))
			.map((s) => ({
				id: s.id,
				name: s.name,
				meta: `${s.level === 0 ? 'Cantrip' : `${ordinal(s.level)} level`} · ${s.school}${s.concentration ? ' · Conc' : ''}${s.ritual ? ' · Ritual' : ''}`
			}));
	});

	function apply(to: string) {
		if (!swap || !current) return;
		const s = to === swap.original ? original : byId.get(to);
		if (!s) return;
		const { grant, original: orig } = swap;
		const out = current;
		session.mutate(`Swapped ${out.name} → ${s.name}`, (d) => {
			swapGrantSpell(d, { grant: grant.key, original: orig, to });
			if (!d.spells.some((x) => x.id === out.id)) uncacheSpell(d, out.id);
			cacheSpell(d, s);
		});
		onclose();
	}
</script>

<Sheet open={!!swap} {onclose} label="Replace a {swap?.grant.tag.toLowerCase() ?? ''} spell">
	{#if swap && current}
		<h2>Replace {current.name}</h2>
		<p class="muted">
			{swap.grant.name}: a {rule ? `${rule.schools.join(' or ').toLowerCase()} spell from the ${rule.classes.join(', ')} lists` : 'spell'} of
			the same level. The rules allow one swap each time you gain a level; level up asks for it.
		</p>
		{#if swap.id !== swap.original && original}
			<button type="button" class="restore" onclick={() => apply(swap.original)}>Put back {original.name}</button>
		{/if}
		<PickList {items} bind:selected max={1} label="Replacement" search>
			{#snippet details(item)}{@const s = byId.get(item.id)}{#if s}<SpellDetails spell={s} compact />{/if}{/snippet}
		</PickList>
		<button type="button" class="apply" disabled={!selected[0]} onclick={() => apply(selected[0])}>
			{selected[0] ? `Swap for ${byId.get(selected[0])?.name}` : 'Pick a replacement'}
		</button>
	{/if}
</Sheet>

<style>
	h2 {
		font-size: 22px;
		line-height: 1.15;
		overflow-wrap: anywhere;
	}

	.muted {
		margin: 8px 0 12px;
		font-size: 14px;
		color: var(--color-text-muted);
	}

	.restore {
		width: 100%;
		min-height: 44px;
		margin-bottom: 12px;
		border: 1.5px solid var(--color-border-strong);
		border-radius: 12px;
		background: var(--color-surface);
		color: var(--color-text);
		font-weight: 700;
	}

	.apply {
		width: 100%;
		height: 54px;
		margin-top: 16px;
		border: 0;
		border-radius: 14px;
		background: var(--color-spell-ink);
		color: var(--color-spell-bg);
		font-size: 17px;
		font-weight: 800;
	}

	.apply:disabled {
		opacity: 0.45;
	}
</style>
