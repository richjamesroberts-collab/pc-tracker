<script lang="ts" module>
	export type HpMode = 'damage' | 'heal' | 'temp';
</script>

<script lang="ts">
	import Sheet from './Sheet.svelte';
	import { session } from '$lib/session.svelte';
	import { applyDamage, applyHealing, applyTempHp, isDown } from '$lib/rules/hp';
	import type { Character } from '$lib/types';

	let { open, mode = $bindable('damage'), onclose }: { open: boolean; mode?: HpMode; onclose: () => void } = $props();

	let digits = $state('');
	let critical = $state(false);

	$effect(() => {
		if (open) {
			digits = '';
			critical = false;
		}
	});

	const c = $derived(session.character as Character);
	const amount = $derived(Number(digits) || 0);
	const down = $derived(isDown(c));

	const preview = $derived.by(() => {
		if (!amount) return '';
		const next = structuredClone($state.snapshot(c)) as Character;
		if (mode === 'damage') {
			const r = applyDamage(next, amount, { critical });
			if (down) return r.instantDeath ? 'Massive damage: instant death' : `+${critical ? 2 : 1} failed death save`;
			const soak = r.absorbed ? `Temp HP absorbs ${r.absorbed} · ` : '';
			return `${soak}HP ${c.hpCurrent} → ${next.hpCurrent}`;
		}
		if (mode === 'heal') return `HP ${Math.max(0, c.hpCurrent)} → ${next.hpCurrent}`;
		return amount <= c.tempHp ? `You already have ${c.tempHp} temp. Temp HP doesn't stack.` : `Temp HP ${c.tempHp} → ${amount}`;
	});

	const concentrationHint = $derived(
		mode === 'damage' && amount && c.concentration && !down
			? `Concentrating on ${c.concentration}: CON save DC ${Math.max(10, Math.floor(amount / 2))}`
			: ''
	);

	const KEYS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', 'clear', '0', 'back'];

	function press(key: string) {
		if (key === 'clear') digits = '';
		else if (key === 'back') digits = digits.slice(0, -1);
		else if (digits.length < 3) digits = (digits + key).replace(/^0+/, '');
	}

	function apply() {
		if (!amount) return;
		if (mode === 'damage') {
			const spell = c.concentration;
			const r = session.mutate(`Took ${amount} damage`, (ch) => applyDamage(ch, amount, { critical }));
			if (r?.instantDeath) session.notify('Massive damage: instant death', { tone: 'warn', canUndo: true });
			else if (r?.droppedToZero) session.notify(`Took ${amount} damage. You're down!`, { tone: 'warn', canUndo: true });
			if (r?.concentrationDC && spell) session.concentrationCheck = { spell, dc: r.concentrationDC };
		} else if (mode === 'heal') {
			session.mutate(`Healed ${amount}`, (ch) => applyHealing(ch, amount));
		} else {
			const gained = session.mutate(`Gained ${amount} temp HP`, (ch) => applyTempHp(ch, amount));
			if (!gained) session.notify(`Kept ${c.tempHp} temp HP. Temp HP doesn't stack.`);
		}
		onclose();
	}

	const verb = $derived(
		mode === 'damage' ? `Take ${amount || ''} damage` : mode === 'heal' ? `Heal ${amount || ''}` : `Set ${amount || ''} temp HP`
	);
</script>

<Sheet {open} {onclose} label="Change hit points">
	<div class="modes" role="radiogroup" aria-label="Change type">
		<button type="button" role="radio" aria-checked={mode === 'damage'} class="damage" onclick={() => (mode = 'damage')}>Damage</button>
		<button type="button" role="radio" aria-checked={mode === 'heal'} class="heal" onclick={() => (mode = 'heal')}>Heal</button>
		<button type="button" role="radio" aria-checked={mode === 'temp'} class="temp" onclick={() => (mode = 'temp')}>Temp HP</button>
	</div>

	<output class="amount {mode}" aria-live="polite">{digits || '0'}</output>
	<p class="preview">{preview || ' '}</p>

	{#if mode === 'damage' && down}
		<label class="crit">
			<input type="checkbox" bind:checked={critical} />
			It was a critical hit (two failures)
		</label>
	{/if}

	{#if concentrationHint}
		<p class="alert">{concentrationHint}</p>
	{/if}

	<div class="pad">
		{#each KEYS as key (key)}
			<button
				type="button"
				class="key"
				class:word={key === 'clear'}
				aria-label={key === 'back' ? 'Delete digit' : key === 'clear' ? 'Clear' : key}
				onclick={() => press(key)}
			>
				{#if key === 'back'}
					<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 5h11v14H9l-6-7zM12.5 9.5l5 5M17.5 9.5l-5 5" /></svg>
				{:else if key === 'clear'}
					Clear
				{:else}
					{key}
				{/if}
			</button>
		{/each}
	</div>

	<button type="button" class="apply {mode}" disabled={!amount} onclick={apply}>{verb}</button>
</Sheet>

<style>
	.modes {
		display: grid;
		grid-template-columns: repeat(3, minmax(0, 1fr));
		gap: 4px;
		padding: 4px;
		background: var(--color-chip);
		border-radius: 14px;
	}

	.modes button {
		height: 44px;
		border: 0;
		border-radius: 10px;
		background: transparent;
		color: var(--color-text);
		font-size: 15px;
	}

	.modes button[aria-checked='true'] {
		color: var(--color-on-solid);
		font-weight: 800;
	}

	.modes .damage[aria-checked='true'] {
		background: var(--color-hit);
	}
	.modes .heal[aria-checked='true'] {
		background: var(--color-heal);
	}
	.modes .temp[aria-checked='true'] {
		background: var(--color-accent);
		color: var(--color-on-accent);
	}

	.amount {
		display: block;
		text-align: center;
		margin-top: 16px;
		font-family: var(--font-display);
		font-weight: 900;
		font-size: 64px;
		line-height: 1;
		font-variant-numeric: tabular-nums;
	}

	.amount.damage {
		color: var(--color-hit);
	}
	.amount.heal {
		color: var(--color-heal);
	}
	.amount.temp {
		color: var(--color-accent);
	}

	.preview {
		text-align: center;
		margin-top: 8px;
		min-height: 1.5em;
		font-size: 14px;
		color: var(--color-text-muted);
	}

	.crit {
		display: flex;
		align-items: center;
		gap: 10px;
		margin-top: 10px;
		min-height: 44px;
		font-weight: 600;
	}

	.crit input {
		width: 22px;
		height: 22px;
		accent-color: var(--color-hit);
	}

	.alert {
		margin-top: 10px;
		padding: 10px 12px;
		border-radius: 12px;
		background: var(--color-alert-bg);
		border: 1px solid var(--color-alert-edge);
		color: var(--color-alert-ink);
		font-size: 14px;
		font-weight: 600;
	}

	.pad {
		display: grid;
		grid-template-columns: repeat(3, minmax(0, 1fr));
		gap: 8px;
		margin-top: 14px;
	}

	.key {
		height: 56px;
		border-radius: 14px;
		border: 1px solid var(--color-border);
		background: var(--color-surface-raised);
		color: var(--color-text);
		font-family: var(--font-display);
		font-size: 24px;
		font-weight: 800;
		display: flex;
		align-items: center;
		justify-content: center;
	}

	.key.word {
		font-family: var(--font-body);
		font-size: 16px;
	}

	.key:active {
		background: var(--color-chip);
	}

	.key svg {
		width: 26px;
		height: 26px;
		fill: none;
		stroke: currentColor;
		stroke-width: 2;
		stroke-linejoin: round;
		stroke-linecap: round;
	}

	.apply {
		width: 100%;
		height: 56px;
		margin-top: 14px;
		border: 0;
		border-radius: 14px;
		font-size: 17px;
		font-weight: 800;
		color: var(--color-on-solid);
	}

	.apply:disabled {
		opacity: 0.45;
	}

	.apply.damage {
		background: var(--color-hit);
	}
	.apply.heal {
		background: var(--color-heal);
	}
	.apply.temp {
		background: var(--color-accent);
		color: var(--color-on-accent);
	}
</style>
