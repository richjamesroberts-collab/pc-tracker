<script lang="ts">
	import { resolve } from '$app/paths';
	import { page } from '$app/state';

	let { id, caster = true }: { id: string; caster?: boolean } = $props();

	// Spells covers both the casting screen and the spellbook, so the tab stays lit on either.
	const all = $derived([
		{ href: resolve('/c/[id]', { id }), routes: ['/c/[id]'], label: 'Vitals', icon: 'M12 20s-7-4.4-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 10c0 5.6-7 10-7 10z' },
		{ href: resolve('/c/[id]/spells', { id }), routes: ['/c/[id]/spells', '/c/[id]/book'], label: 'Spells', icon: 'M12 3l2.2 5.8L20 11l-5.8 2.2L12 19l-2.2-5.8L4 11l5.8-2.2z' },
		{ href: resolve('/c/[id]/stats', { id }), routes: ['/c/[id]/stats'], label: 'Stats', icon: 'M6 20v-7M12 20V5M18 20v-10M4 20h16' },
		{ href: resolve('/c/[id]/inventory', { id }), routes: ['/c/[id]/inventory'], label: 'Inventory', icon: 'M5 8h14l-1.2 12H6.2zM9 8V6.5a3 3 0 0 1 6 0V8' },
		{ href: resolve('/c/[id]/features', { id }), routes: ['/c/[id]/features'], label: 'PC Log', icon: 'M4 6h16M4 12h16M4 18h10' }
	]);
	// The Spells tab only makes sense for casters.
	const tabs = $derived(caster ? all : all.filter((t) => t.label !== 'Spells'));
</script>

<nav aria-label="Sections" style:--tabs={tabs.length}>
	{#each tabs as tab (tab.label)}
		<a href={tab.href} aria-current={tab.routes.includes(page.route.id ?? '') ? 'page' : undefined}>
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
