<script lang="ts">
	import { onMount } from 'svelte';

	type Theme = 'light' | 'dark';

	let theme = $state<Theme>('light');

	onMount(() => {
		theme = document.documentElement.dataset.theme === 'dark' ? 'dark' : 'light';
	});

	function setTheme(next: Theme) {
		theme = next;
		document.documentElement.dataset.theme = next;
		try {
			localStorage.setItem('theme', next);
		} catch {
			// Storage unavailable (private mode); theme still applies for this session.
		}
	}
</script>

<div class="theme-toggle" role="group" aria-label="Colour mode">
	<button type="button" aria-pressed={theme === 'light'} onclick={() => setTheme('light')}>
		<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" aria-hidden="true">
			<circle cx="12" cy="12" r="4.5" />
			<path d="M12 2v2.5M12 19.5V22M2 12h2.5M19.5 12H22M4.9 4.9l1.8 1.8M17.3 17.3l1.8 1.8M4.9 19.1l1.8-1.8M17.3 6.7l1.8-1.8" />
		</svg>
		Light
	</button>
	<button type="button" aria-pressed={theme === 'dark'} onclick={() => setTheme('dark')}>
		<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linejoin="round" aria-hidden="true">
			<path d="M20 14.5A8 8 0 1 1 9.5 4a6.5 6.5 0 0 0 10.5 10.5z" />
		</svg>
		Dark
	</button>
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
		border: 0;
		background: transparent;
		color: var(--color-text-muted);
		padding: 0.25rem 0.75rem;
		font-size: 0.75rem;
		font-weight: 700;
	}

	button[aria-pressed='true'] {
		background: var(--color-surface);
		color: var(--color-text);
		box-shadow: var(--shadow-sm);
	}

	svg {
		width: 14px;
		height: 14px;
	}
</style>
