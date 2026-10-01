<script lang="ts">
	import Sheet from './Sheet.svelte';
	import { session } from '$lib/session.svelte';
	import { pointsToSlot, SLOT_COST, slotToPoints, sorceryPointsLeft, sorceryPointsMax } from '$lib/rules/resources';
	import { ordinal, slotMax, slotsLeft } from '$lib/rules/spellcasting';
	import type { Character } from '$lib/types';

	let { open, onclose }: { open: boolean; onclose: () => void } = $props();

	const c = $derived(session.character as Character);
	const left = $derived(sorceryPointsLeft(c));
	const max = $derived(sorceryPointsMax(c));
	const levels = $derived(slotMax(c).map((_, i) => i + 1));
	const creatable = $derived(levels.filter((l) => l <= 5));

	function burn(level: number) {
		session.mutate(`Turned a ${ordinal(level)}-level slot into ${level} sorcery points`, (ch) => slotToPoints(ch, level));
	}

	function create(level: number) {
		session.mutate(`Made a ${ordinal(level)}-level slot for ${SLOT_COST[level]} points`, (ch) => pointsToSlot(ch, level));
	}
</script>

<Sheet {open} {onclose} label="Font of Magic">
	<h2>Font of Magic</h2>
	<p class="muted">{left} / {max} sorcery points. Slots you create disappear on a long rest.</p>

	<p class="label section">Slot → points</p>
	<div class="grid">
		{#each levels as level (level)}
			<button type="button" disabled={slotsLeft(c, level) === 0 || left >= max} onclick={() => burn(level)}>
				<b>{ordinal(level)} slot</b>
				<span>+{Math.min(level, max - left)} SP</span>
			</button>
		{/each}
	</div>

	<p class="label section">Points → slot</p>
	<div class="grid">
		{#each creatable as level (level)}
			<button type="button" disabled={left < SLOT_COST[level]} onclick={() => create(level)}>
				<b>{ordinal(level)} slot</b>
				<span>{SLOT_COST[level]} SP</span>
			</button>
		{/each}
	</div>
</Sheet>

<style>
	h2 {
		font-size: 22px;
	}

	.muted {
		color: var(--color-text-muted);
		font-size: 14px;
	}

	.section {
		margin: 16px 0 8px;
	}

	.grid {
		display: grid;
		grid-template-columns: repeat(3, minmax(0, 1fr));
		gap: 8px;
	}

	button {
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		min-height: 56px;
		border-radius: 14px;
		border: 1.5px solid var(--color-effect-edge);
		background: var(--color-effect-bg);
		color: var(--color-effect-ink);
	}

	button:disabled {
		opacity: 0.4;
	}

	b {
		font-size: 15px;
	}

	span {
		font-size: 13px;
		font-weight: 700;
	}
</style>
