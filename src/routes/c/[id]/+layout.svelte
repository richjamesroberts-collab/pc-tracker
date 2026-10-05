<script lang="ts">
	import { onMount, untrack } from 'svelte';
	import { page } from '$app/state';
	import { resolve } from '$app/paths';
	import TabBar from '$lib/components/TabBar.svelte';
	import { session } from '$lib/session.svelte';
	import { isCaster } from '$lib/rules/spellcasting';
	import { grantedSpells } from '$lib/rules/grants';
	import { backupReminder } from '$lib/backup/reminder.svelte';
	import { fillItemData, fillItemDetails, loadGear, loadItems, needsItemData } from '$lib/data/content';

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

	// Each time the app is opened (or returned to after a while), note whether this character was left
	// with changes not backed up. Vitals shows the reminder; other screens get a toast pointing there.
	$effect(() => {
		void backupReminder.visit;
		if (!loaded) return;
		untrack(() => {
			const c = session.character;
			if (c && backupReminder.check(c) && page.route.id !== '/c/[id]') {
				session.notify(`${c.name} has changes since the last backup. Back up from Vitals.`, { tone: 'warn' });
			}
		});
	});

	// Items added before effects, armor and weapon stats were tracked get them from the bundled data, once.
	$effect(() => {
		if (!loaded) return;
		const c = untrack(() => session.character);
		const stale = (x: typeof c) => !!x && (x.items.some((i) => i.effects === undefined) || needsItemData(x));
		if (!stale(c)) return;
		Promise.all([loadItems(), loadGear()]).then(
			([magic, gear]) => {
				const magicById = new Map(magic.map((m) => [m.id, m]));
				const gearById = new Map(gear.map((g) => [g.id, g]));
				const current = session.character;
				if (current?.id === c!.id && stale(current))
					session.record((d) => {
						fillItemDetails(d, magicById, gearById);
						fillItemData(d, magicById, gearById);
					});
			},
			() => {}
		);
	});

	const showTabs = $derived(!!session.character && page.route.id !== '/c/[id]/edit' && page.route.id !== '/c/[id]/level-up');

	// Keep the screen awake at the table. Needs HTTPS (or localhost); silently skipped otherwise.
	onMount(() => {
		backupReminder.listen();
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
		<!-- Non-casters with granted spells (Shadow monk, tiefling fighter) get the Spells tab too. -->
		<TabBar {id} caster={isCaster(session.character) || grantedSpells(session.character).length > 0} />
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
