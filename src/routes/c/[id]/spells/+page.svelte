<script lang="ts">
	import { resolve } from '$app/paths';
	import Pips from '$lib/components/Pips.svelte';
	import CastSheet from '$lib/components/CastSheet.svelte';
	import FontOfMagicSheet from '$lib/components/FontOfMagicSheet.svelte';
	import { session } from '$lib/session.svelte';
	import { characterSpells, missingSpellIds, nameFromId, spellMeta } from '$lib/library.svelte';
	import { longRest, restoreSlot, shortRest, sorceryPointsLeft, sorceryPointsMax, spendSlot } from '$lib/rules/resources';
	import {
		arcanumLevels,
		ordinal,
		pactSlots,
		prepStyle,
		slotMax,
		slotsLeft,
		spellAttack,
		spellLimit,
		spellSaveDC
	} from '$lib/rules/spellcasting';
	import type { Character, Spell } from '$lib/types';

	const c = $derived(session.character as Character);
	const style = $derived(prepStyle(c));
	const prepares = $derived(style === 'prepared' || style === 'spellbook');
	const pact = $derived(pactSlots(c));
	const arcanum = $derived(arcanumLevels(c));
	const spMax = $derived(sorceryPointsMax(c));
	const all = $derived(characterSpells(c));
	const missing = $derived(missingSpellIds(c));
	const cantrips = $derived(all.filter((x) => x.spell.level === 0));
	const levelled = $derived(all.filter((x) => x.spell.level > 0));
	const preparedCount = $derived(levelled.filter((x) => x.prepared).length);
	const limit = $derived(spellLimit(c));

	let preparing = $state(false);
	let casting = $state<Spell | null>(null);
	let fontOpen = $state(false);

	const shown = $derived(preparing || !prepares ? levelled : levelled.filter((x) => x.prepared));
	const groups = $derived.by(() => {
		const byLevel = new Map<number, typeof shown>();
		for (const x of shown) byLevel.set(x.spell.level, [...(byLevel.get(x.spell.level) ?? []), x]);
		return [...byLevel.entries()];
	});

	function togglePrepared(id: string) {
		session.mutate(null, (ch) => {
			const s = ch.spells.find((x) => x.id === id);
			if (s) s.prepared = !s.prepared;
		});
	}
</script>

<div class="top">
	<h1>Spells</h1>
	<div class="rests">
		<button type="button" onclick={() => session.mutate('Short rest taken', shortRest)}>Short rest</button>
		<button type="button" onclick={() => session.mutate('Long rest: HP, slots and points restored', longRest)}>Long rest</button>
	</div>
</div>

<section class="card slots">
	<div class="head">
		<h2 class="label">Spell slots</h2>
		<span class="label">+{spellAttack(c)} to hit · DC {spellSaveDC(c)}</span>
	</div>

	{#each slotMax(c) as max, i (i)}
		{@const level = i + 1}
		{@const total = max + (c.bonusSlots[level] ?? 0)}
		<div class="row">
			<b>{ordinal(level)}</b>
			<Pips
				label="{ordinal(level)}-level slot"
				max={total}
				left={slotsLeft(c, level)}
				onspend={() => session.mutate(`Used a ${ordinal(level)}-level slot`, (ch) => spendSlot(ch, level))}
				onrestore={() => session.mutate(`Got a ${ordinal(level)}-level slot back`, (ch) => restoreSlot(ch, level))}
			/>
			<span class="count">{slotsLeft(c, level)} left</span>
		</div>
	{/each}

	{#if pact}
		<div class="row">
			<b>Pact</b>
			<Pips
				label="pact slot"
				max={pact.count}
				left={pact.count - c.pactSlotsUsed}
				onspend={() => session.mutate('Used a pact slot', (ch) => (ch.pactSlotsUsed += 1))}
				onrestore={() => session.mutate('Got a pact slot back', (ch) => (ch.pactSlotsUsed = Math.max(0, ch.pactSlotsUsed - 1)))}
			/>
			<span class="count">{ordinal(pact.level)} level</span>
		</div>
	{/if}

	{#each arcanum as level (level)}
		{@const used = c.arcanumUsed.includes(level)}
		<div class="row">
			<b>{ordinal(level)}</b>
			<Pips
				label="{ordinal(level)}-level Mystic Arcanum"
				max={1}
				left={used ? 0 : 1}
				onspend={() => session.mutate(`Used ${ordinal(level)}-level arcanum`, (ch) => (ch.arcanumUsed = [...ch.arcanumUsed, level]))}
				onrestore={() => session.mutate(`Restored ${ordinal(level)}-level arcanum`, (ch) => (ch.arcanumUsed = ch.arcanumUsed.filter((l) => l !== level)))}
			/>
			<span class="count">Arcanum</span>
		</div>
	{/each}

	{#if spMax}
		<div class="sp">
			<div class="head">
				<h2 class="label">Sorcery points</h2>
				<span class="sp-count">{sorceryPointsLeft(c)} / {spMax}</span>
			</div>
			<Pips
				label="sorcery point"
				shape="diamond"
				max={spMax}
				left={sorceryPointsLeft(c)}
				onspend={() => session.mutate('Spent a sorcery point', (ch) => (ch.sorceryPointsUsed += 1))}
				onrestore={() => session.mutate('Got a sorcery point back', (ch) => (ch.sorceryPointsUsed = Math.max(0, ch.sorceryPointsUsed - 1)))}
			/>
			<button type="button" class="font" onclick={() => (fontOpen = true)}>Font of Magic: convert slots and points</button>
		</div>
	{/if}
</section>

{#if c.concentration}
	<div class="conc">
		<span>Concentrating · {c.concentration}</span>
		<button
			type="button"
			aria-label="End concentration on {c.concentration}"
			onclick={() => session.mutate(`Stopped concentrating on ${c.concentration}`, (ch) => (ch.concentration = undefined))}
		>×</button>
	</div>
{/if}

{#if missing.length}
	<div class="missing" role="note">
		<p>
			{missing.length} of your spells need a spell pack on this phone:
			{missing.map(nameFromId).join(', ')}.
		</p>
		<a href={resolve('/packs')}>Import a spell pack</a>
	</div>
{/if}

{#if all.length === 0 && !missing.length}
	<div class="empty card">
		<p>No spells yet.</p>
		<a href={resolve('/c/[id]/book', { id: c.id })}>Add spells from the spellbook</a>
	</div>
{:else}
	{#if cantrips.length}
		<h2 class="label group">Cantrips</h2>
		<div class="chips">
			{#each cantrips as { spell } (spell.id)}
				<button type="button" onclick={() => (casting = spell)}>{spell.name}</button>
			{/each}
		</div>
	{/if}

	{#if prepares && levelled.length}
		<div class="prep">
			<span>Prepared <b class:over={preparedCount > limit}>{preparedCount} / {limit}</b></span>
			<button type="button" aria-pressed={preparing} onclick={() => (preparing = !preparing)}>
				{preparing ? 'Done' : 'Change prepared'}
			</button>
		</div>
	{/if}

	{#each groups as [level, list] (level)}
		<h2 class="label group">{ordinal(level)} level</h2>
		<ul class="card list">
			{#each list as { spell, prepared } (spell.id)}
				<li>
					{#if preparing}
						<label class="spell prep-row">
							<input type="checkbox" checked={prepared} onchange={() => togglePrepared(spell.id)} />
							<span class="info">
								<span class="name">{spell.name}</span>
								<span class="meta">{spellMeta(spell)}</span>
							</span>
						</label>
					{:else}
						<button type="button" class="spell" onclick={() => (casting = spell)}>
							<span class="info">
								<span class="name">
									{spell.name}
									{#if spell.concentration}<span class="tag">Conc</span>{/if}
									{#if spell.ritual}<span class="tag">Ritual</span>{/if}
								</span>
								<span class="meta">{spellMeta(spell)}</span>
							</span>
							<span class="cast">Cast</span>
						</button>
					{/if}
				</li>
			{/each}
		</ul>
	{/each}

	{#if prepares && !preparing && levelled.length > 0 && preparedCount === 0}
		<p class="hint">No spells prepared. Tap "Change prepared" to pick today's spells.</p>
	{/if}
{/if}

<CastSheet spell={casting} onclose={() => (casting = null)} />
<FontOfMagicSheet open={fontOpen} onclose={() => (fontOpen = false)} />

<style>
	.top {
		display: flex;
		align-items: center;
		justify-content: space-between;
		margin-bottom: 12px;
	}

	h1 {
		font-size: 26px;
		font-weight: 900;
	}

	.rests {
		display: flex;
		gap: 6px;
	}

	.rests button {
		height: 38px;
		background: var(--color-surface);
		border: 1.5px solid var(--color-border-strong);
		color: var(--color-text);
		font-size: 13px;
		font-weight: 700;
	}

	.slots {
		padding: 12px 12px 12px 16px;
	}

	.head {
		display: flex;
		justify-content: space-between;
		align-items: center;
		margin-bottom: 4px;
	}

	.row {
		display: flex;
		align-items: center;
		gap: 4px;
	}

	.row b {
		width: 44px;
		flex-shrink: 0;
	}

	.count {
		margin-left: auto;
		padding-left: 8px;
		font-size: 13px;
		font-weight: 700;
		color: var(--color-text-muted);
		white-space: nowrap;
	}

	.sp {
		margin-top: 10px;
		padding-top: 12px;
		border-top: 1px dashed var(--color-border);
	}

	.sp-count {
		font-size: 14px;
		font-weight: 800;
		color: var(--color-effect-ink);
	}

	.font {
		width: 100%;
		min-height: 44px;
		margin-top: 6px;
		border-radius: 12px;
		border: 1.5px solid var(--color-effect-edge);
		background: var(--color-effect-bg);
		color: var(--color-effect-ink);
		font-weight: 800;
	}

	.conc {
		display: inline-flex;
		align-items: center;
		gap: 8px;
		margin-top: 12px;
		height: 40px;
		padding: 0 4px 0 14px;
		border-radius: 999px;
		background: var(--color-conc-bg);
		border: 1px solid var(--color-conc-edge);
		color: var(--color-conc-ink);
		font-size: 14px;
		font-weight: 700;
	}

	.conc button {
		width: 32px;
		height: 32px;
		padding: 0;
		border: 0;
		border-radius: 50%;
		background: var(--color-conc-edge);
		color: var(--color-conc-ink);
		font-size: 18px;
		font-weight: 800;
	}

	.group {
		margin: 18px 4px 6px;
	}

	.chips {
		display: flex;
		flex-wrap: wrap;
		gap: 6px;
	}

	.chips button {
		min-height: 40px;
		background: var(--color-spell-bg);
		border: 1px solid var(--color-spell-edge);
		color: var(--color-spell-ink);
		font-size: 14px;
		font-weight: 700;
	}

	.prep {
		display: flex;
		align-items: center;
		justify-content: space-between;
		margin-top: 18px;
		font-size: 14px;
		font-weight: 600;
	}

	.prep b.over {
		color: var(--color-danger);
	}

	.prep button {
		min-height: 40px;
		background: var(--color-surface);
		border: 1.5px solid var(--color-spell-edge);
		color: var(--color-spell-ink);
		font-weight: 800;
	}

	.prep button[aria-pressed='true'] {
		background: var(--color-spell-ink);
		color: var(--color-bg);
	}

	.list {
		list-style: none;
		overflow: hidden;
	}

	.list li + li {
		border-top: 1px solid var(--color-border);
	}

	.spell {
		display: flex;
		align-items: center;
		gap: 10px;
		width: 100%;
		min-height: 60px;
		padding: 8px 12px;
		border: 0;
		border-radius: 0;
		background: transparent;
		color: var(--color-text);
		text-align: left;
		font-weight: 400;
	}

	.prep-row input {
		width: 22px;
		height: 22px;
		accent-color: var(--color-spell-ink);
		flex-shrink: 0;
	}

	.info {
		flex: 1;
		min-width: 0;
		display: flex;
		flex-direction: column;
	}

	.name {
		font-size: 16px;
		font-weight: 700;
	}

	.tag {
		font-size: 11px;
		font-weight: 800;
		padding: 1px 6px;
		border-radius: 6px;
		background: var(--color-conc-bg);
		color: var(--color-conc-ink);
		vertical-align: 2px;
	}

	.meta {
		font-size: 13px;
		color: var(--color-text-muted);
	}

	.cast {
		display: flex;
		align-items: center;
		height: 40px;
		padding: 0 16px;
		border-radius: 999px;
		background: var(--color-spell-ink);
		color: var(--color-bg);
		font-size: 14px;
		font-weight: 800;
	}

	.missing {
		margin-top: 14px;
		padding: 12px 14px;
		border-radius: var(--radius-lg);
		background: var(--color-alert-bg);
		border: 1px solid var(--color-alert-edge);
		color: var(--color-alert-ink);
		font-size: 14px;
		font-weight: 600;
	}

	.missing a {
		display: inline-block;
		margin-top: 6px;
		color: inherit;
		font-weight: 800;
	}

	.empty {
		margin-top: 16px;
		padding: 20px;
		text-align: center;
		color: var(--color-text-muted);
	}

	.empty a,
	.hint {
		color: var(--color-accent);
		font-weight: 700;
	}

	.hint {
		margin-top: 10px;
		font-size: 14px;
		color: var(--color-text-muted);
	}
</style>
