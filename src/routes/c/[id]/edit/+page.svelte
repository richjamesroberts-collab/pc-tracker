<script lang="ts">
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import CharacterForm from '$lib/components/CharacterForm.svelte';
	import Sheet from '$lib/components/Sheet.svelte';
	import { db } from '$lib/db';
	import { session } from '$lib/session.svelte';
	import type { Character } from '$lib/types';

	const initial = session.character as Character;
	let confirmDelete = $state(false);

	function save(updated: Character) {
		session.mutate('Character updated', (c) => Object.assign(c, updated));
		goto(resolve('/c/[id]', { id: updated.id }), { replaceState: true });
	}

	async function remove() {
		await db.characters.delete(initial.id);
		session.character = null;
		goto(resolve('/'), { replaceState: true });
	}
</script>

<h1>Edit character</h1>
<CharacterForm {initial} isNew={false} onsave={save} oncancel={() => history.back()} />

<button type="button" class="delete" onclick={() => (confirmDelete = true)}>Delete character</button>

<Sheet open={confirmDelete} onclose={() => (confirmDelete = false)} label="Delete character">
	<h2>Delete {initial.name}?</h2>
	<p>This removes the character from this device. It can't be undone unless you have a backup file.</p>
	<div class="buttons">
		<button type="button" class="secondary" onclick={() => (confirmDelete = false)}>Keep</button>
		<button type="button" class="danger" onclick={remove}>Delete</button>
	</div>
</Sheet>

<style>
	h1 {
		font-size: 26px;
		margin-bottom: 16px;
	}

	h2 {
		font-size: 22px;
	}

	p {
		margin-top: 6px;
		color: var(--color-text-muted);
	}

	.delete {
		width: 100%;
		height: 48px;
		margin-top: 28px;
		border: 0;
		background: transparent;
		color: var(--color-danger);
		font-size: 15px;
		font-weight: 700;
	}

	.buttons {
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: 8px;
		margin-top: 16px;
	}

	.buttons button {
		height: 52px;
		border-radius: 14px;
		font-size: 16px;
		font-weight: 800;
	}

	.secondary {
		background: var(--color-surface);
		border: 1.5px solid var(--color-border-strong);
		color: var(--color-text);
	}

	.danger {
		border: 0;
		background: var(--color-hit);
		color: var(--color-on-solid);
	}
</style>
