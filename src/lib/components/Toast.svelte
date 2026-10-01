<script lang="ts">
	import { fly } from 'svelte/transition';
	import { session } from '$lib/session.svelte';
</script>

{#if session.toast}
	<div class="toast" class:warn={session.toast.tone === 'warn'} role="status" transition:fly={{ y: 20, duration: 150 }}>
		<span>{session.toast.message}</span>
		{#if session.toast.canUndo}
			<button type="button" onclick={() => session.undo()}>Undo</button>
		{:else}
			<button type="button" aria-label="Dismiss" onclick={() => session.dismissToast()}>×</button>
		{/if}
	</div>
{/if}

<style>
	.toast {
		position: fixed;
		left: 12px;
		right: 12px;
		bottom: calc(92px + env(safe-area-inset-bottom));
		z-index: 30;
		max-width: 520px;
		margin: 0 auto;
		display: flex;
		align-items: center;
		gap: 12px;
		padding: 6px 6px 6px 16px;
		border-radius: 14px;
		background: var(--color-text);
		color: var(--color-bg);
		font-size: 15px;
		font-weight: 600;
		box-shadow: var(--shadow-lg);
	}

	.warn {
		background: var(--color-alert-bg);
		color: var(--color-alert-ink);
		border: 1px solid var(--color-alert-edge);
	}

	span {
		flex: 1;
	}

	button {
		min-height: 40px;
		min-width: 40px;
		border: 0;
		background: transparent;
		color: inherit;
		font-weight: 800;
		font-size: 15px;
	}

	button:not([aria-label]) {
		text-decoration: underline;
		text-underline-offset: 3px;
	}
</style>
