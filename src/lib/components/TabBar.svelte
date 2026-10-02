<script lang="ts">
	import { resolve } from '$app/paths';
	import { page } from '$app/state';

	let { id, caster = true }: { id: string; caster?: boolean } = $props();

	const all = $derived([
		{ href: resolve('/c/[id]', { id }), route: '/c/[id]', label: 'Vitals', icon: 'M12 20s-7-4.4-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 10c0 5.6-7 10-7 10z' },
		{ href: resolve('/c/[id]/spells', { id }), route: '/c/[id]/spells', label: 'Spells', icon: 'M12 3l2.2 5.8L20 11l-5.8 2.2L12 19l-2.2-5.8L4 11l5.8-2.2z' },
		{ href: resolve('/c/[id]/book', { id }), route: '/c/[id]/book', label: 'Spellbook', icon: 'M5 4.5A1.5 1.5 0 0 1 6.5 3H19v15H6.5A1.5 1.5 0 0 0 5 19.5zM5 19.5A1.5 1.5 0 0 0 6.5 21H19' },
		{ href: resolve('/c/[id]/features', { id }), route: '/c/[id]/features', label: 'Features', icon: 'M4 6h16M4 12h16M4 18h10' }
	]);
	// Spell tabs only make sense for casters.
	const tabs = $derived(caster ? all : all.filter((t) => !t.route.startsWith('/c/[id]/spells') && t.route !== '/c/[id]/book'));
</script>

<nav aria-label="Sections" style:--tabs={tabs.length}>
	{#each tabs as tab (tab.route)}
		<a href={tab.href} aria-current={page.route.id === tab.route ? 'page' : undefined}>
			<svg viewBox="0 0 24 24" aria-hidden="true"><path d={tab.icon} /></svg>
			{tab.label}
		</a>
	{/each}
</nav>

<style>
	nav {
		position: fixed;
		left: 0;
		right: 0;
		bottom: 0;
		z-index: 20;
		display: grid;
		grid-template-columns: repeat(var(--tabs, 4), minmax(0, 1fr));
		background: var(--color-nav-bg);
		backdrop-filter: blur(12px);
		-webkit-backdrop-filter: blur(12px);
		border-top: 1px solid var(--color-border);
		padding-bottom: env(safe-area-inset-bottom);
	}

	a {
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		gap: 3px;
		height: 64px;
		text-decoration: none;
		color: var(--color-text-muted);
		font-size: 12px;
		font-weight: 700;
	}

	a[aria-current='page'] {
		color: var(--color-accent);
		font-weight: 800;
	}

	svg {
		width: 24px;
		height: 24px;
		fill: none;
		stroke: currentColor;
		stroke-width: 2;
		stroke-linecap: round;
		stroke-linejoin: round;
	}
</style>
