<script lang="ts">
	import Sheet from './Sheet.svelte';
	import type { CustomResource } from '$lib/types';

	let {
		open,
		counter,
		onsave,
		ondelete,
		onclose
	}: {
		open: boolean;
		counter?: CustomResource;
		onsave: (r: CustomResource) => void;
		ondelete?: () => void;
		onclose: () => void;
	} = $props();

	let name = $state('');
	let max = $state(1);
	let reset = $state<'short' | 'long'>('long');

	$effect(() => {
		if (!open) return;
		name = counter?.name ?? '';
		max = counter?.max ?? 1;
		reset = counter?.reset ?? 'long';
	});

	const valid = $derived(!!name.trim() && Number.isInteger(max) && max >= 1 && max <= 99);

	function save(e: SubmitEvent) {
		e.preventDefault();
		if (!valid) return;
		onsave({
			id: counter?.id ?? crypto.randomUUID(),
			name: name.trim(),
			max,
			reset,
			used: Math.min(counter?.used ?? 0, max)
		});
		onclose();
	}
</script>

<Sheet {open} {onclose} label={counter ? 'Edit counter' : 'Add a counter'}>
	<h2>{counter ? 'Edit counter' : 'New counter'}</h2>
	<p class="muted">For anything else with limited uses: magic items, feats, homebrew.</p>
	<form onsubmit={save}>
		<label class="field">
			<span>Name</span>
			<input bind:value={name} required autocapitalize="words" placeholder="Lucky" />
		</label>
		<label class="field">
			<span>Uses</span>
			<input type="number" inputmode="numeric" min="1" max="99" step="1" bind:value={max} required />
		</label>
		<div class="field">
			<span id="counter-reset">Comes back on a</span>
			<div class="modes" role="radiogroup" aria-labelledby="counter-reset">
				<button type="button" role="radio" aria-checked={reset === 'short'} onclick={() => (reset = 'short')}>Short rest</button>
				<button type="button" role="radio" aria-checked={reset === 'long'} onclick={() => (reset = 'long')}>Long rest</button>
			</div>
		</div>
		<button type="submit" class="save" disabled={!valid}>{counter ? 'Save' : 'Add counter'}</button>
		{#if counter && ondelete}
			<button
				type="button"
				class="delete"
				onclick={() => {
					ondelete();
					onclose();
				}}>Delete counter</button
			>
		{/if}
	</form>
</Sheet>

<style>
	h2 {
		font-size: 22px;
	}

	.muted {
		font-size: 14px;
		color: var(--color-text-muted);
	}

	form {
		display: flex;
		flex-direction: column;
		gap: 10px;
		margin-top: 12px;
	}

	.field {
		display: flex;
		flex-direction: column;
		gap: 4px;
		min-width: 0;
	}

	.field > span {
		font-size: 13px;
		font-weight: 700;
		color: var(--color-text-muted);
	}

	.field input {
		height: 46px;
		border-radius: 12px;
		width: 100%;
	}

	.modes {
		display: grid;
		grid-template-columns: repeat(2, minmax(0, 1fr));
		gap: 4px;
		padding: 4px;
		background: var(--color-chip);
		border-radius: 14px;
	}

	.modes button {
		height: 44px;
		border: 0;
		border-radius: 10px;
		background: transparent;
		color: var(--color-text);
		font-size: 15px;
	}

	.modes button[aria-checked='true'] {
		background: var(--color-spell-ink);
		color: var(--color-bg);
		font-weight: 800;
	}

	.save {
		height: 52px;
		margin-top: 4px;
		border: 0;
		border-radius: 14px;
		background: var(--color-spell-ink);
		color: var(--color-bg);
		font-size: 16px;
		font-weight: 800;
	}

	.save:disabled {
		opacity: 0.45;
	}

	.delete {
		height: 46px;
		border: 1.5px solid var(--color-used-edge);
		border-radius: 14px;
		background: transparent;
		color: var(--color-danger);
		font-weight: 800;
	}
</style>
