<script lang="ts">
	import { untrack } from 'svelte';
	import Portrait from './Portrait.svelte';
	import { CLASSES } from '$lib/data/classes';
	import { RACES, RACE_MAP } from '$lib/data/races';
	import { portraitFromFile } from '$lib/image';
	import { METAMAGIC } from '$lib/rules/resources';
	import { isCaster, SPELL_ABILITY, spellAttack, spellSaveDC } from '$lib/rules/spellcasting';
	import type { Character } from '$lib/types';

	let {
		initial,
		isNew,
		onsave,
		oncancel
	}: { initial: Character; isNew: boolean; onsave: (c: Character) => void; oncancel: () => void } = $props();

	// Edit a local copy; nothing is saved until the player taps Save.
	let c = $state(untrack(() => structuredClone($state.snapshot(initial)) as Character));
	let photoError = $state('');

	const cls = $derived(CLASSES.find((x) => x.key === c.classKey));
	const race = $derived(c.raceKey ? RACE_MAP.get(c.raceKey) : undefined);
	const caster = $derived(isCaster(c));
	const ability = $derived(SPELL_ABILITY[c.classKey] ?? 'spellcasting');
	const whole = (n: unknown): n is number => typeof n === 'number' && Number.isInteger(n);
	const valid = $derived(
		c.name.trim().length > 0 && whole(c.level) && c.level >= 1 && c.level <= 20 && whole(c.hpMax) && c.hpMax >= 1 && whole(c.ac)
	);

	async function pickPhoto(e: Event) {
		const file = (e.currentTarget as HTMLInputElement).files?.[0];
		if (!file) return;
		photoError = '';
		try {
			c.image = await portraitFromFile(file);
		} catch {
			photoError = "Couldn't read that image. Try a JPEG or PNG.";
		}
	}

	function onRaceChange() {
		c.subraceKey = undefined;
	}

	function onClassChange() {
		c.subclassKey = undefined;
	}

	function toggleMetamagic(key: string, on: boolean) {
		c.metamagic = on ? [...c.metamagic, key] : c.metamagic.filter((k) => k !== key);
	}

	function submit(e: SubmitEvent) {
		e.preventDefault();
		if (!valid) return;
		const out = $state.snapshot(c) as Character;
		out.name = out.name.trim();
		// Cleared number fields come back as null; optional stats are just left out.
		for (const key of ['speed', 'initiativeModifier', 'passivePerception'] as const) {
			if (!whole(out[key])) out[key] = undefined;
		}
		if (!whole(out.spellMod)) out.spellMod = 0;
		if (!whole(out.hpCurrent)) out.hpCurrent = out.hpMax;
		if (isNew) out.hpCurrent = out.hpMax;
		out.hpCurrent = Math.min(out.hpCurrent, out.hpMax);
		onsave(out);
	}
</script>

<form onsubmit={submit}>
	<div class="photo">
		<label class="photo-pick">
			<Portrait name={c.name || '?'} image={c.image} size={96} />
			<span class="link">{c.image ? 'Change photo' : 'Add photo'}</span>
			<input class="sr-only" type="file" accept="image/*" onchange={pickPhoto} />
		</label>
		{#if c.image}
			<button type="button" class="text-btn" onclick={() => (c.image = undefined)}>Remove photo</button>
		{/if}
		{#if photoError}<p class="error">{photoError}</p>{/if}
	</div>

	<label class="field">
		<span>Character name</span>
		<input bind:value={c.name} required autocomplete="off" autocapitalize="words" placeholder="Lyra Ashwood" />
	</label>

	<div class="two even">
		<label class="field">
			<span>Race</span>
			<select bind:value={c.raceKey} onchange={onRaceChange}>
				<option value={undefined}>Choose…</option>
				{#each RACES as r (r.key)}
					<option value={r.key}>{r.name}</option>
				{/each}
			</select>
		</label>
		{#if race && race.subraces.length}
			<label class="field">
				<span>{race.key === 'dragonborn' ? 'Ancestry' : 'Subrace'}</span>
				<select bind:value={c.subraceKey}>
					<option value={undefined}>Choose…</option>
					{#each race.subraces as s (s.key)}
						<option value={s.key}>{s.name}</option>
					{/each}
				</select>
			</label>
		{/if}
	</div>

	<div class="two">
		<label class="field">
			<span>Class</span>
			<select bind:value={c.classKey} onchange={onClassChange}>
				{#each CLASSES as k (k.key)}
					<option value={k.key}>{k.name}</option>
				{/each}
			</select>
		</label>
		<label class="field">
			<span>Level</span>
			<input type="number" inputmode="numeric" min="1" max="20" bind:value={c.level} required />
		</label>
	</div>

	{#if cls}
		<label class="field">
			<span>Subclass</span>
			<select bind:value={c.subclassKey}>
				<option value={undefined}>None yet</option>
				{#each cls.subclasses as s (s.key)}
					<option value={s.key}>{s.name}</option>
				{/each}
			</select>
		</label>
	{/if}

	<div class="three">
		<label class="field">
			<span>AC</span>
			<input type="number" inputmode="numeric" min="0" bind:value={c.ac} required />
		</label>
		<label class="field">
			<span>Max HP</span>
			<input type="number" inputmode="numeric" min="1" bind:value={c.hpMax} required />
		</label>
		{#if !isNew}
			<label class="field">
				<span>Current HP</span>
				<input type="number" inputmode="numeric" min="0" max={c.hpMax} bind:value={c.hpCurrent} />
			</label>
		{/if}
	</div>

	<div class="three">
		<label class="field">
			<span>Speed</span>
			<input type="number" inputmode="numeric" min="0" step="5" bind:value={c.speed} placeholder="30" />
		</label>
		<label class="field">
			<span>Initiative</span>
			<input type="number" inputmode="numeric" bind:value={c.initiativeModifier} placeholder="+2" />
		</label>
		<label class="field">
			<span>Passive Perc.</span>
			<input type="number" inputmode="numeric" min="0" bind:value={c.passivePerception} placeholder="12" />
		</label>
	</div>

	{#if caster}
		<fieldset>
			<legend class="label">Spellcasting</legend>
			<label class="field">
				<span>{ability} modifier</span>
				<input type="number" inputmode="numeric" min="-5" max="10" bind:value={c.spellMod} />
			</label>
			<p class="derived">Spell save DC {spellSaveDC(c)} · spell attack +{spellAttack(c)}</p>

			{#if c.classKey === 'sorcerer' && c.level >= 3}
				<p class="sub">Metamagic options</p>
				<div class="checks">
					{#each METAMAGIC as m (m.key)}
						<label class="check">
							<input
								type="checkbox"
								checked={c.metamagic.includes(m.key)}
								onchange={(e) => toggleMetamagic(m.key, e.currentTarget.checked)}
							/>
							{m.name}
						</label>
					{/each}
				</div>
			{/if}
		</fieldset>
	{/if}

	<div class="buttons">
		<button type="button" class="secondary" onclick={oncancel}>Cancel</button>
		<button type="submit" class="primary" disabled={!valid}>{isNew ? 'Create character' : 'Save'}</button>
	</div>
</form>

<style>
	form {
		display: flex;
		flex-direction: column;
		gap: 14px;
	}

	.photo {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 4px;
	}

	.photo-pick {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 8px;
		cursor: pointer;
	}

	.link,
	.text-btn {
		color: var(--color-accent);
		font-weight: 700;
		font-size: 15px;
	}

	.text-btn {
		border: 0;
		background: transparent;
		min-height: 40px;
	}

	.error {
		color: var(--color-danger);
		font-size: 14px;
	}

	.field {
		display: flex;
		flex-direction: column;
		gap: 4px;
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

	.two {
		display: grid;
		grid-template-columns: 2fr 1fr;
		gap: 10px;
	}

	.two.even {
		grid-template-columns: repeat(2, minmax(0, 1fr));
	}

	/* Race alone (no subraces yet) takes the full row. */
	.two.even > :only-child {
		grid-column: 1 / -1;
	}

	.three {
		display: grid;
		grid-template-columns: repeat(3, minmax(0, 1fr));
		gap: 10px;
	}

	fieldset {
		border: 1px solid var(--color-border);
		border-radius: var(--radius-lg);
		padding: 12px 14px 14px;
		display: flex;
		flex-direction: column;
		gap: 10px;
	}

	legend {
		padding: 0 6px;
	}

	.derived {
		font-size: 14px;
		font-weight: 700;
		color: var(--color-spell-ink);
	}

	.sub {
		font-size: 13px;
		font-weight: 700;
		color: var(--color-text-muted);
	}

	.checks {
		display: grid;
		grid-template-columns: repeat(2, minmax(0, 1fr));
		gap: 2px 10px;
	}

	.check {
		display: flex;
		align-items: center;
		gap: 8px;
		min-height: 40px;
		font-size: 15px;
	}

	.check input {
		width: 20px;
		height: 20px;
		accent-color: var(--color-spell-ink);
	}

	.buttons {
		display: grid;
		grid-template-columns: 1fr 2fr;
		gap: 8px;
		margin-top: 6px;
	}

	.buttons button {
		height: 52px;
		border-radius: 14px;
		font-size: 16px;
		font-weight: 800;
	}

	.primary {
		background: var(--color-accent);
		border-color: var(--color-accent-edge);
		color: var(--color-on-accent);
	}

	.primary:disabled {
		opacity: 0.5;
	}

	.secondary {
		background: var(--color-surface);
		border: 1.5px solid var(--color-border-strong);
		color: var(--color-text);
	}
</style>
