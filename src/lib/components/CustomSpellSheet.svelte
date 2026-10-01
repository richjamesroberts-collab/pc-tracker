<script lang="ts">
	import Sheet from './Sheet.svelte';
	import { session } from '$lib/session.svelte';
	import { ordinal } from '$lib/rules/spellcasting';
	import type { Spell } from '$lib/types';

	let { open, onclose }: { open: boolean; onclose: () => void } = $props();

	const blank = () => ({
		name: '',
		level: 1,
		school: '',
		time: '1 action',
		range: '',
		duration: 'Instantaneous',
		components: '',
		concentration: false,
		ritual: false,
		text: ''
	});

	let f = $state(blank());

	$effect(() => {
		if (open) f = blank();
	});

	function save(e: SubmitEvent) {
		e.preventDefault();
		const name = f.name.trim();
		if (!name) return;
		const spell: Spell = {
			...$state.snapshot(f),
			name,
			id: `custom-${crypto.randomUUID()}`,
			source: 'Custom',
			classes: [],
			duration: f.concentration && !/concentration/i.test(f.duration) ? `Concentration, up to ${f.duration}` : f.duration
		};
		session.mutate(`Added ${name}`, (c) => {
			c.customSpells.push(spell);
			c.spells.push({ id: spell.id, prepared: true });
		});
		onclose();
	}
</script>

<Sheet {open} {onclose} label="Add a custom spell">
	<h2>Custom spell</h2>
	<p class="muted">For spells from other books, homebrew, or anything missing from the list.</p>
	<form onsubmit={save}>
		<label class="field">
			<span>Name</span>
			<input bind:value={f.name} required autocapitalize="words" />
		</label>
		<div class="two">
			<label class="field">
				<span>Level</span>
				<select bind:value={f.level}>
					<option value={0}>Cantrip</option>
					{#each [1, 2, 3, 4, 5, 6, 7, 8, 9] as l (l)}
						<option value={l}>{ordinal(l)}</option>
					{/each}
				</select>
			</label>
			<label class="field">
				<span>School</span>
				<input bind:value={f.school} placeholder="Evocation" />
			</label>
		</div>
		<div class="two">
			<label class="field">
				<span>Casting time</span>
				<input bind:value={f.time} />
			</label>
			<label class="field">
				<span>Range</span>
				<input bind:value={f.range} placeholder="60 ft" />
			</label>
		</div>
		<div class="two">
			<label class="field">
				<span>Duration</span>
				<input bind:value={f.duration} />
			</label>
			<label class="field">
				<span>Components</span>
				<input bind:value={f.components} placeholder="V, S" />
			</label>
		</div>
		<div class="checks">
			<label><input type="checkbox" bind:checked={f.concentration} /> Concentration</label>
			<label><input type="checkbox" bind:checked={f.ritual} /> Ritual</label>
		</div>
		<label class="field">
			<span>Description</span>
			<textarea bind:value={f.text} rows="4"></textarea>
		</label>
		<button type="submit" class="save" disabled={!f.name.trim()}>Add spell</button>
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

	.field span {
		font-size: 13px;
		font-weight: 700;
		color: var(--color-text-muted);
	}

	.field input,
	.field select {
		height: 46px;
		border-radius: 12px;
		width: 100%;
	}

	.two {
		display: grid;
		grid-template-columns: repeat(2, minmax(0, 1fr));
		gap: 10px;
	}

	.checks {
		display: flex;
		gap: 20px;
	}

	.checks label {
		display: flex;
		align-items: center;
		gap: 8px;
		min-height: 40px;
		font-weight: 600;
	}

	.checks input {
		width: 20px;
		height: 20px;
		accent-color: var(--color-spell-ink);
	}

	.save {
		height: 52px;
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
</style>
