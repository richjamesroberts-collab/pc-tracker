<script lang="ts">
	import { CLASS_MAP } from '$lib/data/classes';
	import { BACKGROUND_BOOKS, CUSTOM_BACKGROUND, loadBackgrounds, loadEquipment, loadGear, type BackgroundData, type GearItem } from '$lib/data/content';
	import { chosenEntries, giveKit, KIT_PICKS, rollGold, type ClassKit, type KitChoices } from '$lib/rules/starting';
	import type { Character } from '$lib/types';

	let {
		character,
		choices = $bindable(),
		onnext,
		onback
	}: {
		/** The new character before any equipment. */
		character: Character;
		/** Kept by the page, so going back keeps them. */
		choices: KitChoices;
		/** What the character ends up carrying. */
		onnext: (carried: Pick<Character, 'items' | 'coins'>) => void;
		onback: () => void;
	} = $props();

	let gear = $state.raw<GearItem[]>([]);
	let kits = $state.raw<Record<string, ClassKit> | null>(null);
	let backgrounds = $state.raw<BackgroundData[]>([]);
	let failed = $state(false);
	let attempt = $state(0);

	$effect(() => {
		void attempt;
		failed = false;
		let live = true;
		Promise.all([loadGear(), loadEquipment(), loadBackgrounds()]).then(
			([g, k, b]) => {
				if (!live) return;
				gear = g;
				kits = k;
				backgrounds = b;
			},
			() => live && (failed = true)
		);
		return () => (live = false);
	});

	const kit = $derived(kits?.[character.classKey]);
	const className = $derived(CLASS_MAP.get(character.classKey)?.name ?? character.classKey);
	const custom = $derived(character.background?.ref === CUSTOM_BACKGROUND);
	/** The background whose equipment applies; a Custom Background borrows any other's. */
	const background = $derived(backgrounds.find((b) => b.id === (custom ? choices.borrow : character.background?.ref)));
	const groups = $derived([
		{ key: 'class', title: className, rows: kit?.rows ?? [] },
		...(background ? [{ key: 'background', title: `${background.name} (background)`, rows: background.equipment }] : [])
	]);
	const entries = $derived(groups.flatMap((g) => chosenEntries(g.rows, g.key, choices)));
	const whole = (n: unknown): n is number => typeof n === 'number' && Number.isInteger(n) && n >= 0;
	const ready = $derived(
		choices.mode === 'later' || (choices.mode === 'gold' ? whole(choices.gold) : !!kit && entries.every((e) => !e.pick || choices.picks[e.key]))
	);
	const goldText = $derived(kit ? `${kit.gold.count}d${kit.gold.sides}${kit.gold.times > 1 ? ` × ${kit.gold.times}` : ''} gp` : '');

	const MODES: { key: KitChoices['mode']; label: string }[] = [
		{ key: 'kit', label: 'Equipment' },
		{ key: 'gold', label: 'Gold' },
		{ key: 'later', label: 'Later' }
	];

	function next() {
		if (!ready) return;
		const d = structuredClone($state.snapshot(character)) as Character;
		if (choices.mode === 'kit') giveKit(d, entries, $state.snapshot(choices) as KitChoices, new Map(gear.map((g) => [g.id, g])));
		else if (choices.mode === 'gold') d.coins.gp += choices.gold ?? 0;
		onnext({ items: d.items, coins: d.coins });
	}
</script>

{#if failed}
	<div class="card status" role="alert">
		<p>Couldn't load starting equipment</p>
		<button type="button" onclick={() => attempt++}>Retry</button>
	</div>
{:else if !kit}
	<p class="lead">Loading…</p>
{:else}
	<div class="modes" role="radiogroup" aria-label="What to start with">
		{#each MODES as m (m.key)}
			<button type="button" role="radio" aria-checked={choices.mode === m.key} onclick={() => (choices.mode = m.key)}>{m.label}</button>
		{/each}
	</div>

	{#if choices.mode === 'gold'}
		<p class="lead">Instead of all class and background equipment, {className.toLowerCase()}s start with {goldText} to buy their own.</p>
		<div class="gold">
			<label class="field">
				<span>Starting gold (gp)</span>
				<input type="number" inputmode="numeric" min="0" step="1" bind:value={choices.gold} placeholder={goldText} />
			</label>
			<button type="button" class="roll" onclick={() => (choices.gold = rollGold(kit.gold))}>Roll {goldText}</button>
		</div>
	{:else if choices.mode === 'later'}
		<p class="lead">Nothing is added now. Add what you carry from Inventory.</p>
	{:else}
		<p class="lead">Armor goes on and weapons are ready to use. The rest is packed; change any of it in Inventory.</p>
		{#each groups as g (g.key)}
			<h2 class="label">{g.title}</h2>
			{#each g.rows as row, r (r)}
				{@const key = `${g.key}:${r}`}
				{@const at = choices.options[key] ?? 0}
				{#if row.options.length > 1}
					<div class="options" role="radiogroup" aria-label="{g.title}: choose one">
						{#each row.options as o, i (i)}
							<button type="button" role="radio" aria-checked={at === i} onclick={() => (choices.options[key] = i)}>{o.label}</button>
						{/each}
					</div>
				{:else}
					<p class="always">{row.options[0].label}</p>
				{/if}
				{#each row.options[at]?.items ?? [] as e, i (i)}
					{#if e.pick}
						<label class="field">
							<span>{KIT_PICKS[e.pick].label}</span>
							<select bind:value={choices.picks[`${key}:${at}:${i}`]}>
								<option value={undefined}>Choose…</option>
								{#each gear.filter(KIT_PICKS[e.pick].fits) as item (item.id)}
									<option value={item.id}>{item.name}</option>
								{/each}
							</select>
						</label>
					{/if}
				{/each}
			{/each}
		{/each}
		{#if custom}
			<label class="field">
				<span>Equipment package from</span>
				<select bind:value={choices.borrow}>
					<option value={undefined}>None</option>
					{#each BACKGROUND_BOOKS as book (book.key)}
						<optgroup label={book.name}>
							{#each backgrounds.filter((b) => b.source === book.key && b.id !== CUSTOM_BACKGROUND) as b (b.id)}
								<option value={b.id}>{b.name}</option>
							{/each}
						</optgroup>
					{/each}
				</select>
			</label>
		{/if}
		{#if !ready}<p class="lead">Choose the gear above to go on.</p>{/if}
	{/if}
{/if}

<nav class="footer">
	<button type="button" class="secondary" onclick={onback}>Back</button>
	<button type="button" class="primary" disabled={!ready} onclick={next}>Next</button>
</nav>

<style>
	.lead {
		margin: 12px 0;
		color: var(--color-text-muted);
	}

	.label {
		margin: 18px 0 8px;
	}

	.modes {
		display: grid;
		grid-template-columns: repeat(3, minmax(0, 1fr));
		gap: 4px;
		padding: 4px;
		background: var(--color-chip);
		border-radius: 14px;
	}

	.modes button {
		height: 42px;
		border: 0;
		border-radius: 10px;
		background: transparent;
		color: var(--color-text);
		font-size: 15px;
	}

	.modes button[aria-checked='true'] {
		background: var(--color-accent);
		color: var(--color-on-accent);
		font-weight: 800;
	}

	.options {
		display: flex;
		flex-direction: column;
		gap: 6px;
		margin-bottom: 10px;
	}

	.options button {
		min-height: 48px;
		padding: 8px 12px;
		border-radius: 12px;
		text-align: left;
		background: var(--color-surface);
		border: 1.5px solid var(--color-border-strong);
		color: var(--color-text);
		font-size: 15px;
		font-weight: 700;
	}

	.options button[aria-checked='true'] {
		background: var(--color-accent);
		border-color: var(--color-accent);
		color: var(--color-on-accent);
	}

	.always {
		margin-bottom: 10px;
		font-size: 15px;
	}

	.field {
		display: flex;
		flex-direction: column;
		gap: 4px;
		margin-bottom: 10px;
		min-width: 0;
	}

	.field span {
		font-size: 13px;
		font-weight: 700;
		color: var(--color-text-muted);
	}

	.field input,
	.field select {
		height: 48px;
		border-radius: 12px;
		padding: 0 12px;
		background: var(--color-surface);
		width: 100%;
	}

	.gold {
		display: flex;
		flex-direction: column;
		gap: 8px;
	}

	.roll {
		min-height: 48px;
		border-radius: 12px;
		background: var(--color-surface);
		border: 1.5px solid var(--color-border-strong);
		color: var(--color-accent);
		font-weight: 800;
	}

	.status {
		margin-top: 18px;
		padding: 16px;
		text-align: center;
		font-weight: 700;
	}

	.status button {
		margin-top: 10px;
		min-height: 40px;
		background: var(--color-surface);
		border: 1.5px solid var(--color-border-strong);
		color: var(--color-text);
		font-weight: 800;
	}

	.footer {
		position: sticky;
		bottom: 0;
		display: grid;
		grid-template-columns: minmax(0, 1fr) minmax(0, 2fr);
		gap: 8px;
		margin: 24px -16px 0;
		padding: 12px 16px calc(12px + env(safe-area-inset-bottom));
		background: var(--color-bg);
		border-top: 1px solid var(--color-border);
	}

	.footer button {
		height: 52px;
		border-radius: 14px;
		font-size: 16px;
		font-weight: 800;
	}

	.secondary {
		background: var(--color-surface);
		border: 1.5px solid var(--color-border-strong);
		color: var(--color-text);
	}

	.primary {
		border: 0;
		background: var(--color-accent);
		color: var(--color-on-accent);
	}

	.primary:disabled {
		opacity: 0.45;
	}
</style>
