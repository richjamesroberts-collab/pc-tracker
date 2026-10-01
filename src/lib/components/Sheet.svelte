<script lang="ts">
	import type { Snippet } from 'svelte';
	import { fly, fade } from 'svelte/transition';

	let {
		open,
		onclose,
		label,
		children
	}: { open: boolean; onclose: () => void; label: string; children: Snippet } = $props();

	let panel: HTMLDivElement | undefined = $state();

	$effect(() => {
		if (open && panel) panel.focus();
	});

	function onkeydown(e: KeyboardEvent) {
		if (e.key === 'Escape') onclose();
	}
</script>

{#if open}
	<div class="scrim" transition:fade={{ duration: 150 }} onclick={onclose} aria-hidden="true"></div>
	<div
		class="sheet"
		role="dialog"
		aria-modal="true"
		aria-label={label}
		tabindex="-1"
		bind:this={panel}
		{onkeydown}
		transition:fly={{ y: 400, duration: 200 }}
	>
		<button class="handle" type="button" aria-label="Close" onclick={onclose}><span></span></button>
		{@render children()}
	</div>
{/if}

<style>
	.scrim {
		position: fixed;
		inset: 0;
		background: var(--color-scrim);
		z-index: 40;
	}

	.sheet {
		position: fixed;
		left: 0;
		right: 0;
		bottom: 0;
		z-index: 41;
		max-height: 92dvh;
		overflow-y: auto;
		overscroll-behavior: contain;
		background: var(--color-surface);
		border-radius: 24px 24px 0 0;
		box-shadow: var(--shadow-lg);
		padding: 0 16px calc(20px + env(safe-area-inset-bottom));
		max-width: 560px;
		margin: 0 auto;
		outline: none;
	}

	.handle {
		display: flex;
		justify-content: center;
		width: 100%;
		border: 0;
		background: transparent;
		padding: 10px 0 14px;
		border-radius: 0;
	}

	.handle span {
		width: 40px;
		height: 5px;
		border-radius: 999px;
		background: var(--color-border-strong);
	}
</style>
