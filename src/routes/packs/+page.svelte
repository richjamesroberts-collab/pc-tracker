<script lang="ts">
	import { onMount } from 'svelte';
	import { resolve } from '$app/paths';
	import Sheet from '$lib/components/Sheet.svelte';
	import { db } from '$lib/db';
	import { library, BUILTIN_SPELLS } from '$lib/library.svelte';
	import { customSpellsPack, packFileName } from '$lib/backup/packs';
	import { saveJsonFile } from '$lib/backup/share';
	import type { Character, SpellPack } from '$lib/types';

	let withCustom = $state<Character[]>([]);
	let removing = $state<SpellPack | null>(null);

	onMount(async () => {
		withCustom = (await db.characters.toArray()).filter((c) => c.customSpells?.length);
	});

	async function exportCustom(c: Character) {
		const file = customSpellsPack(c);
		await saveJsonFile(packFileName(file.pack), JSON.stringify(file), file.pack.name);
	}

	async function confirmRemove() {
		if (!removing) return;
		await library.remove(removing.id);
		removing = null;
	}
</script>

<main>
	<a class="back" href={resolve('/')}>‹ All characters</a>
	<h1>Spell packs</h1>
	<p class="intro">
		The app comes with the Player's Handbook, Xanathar's and Tasha's spells. To add more, import a <code>.spellpack.json</code> file from your DM. Packs are
		saved on this phone and work for every character on it.
	</p>

	<ul class="card list">
		<li>
			<div class="info">
				<span class="name">Built in</span>
				<span class="meta">{BUILTIN_SPELLS.length} spells · built in</span>
			</div>
		</li>
		{#each library.packs as p (p.id)}
			<li>
				<div class="info">
					<span class="name">{p.name}</span>
					<span class="meta">{p.spells.length} spells · version {p.version}</span>
					{#if p.description}<span class="desc">{p.description}</span>{/if}
				</div>
				<button type="button" class="remove" onclick={() => (removing = p)}>Remove</button>
			</li>
		{/each}
	</ul>

	<a class="primary" href={resolve('/import')}>Import spell pack</a>
	<p class="hint">Got the file by AirDrop, Messages or Discord? Save it to Files first, then pick it here.</p>

	{#if withCustom.length}
		<h2 class="label">Share your custom spells</h2>
		<p class="hint">Turn spells you typed in (homebrew, other books) into a pack the rest of the table can import.</p>
		{#each withCustom as c (c.id)}
			<button type="button" class="secondary" onclick={() => exportCustom(c)}>
				Export {c.name}'s {c.customSpells.length} custom spell{c.customSpells.length === 1 ? '' : 's'}
			</button>
		{/each}
	{/if}

	<h2 class="label">About</h2>
	<p class="legal">
		This app includes material taken from the System Reference Document 5.1 ("SRD 5.1") by Wizards of the Coast LLC,
		available at <a href="https://dnd.wizards.com/resources/systems-reference-document">dnd.wizards.com</a>. The SRD 5.1
		is licensed under the
		<a href="https://creativecommons.org/licenses/by/4.0/legalcode">Creative Commons Attribution 4.0 International License</a>.
		Also includes PHB, XGE and TCE content.
		Spell packs you import are your own and stay on your device.
	</p>
</main>

<Sheet open={!!removing} onclose={() => (removing = null)} label="Remove spell pack">
	{#if removing}
		<h2 class="sheet-title">Remove {removing.name}?</h2>
		<p class="hint">
			Characters keep a saved copy of the spells they already use. You won't be able to add new spells from this pack until
			you import it again.
		</p>
		<div class="buttons">
			<button type="button" class="secondary" onclick={() => (removing = null)}>Keep</button>
			<button type="button" class="danger" onclick={confirmRemove}>Remove</button>
		</div>
	{/if}
</Sheet>

<style>
	main {
		max-width: 560px;
		margin: 0 auto;
		padding: calc(12px + env(safe-area-inset-top)) 16px calc(32px + env(safe-area-inset-bottom));
		display: flex;
		flex-direction: column;
		gap: 10px;
	}

	.back {
		align-self: flex-start;
		min-height: 40px;
		display: flex;
		align-items: center;
		color: var(--color-accent);
		font-weight: 700;
		text-decoration: none;
	}

	h1 {
		font-size: 26px;
	}

	h2.label {
		margin-top: 18px;
	}

	.intro,
	.hint,
	.legal {
		font-size: 14px;
		line-height: 1.45;
		color: var(--color-text-muted);
	}

	.legal {
		font-size: 12px;
	}

	.legal a {
		color: inherit;
	}

	.list {
		list-style: none;
		overflow: hidden;
	}

	.list li {
		display: flex;
		align-items: center;
		gap: 10px;
		padding: 12px 14px;
	}

	.list li + li {
		border-top: 1px solid var(--color-border);
	}

	.info {
		flex: 1;
		min-width: 0;
		display: flex;
		flex-direction: column;
	}

	.name {
		font-weight: 800;
		font-size: 16px;
	}

	.meta,
	.desc {
		font-size: 13px;
		color: var(--color-text-muted);
	}

	.remove {
		min-height: 40px;
		border: 0;
		background: transparent;
		color: var(--color-danger);
		font-weight: 700;
	}

	.primary,
	.secondary,
	.danger {
		display: flex;
		align-items: center;
		justify-content: center;
		min-height: 52px;
		padding: 0 14px;
		border-radius: 14px;
		font-size: 16px;
		font-weight: 800;
		text-decoration: none;
	}

	.primary {
		background: var(--color-accent);
		border: 1px solid var(--color-accent-edge);
		color: var(--color-on-accent);
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

	.sheet-title {
		font-size: 22px;
	}

	.buttons {
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: 8px;
		margin-top: 16px;
	}
</style>
