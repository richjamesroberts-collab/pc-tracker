<script lang="ts">
	import { onMount } from 'svelte';
	import { theme, type ThemePreference } from '$lib/theme.svelte';

	onMount(() => theme.start());

	const options: { value: ThemePreference; label: string }[] = [
		{ value: 'auto', label: 'Auto' },
		{ value: 'light', label: 'Light' },
		{ value: 'dark', label: 'Dark' }
	];
</script>

<div class="theme-toggle" role="radiogroup" aria-label="Colour mode">
	{#each options as o (o.value)}
		<button type="button" role="radio" aria-checked={theme.preference === o.value} onclick={() => theme.set(o.value)}>
			<svg viewBox="0 0 24 24" aria-hidden="true">
				{#if o.value === 'auto'}
					<circle cx="12" cy="12" r="8.5" />
					<path class="solid" d="M12 3.5a8.5 8.5 0 0 0 0 17z" />
				{:else if o.value === 'light'}
					<circle cx="12" cy="12" r="4.5" />
					<path d="M12 2v2.5M12 19.5V22M2 12h2.5M19.5 12H22M4.9 4.9l1.8 1.8M17.3 17.3l1.8 1.8M4.9 19.1l1.8-1.8M17.3 6.7l1.8-1.8" />
				{:else}
					<path d="M20 14.5A8 8 0 1 1 9.5 4a6.5 6.5 0 0 0 10.5 10.5z" />
				{/if}
			</svg>
			{o.label}
		</button>
	{/each}
</div>

<style>
	.theme-toggle {
		display: flex;
		gap: 2px;
		padding: 3px;
		background: var(--color-chip);
		border-radius: var(--radius-pill);
	}

	button {
		display: inline-flex;
		align-items: center;
		gap: 0.375rem;
		min-height: 36px;
		border: 0;
		background: transparent;
		color: var(--color-text-muted);
		padding: 0.25rem 0.7rem;
		font-size: 0.8125rem;
		font-weight: 700;
	}

	button[aria-checked='true'] {
		background: var(--color-surface);
		color: var(--color-text);
		box-shadow: var(--shadow-sm);
	}

	svg {
		width: 14px;
		height: 14px;
		fill: none;
		stroke: currentColor;
		stroke-width: 2.2;
		stroke-linecap: round;
		stroke-linejoin: round;
	}

	.solid {
		fill: currentColor;
	}
</style>
