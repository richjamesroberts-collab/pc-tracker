<script lang="ts">
	import CheckSheet, { type Check } from '$lib/components/CheckSheet.svelte';
	import { session } from '$lib/session.svelte';
	import { ABILITY_SHORT, signedMod } from '$lib/rules/abilities';
	import { abilityBreakdown } from '$lib/rules/stats';
	import { savingThrows } from '$lib/rules/saves';
	import type { Ability, Character } from '$lib/types';

	const c = $derived(session.character as Character);
	const saves = $derived(savingThrows(c, abilityBreakdown(c)));
	/** The save whose sheet is open. */
	let open = $state<Ability | null>(null);
	const check = $derived.by((): Check | null => {
		const s = saves.find((x) => x.ability === open);
		return s ? { ...s, name: `${s.name} save`, sub: s.proficient ? 'Proficient' : 'Not proficient' } : null;
	});
</script>

<section class="saves" aria-labelledby="saves-title">
	<h2 id="saves-title" class="label">Saving throws</h2>
	<div class="save-row">
		{#each saves as s (s.ability)}
			<button
				type="button"
				class="save"
				aria-label="{s.name} saving throw {signedMod(s.total)}{s.proficient ? ', proficient' : ''}. Tap for details."
				onclick={() => (open = s.ability)}
			>
				<span class="abbr"><span class="prof" class:proficient={s.proficient} aria-hidden="true"></span>{ABILITY_SHORT[s.ability]}</span>
				<strong>{signedMod(s.total)}</strong>
			</button>
		{/each}
	</div>
</section>

<CheckSheet {check} edit="Change saving throw proficiencies in Edit" onclose={() => (open = null)} />

<style>
	.saves {
		margin-top: 10px;
	}

	.label {
		margin: 0 4px 6px;
	}

	.save-row {
		display: grid;
		grid-template-columns: repeat(6, minmax(0, 1fr));
		gap: 6px;
	}

	.save {
		display: flex;
		flex-direction: column;
		align-items: center;
		min-width: 0;
		min-height: 48px;
		padding: 5px 2px;
		border: 1px solid var(--color-border);
		border-radius: 12px;
		background: var(--color-surface);
		color: var(--color-text);
		font-weight: 400;
	}

	.abbr {
		display: flex;
		align-items: center;
		gap: 4px;
		font-size: 10px;
		font-weight: 800;
		letter-spacing: 0.08em;
		color: var(--color-text-muted);
	}

	.prof {
		width: 8px;
		height: 8px;
		border-radius: 50%;
		border: 1.5px solid var(--color-border-strong);
	}

	.prof.proficient {
		background: var(--color-accent);
		border-color: var(--color-accent);
	}

	strong {
		font-family: var(--font-display);
		font-size: 17px;
		font-weight: 900;
		line-height: 1.2;
		font-variant-numeric: tabular-nums;
	}
</style>
