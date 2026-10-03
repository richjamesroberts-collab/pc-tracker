<script lang="ts">
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import CharacterForm from '$lib/components/CharacterForm.svelte';
	import { newCharacter } from '$lib/character';
	import { recompute } from '$lib/rules/stats';
	import { db, requestPersistentStorage } from '$lib/db';
	import type { Character } from '$lib/types';

	const initial = newCharacter();

	async function save(c: Character) {
		await db.characters.put(recompute(c));
		void requestPersistentStorage();
		goto(resolve('/c/[id]', { id: c.id }), { replaceState: true });
	}
</script>

<main>
	<h1>New character</h1>
	<CharacterForm {initial} isNew onsave={save} oncancel={() => history.back()} />
</main>

<style>
	main {
		max-width: 560px;
		margin: 0 auto;
		padding: calc(16px + env(safe-area-inset-top)) 16px calc(24px + env(safe-area-inset-bottom));
	}

	h1 {
		font-size: 26px;
		margin-bottom: 16px;
	}
</style>
