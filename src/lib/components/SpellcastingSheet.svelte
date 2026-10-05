<script lang="ts">
	import { resolve } from '$app/paths';
	import Sheet from './Sheet.svelte';
	import Breakdown from './Breakdown.svelte';
	import { session } from '$lib/session.svelte';
	import { signedMod } from '$lib/rules/abilities';
	import { abilityBreakdown, spellcasting } from '$lib/rules/stats';
	import { SPELL_ABILITY } from '$lib/rules/spellcasting';
	import { CLASS_MAP } from '$lib/data/classes';
	import type { Character } from '$lib/types';

	/** Spellcasting modifier, spell save DC and spell attack bonus, and how each is worked out. */
	let { open, onclose }: { open: boolean; onclose: () => void } = $props();

	const c = $derived(session.character as Character);
	const s = $derived(spellcasting(c, abilityBreakdown(c)));
</script>

<Sheet {open} {onclose} label="Spellcasting">
	<h2>Spellcasting</h2>
	<p class="muted">{[CLASS_MAP.get(c.classKey)?.name, SPELL_ABILITY[c.classKey]].filter(Boolean).join(' · ')}</p>

	<div class="numbers">
		<div class="num"><span class="k">Ability</span><strong>{signedMod(s.ability.total)}</strong></div>
		<div class="num"><span class="k">Save DC</span><strong>{s.dc.total}</strong></div>
		<div class="num"><span class="k">Attack</span><strong>{signedMod(s.attack.total)}</strong></div>
	</div>

	<h3 class="k">How it’s worked out</h3>
	<Breakdown caption="Spell save DC" parts={s.dc.parts} total={`${s.dc.total}`} />
	<Breakdown caption="Spell attack bonus" parts={s.attack.parts} total={signedMod(s.attack.total)} />

	<a class="edit-link" href={resolve('/c/[id]/edit', { id: c.id })}>Change the spellcasting modifier in Edit</a>
</Sheet>

<style>
	h2 {
		font-size: 22px;
	}

	.muted {
		margin-top: 2px;
		font-size: 14px;
		color: var(--color-text-muted);
	}

	.numbers {
		display: grid;
		grid-template-columns: repeat(3, minmax(0, 1fr));
		gap: 8px;
		margin-top: 12px;
	}

	.num {
		display: flex;
		flex-direction: column;
		align-items: center;
		padding: 8px 4px;
		border-radius: 14px;
		background: var(--color-spell-bg);
	}

	.num strong {
		font-family: var(--font-display);
		font-size: 26px;
		font-weight: 900;
		color: var(--color-spell-ink);
		font-variant-numeric: tabular-nums;
	}

	.k {
		font-size: 11px;
		font-weight: 800;
		letter-spacing: 0.06em;
		text-transform: uppercase;
		color: var(--color-text-muted);
	}

	h3.k {
		margin-top: 16px;
	}

	.edit-link {
		display: block;
		margin-top: 12px;
		padding: 12px 0;
		text-align: center;
		color: var(--color-accent);
		font-weight: 800;
	}
</style>
