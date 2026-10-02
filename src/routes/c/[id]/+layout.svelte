<script lang="ts">
	import { onMount, untrack } from 'svelte';
	import { page } from '$app/state';
	import { resolve } from '$app/paths';
	import TabBar from '$lib/components/TabBar.svelte';
	import { session } from '$lib/session.svelte';
	import { isCaster } from '$lib/rules/spellcasting';

	let { children } = $props();

	let loaded = $state(false);
	const id = $derived(page.params.id ?? '');

	// Re-run only when the id changes. `session.load` reads `session.character`, and tracking it
	// would remount the page on every change (closing sheets, collapsing open feature text).
	$effect(() => {
		const target = id;
		untrack(() => {
			loaded = false;
			session.load(target).then(() => {
				if (id === target) loaded = true;
			});
		});
	});

	const showTabs = $derived(!!session.character && page.route.id !== '/c/[id]/edit');

	// Keep the screen awake at the table. Needs HTTPS (or localhost); silently skipped otherwise.
	onMount(() => {
		let lock: WakeLockSentinel | null = null;
		const acquire = async () => {
			try {
				if (document.visibilityState === 'visible' && 'wakeLock' in navigator) {
					lock = await navigator.wakeLock.request('screen');
				}
			} catch {
				// Not allowed here (low battery mode, insecure origin); the phone will just sleep as normal.
			}
		};
		void acquire();
		document.addEventListener('visibilitychange', acquire);
		return () => {
			document.removeEventListener('visibilitychange', acquire);
			void lock?.release();
		};
	});
</script>

{#if !loaded}
	<p class="msg">Loading…</p>
{:else if !session.character}
	<div class="msg">
		<p>That character isn't on this device.</p>
		<a href={resolve('/')}>All characters</a>
	</div>
{:else}
	<div class="screen" class:tabs={showTabs}>
		{@render children()}
	</div>
	{#if showTabs}
		<TabBar {id} caster={isCaster(session.character)} />
	{/if}
{/if}

<style>
	.screen {
		max-width: 560px;
		margin: 0 auto;
		padding: calc(12px + env(safe-area-inset-top)) 16px calc(32px + env(safe-area-inset-bottom));
	}

	.screen.tabs {
		padding-bottom: calc(96px + env(safe-area-inset-bottom));
	}

	.msg {
		padding: 40px 16px;
		text-align: center;
		color: var(--color-text-muted);
	}

	.msg a {
		display: inline-block;
		margin-top: 12px;
		color: var(--color-accent);
		font-weight: 700;
	}
</style>
