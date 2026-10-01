<script lang="ts">
	import { onMount } from 'svelte';
	import { resolve } from '$app/paths';
	import { db } from '$lib/db';
	import Portrait from '$lib/components/Portrait.svelte';
	import ThemeToggle from '$lib/components/ThemeToggle.svelte';
	import { CLASSES } from '$lib/data/classes';
	import { backupIsStale } from '$lib/backup/staleness';
	import type { Character } from '$lib/types';

	let characters = $state<Character[] | null>(null);

	onMount(async () => {
		characters = await db.characters.orderBy('updatedAt').reverse().toArray();
	});

	const className = (key: string) => CLASSES.find((c) => c.key === key)?.name ?? key;
</script>

<main>
	<header>
		<h1>PC Tracker</h1>
		<ThemeToggle />
	</header>

	{#if characters === null}
		<p class="muted">Loading…</p>
	{:else if characters.length === 0}
		<div class="empty card">
			<h2>No characters yet</h2>
			<p>Create your character, or import a backup from a previous session.</p>
		</div>
	{:else}
		<ul>
			{#each characters as c (c.id)}
				<li>
					<a class="card row" href={resolve('/c/[id]', { id: c.id })}>
						<Portrait name={c.name} image={c.image} size={52} />
						<span class="who">
							<span class="name">{c.name}</span>
							<span class="meta">{className(c.classKey)} {c.level} · {Math.max(0, c.hpCurrent)}/{c.hpMax} HP</span>
							{#if backupIsStale(c)}
								<span class="nudge">{c.lastBackupAt ? 'Backup is over a week old' : 'Never backed up'}</span>
							{/if}
						</span>
						<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 6l6 6-6 6" /></svg>
					</a>
				</li>
			{/each}
		</ul>
	{/if}

	<div class="actions">
		<a class="btn primary" href={resolve('/new')}>New character</a>
		<a class="btn" href={resolve('/import')}>Import backup</a>
	</div>

	<p class="foot">Everything is saved on this device. Back up after each session so a cleared browser or new phone doesn't lose your character.</p>
</main>

<style>
	main {
		max-width: 560px;
		margin: 0 auto;
		padding: calc(16px + env(safe-area-inset-top)) 16px calc(24px + env(safe-area-inset-bottom));
	}

	header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		margin-bottom: 20px;
	}

	h1 {
		font-size: 28px;
		font-weight: 900;
	}

	ul {
		list-style: none;
		display: flex;
		flex-direction: column;
		gap: 10px;
	}

	.row {
		display: flex;
		align-items: center;
		gap: 12px;
		padding: 12px 14px;
		text-decoration: none;
		color: inherit;
	}

	.who {
		flex: 1;
		min-width: 0;
		display: flex;
		flex-direction: column;
	}

	.name {
		font-family: var(--font-display);
		font-weight: 900;
		font-size: 19px;
	}

	.meta {
		font-size: 14px;
		color: var(--color-text-muted);
	}

	.nudge {
		margin-top: 2px;
		font-size: 13px;
		font-weight: 700;
		color: var(--color-alert-ink);
	}

	.row svg {
		width: 20px;
		height: 20px;
		fill: none;
		stroke: var(--color-text-faint);
		stroke-width: 2.4;
		stroke-linecap: round;
		stroke-linejoin: round;
	}

	.empty {
		padding: 24px 20px;
		text-align: center;
	}

	.empty h2 {
		font-size: 20px;
	}

	.empty p,
	.muted,
	.foot {
		color: var(--color-text-muted);
		margin-top: 6px;
	}

	.actions {
		display: grid;
		grid-template-columns: repeat(2, minmax(0, 1fr));
		gap: 8px;
		margin-top: 20px;
	}

	.btn {
		display: flex;
		align-items: center;
		justify-content: center;
		height: 52px;
		border-radius: 14px;
		border: 1.5px solid var(--color-border-strong);
		background: var(--color-surface);
		color: var(--color-text);
		font-weight: 800;
		text-decoration: none;
	}

	.btn.primary {
		background: var(--color-accent);
		border-color: var(--color-accent-edge);
		color: var(--color-on-accent);
		box-shadow: var(--shadow-btn);
	}

	.foot {
		margin-top: 20px;
		font-size: 14px;
		line-height: 1.45;
	}
</style>
