<script lang="ts">
	import { onMount } from 'svelte';
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import Portrait from '$lib/components/Portrait.svelte';
	import { db, requestPersistentStorage } from '$lib/db';
	import { BackupError, decodeRestoreCode, parseBackupText } from '$lib/backup/backup';
	import { pendingRestore } from '$lib/backup/pending';
	import { CLASSES } from '$lib/data/classes';
	import type { Character } from '$lib/types';

	let candidate = $state<Character | null>(null);
	let existing = $state<Character | null>(null);
	let error = $state('');
	let pasted = $state('');

	onMount(() => {
		if (pendingRestore.code) {
			const code = pendingRestore.code;
			pendingRestore.code = null;
			void load(() => decodeRestoreCode(code));
		}
	});

	async function load(read: () => Promise<Character> | Character) {
		error = '';
		try {
			const c = await read();
			existing = (await db.characters.get(c.id)) ?? null;
			candidate = c;
		} catch (err) {
			candidate = null;
			error = err instanceof BackupError ? err.message : "Couldn't read that backup. Check the file or link is complete.";
		}
	}

	function pickFile(e: Event) {
		const file = (e.currentTarget as HTMLInputElement).files?.[0];
		if (file) void load(async () => parseBackupText(await file.text()));
	}

	function usePasted() {
		const text = pasted.trim();
		void load(() => {
			// Accept a full restore link or just the code.
			const code = text.includes('restore=') ? (new URL(text).searchParams.get('restore') ?? '') : text;
			return decodeRestoreCode(code);
		});
	}

	async function save(asCopy: boolean) {
		if (!candidate) return;
		const c: Character = $state.snapshot(candidate) as Character;
		if (asCopy) {
			c.id = crypto.randomUUID();
			c.name = `${c.name} (copy)`;
		}
		// A restore link has no photo; keep the one already on this phone.
		if (!c.image && existing?.image && !asCopy) c.image = existing.image;
		await db.characters.put(c);
		void requestPersistentStorage();
		goto(resolve('/c/[id]', { id: c.id }), { replaceState: true });
	}

	const className = (key: string) => CLASSES.find((x) => x.key === key)?.name ?? key;
	const fmt = (iso: string) => new Date(iso).toLocaleString(undefined, { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' });
</script>

<main>
	<a class="back" href={resolve('/')}>‹ All characters</a>
	<h1>Import backup</h1>

	{#if candidate}
		<div class="card preview">
			<Portrait name={candidate.name} image={candidate.image ?? existing?.image} size={64} />
			<div>
				<p class="name">{candidate.name}</p>
				<p class="meta">{className(candidate.classKey)} {candidate.level} · {candidate.hpCurrent}/{candidate.hpMax} HP</p>
				<p class="meta">Saved {fmt(candidate.updatedAt)}</p>
			</div>
		</div>

		{#if existing}
			<p class="note">
				{existing.name} is already on this phone (last changed {fmt(existing.updatedAt)}).
				{#if Date.parse(existing.updatedAt) > Date.parse(candidate.updatedAt)}
					<strong>The copy on this phone is newer than the backup.</strong>
				{/if}
			</p>
			<button type="button" class="primary" onclick={() => save(false)}>Replace with backup</button>
			<button type="button" class="secondary" onclick={() => save(true)}>Keep both</button>
		{:else}
			<button type="button" class="primary" onclick={() => save(false)}>Add to this phone</button>
		{/if}
		<button type="button" class="link" onclick={() => (candidate = null)}>Choose a different backup</button>
	{:else}
		<label class="primary file">
			Choose backup file
			<input class="sr-only" type="file" accept=".json,application/json" onchange={pickFile} />
		</label>
		<p class="hint">Pick the <code>.pctracker.json</code> file you saved from Files, iCloud Drive or Downloads.</p>

		<div class="or"><span>or</span></div>

		<label class="paste">
			<span>Paste a restore link</span>
			<textarea bind:value={pasted} rows="3" placeholder="https://…?restore=…"></textarea>
		</label>
		<button type="button" class="secondary" disabled={!pasted.trim()} onclick={usePasted}>Restore from link</button>
	{/if}

	{#if error}
		<p class="error" role="alert">{error}</p>
	{/if}
</main>

<style>
	main {
		max-width: 560px;
		margin: 0 auto;
		padding: calc(12px + env(safe-area-inset-top)) 16px calc(24px + env(safe-area-inset-bottom));
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
		margin-bottom: 6px;
	}

	.preview {
		display: flex;
		align-items: center;
		gap: 14px;
		padding: 14px;
	}

	.name {
		font-family: var(--font-display);
		font-size: 20px;
		font-weight: 900;
	}

	.meta,
	.hint,
	.note {
		font-size: 14px;
		color: var(--color-text-muted);
	}

	.note strong {
		display: block;
		color: var(--color-alert-ink);
	}

	.primary,
	.secondary {
		display: flex;
		align-items: center;
		justify-content: center;
		height: 52px;
		border-radius: 14px;
		font-size: 16px;
		font-weight: 800;
		cursor: pointer;
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

	.secondary:disabled {
		opacity: 0.5;
	}

	.link {
		min-height: 44px;
		border: 0;
		background: transparent;
		color: var(--color-accent);
		font-weight: 700;
	}

	.or {
		display: flex;
		align-items: center;
		gap: 10px;
		color: var(--color-text-faint);
		font-size: 13px;
		margin: 8px 0;
	}

	.or::before,
	.or::after {
		content: '';
		flex: 1;
		height: 1px;
		background: var(--color-border);
	}

	.paste {
		display: flex;
		flex-direction: column;
		gap: 4px;
		font-size: 13px;
		font-weight: 700;
		color: var(--color-text-muted);
	}

	.paste textarea {
		font-size: 14px;
	}

	.error {
		padding: 10px 12px;
		border-radius: 12px;
		background: var(--color-used-bg);
		border: 1px solid var(--color-used-edge);
		color: var(--color-used-ink);
		font-weight: 600;
	}
</style>
