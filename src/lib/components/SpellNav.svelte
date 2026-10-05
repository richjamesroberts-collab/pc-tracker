<script lang="ts">
	import { resolve } from '$app/paths';
	import { page } from '$app/state';

	let { id }: { id: string } = $props();

	// The Spells tab holds two screens: the spells the character has (slots, casting) and the spellbook to add them from.
	const views = $derived([
		{ href: resolve('/c/[id]/spells', { id }), route: '/c/[id]/spells', label: 'My spells' },
		{ href: resolve('/c/[id]/book', { id }), route: '/c/[id]/book', label: 'Spellbook' }
	]);
</script>

<nav aria-label="Spells">
	{#each views as v (v.route)}
		<a href={v.href} aria-current={page.route.id === v.route ? 'page' : undefined}>{v.label}</a>
	{/each}
</nav>

<style>
	nav {
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: 4px;
		padding: 4px;
		margin-bottom: 12px;
		border-radius: 14px;
		background: var(--color-surface-raised);
	}

	a {
		display: flex;
		align-items: center;
		justify-content: center;
		min-height: 40px;
		border-radius: 10px;
		color: var(--color-text-muted);
		font-size: 14px;
		font-weight: 800;
		text-decoration: none;
	}

	a[aria-current='page'] {
		background: var(--color-surface);
		color: var(--color-spell-ink);
		box-shadow: var(--shadow-sm);
	}
</style>
