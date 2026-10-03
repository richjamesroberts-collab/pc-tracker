<script lang="ts">
	import { untrack } from 'svelte';
	import Portrait from './Portrait.svelte';
	import { CLASSES } from '$lib/data/classes';
	import { RACES, RACE_MAP } from '$lib/data/races';
	import { portraitFromFile } from '$lib/image';
	import { METAMAGIC } from '$lib/rules/resources';
	import { ABILITIES, ABILITY_SHORT, abilityMod, signedMod } from '$lib/rules/abilities';
	import { abilityBreakdown, armorClass, initiative, maxHp, raceChoice, spellcastingMod } from '$lib/rules/stats';
	import { isCaster, SPELL_ABILITY, spellAttack, spellSaveDC } from '$lib/rules/spellcasting';
	import { WEAPONS, proficiencyLabel, proficiencyList, weaponProficiencySources } from '$lib/rules/proficiency';
	import { fightingStyleCount, fightingStyleOptions, FIGHTING_STYLE_MAP } from '$lib/rules/attacks';
	import { senses } from '$lib/rules/senses';
	import { levelForXp, xpForLevel } from '$lib/rules/xp';
	import type { Ability, Character } from '$lib/types';

	let {
		initial,
		isNew,
		onsave,
		oncancel
	}: { initial: Character; isNew: boolean; onsave: (c: Character) => void; oncancel: () => void } = $props();

	// Edit a local copy; nothing is saved until the player taps Save.
	let c = $state(untrack(() => structuredClone($state.snapshot(initial)) as Character));
	let photoError = $state('');
	// What's typed in each score box; only whole scores from 1 to 30 reach the character.
	let scores = $state(untrack(() => ({ ...c.abilities }) as Record<Ability, number | null>));

	const cls = $derived(CLASSES.find((x) => x.key === c.classKey));
	const race = $derived(c.raceKey ? RACE_MAP.get(c.raceKey) : undefined);
	const caster = $derived(isCaster(c));
	const ability = $derived(SPELL_ABILITY[c.classKey] ?? 'spellcasting');
	const whole = (n: unknown): n is number => typeof n === 'number' && Number.isInteger(n);
	const scoreOk = (n: number | null): n is number => whole(n) && n >= 1 && n <= 30;
	const scoresValid = $derived(ABILITIES.every((a) => scoreOk(scores[a.key])));
	const valid = $derived(
		c.name.trim().length > 0 &&
			whole(c.level) &&
			c.level >= 1 &&
			c.level <= 20 &&
			whole(c.hpBase) &&
			c.hpBase >= 1 &&
			(c.acAuto || whole(c.acBase)) &&
			(c.milestone || (whole(c.xp) && c.xp >= 0)) &&
			c.senses.every((x) => x.name.trim() && whole(x.range) && x.range > 0) &&
			scoresValid
	);

	// Proficiencies from class, subclass and race; the player's own picks are listed separately.
	const givenProfs = $derived(
		proficiencyList(weaponProficiencySources({ ...c, weaponProficiencies: [] }).flatMap((src) => src.weapons))
	);
	const givenSources = $derived(weaponProficiencySources({ ...c, weaponProficiencies: [] }));
	const allProfs = $derived(proficiencyList([...givenProfs, ...c.weaponProficiencies]));
	/** Weapons the character isn't proficient with yet, for the Add select. */
	const addableWeapons = $derived(
		WEAPONS.map((g) => ({ ...g, names: allProfs.includes(g.category) ? [] : g.names.filter((n) => !allProfs.includes(n)) })).filter(
			(g) => g.names.length
		)
	);
	const styleCount = $derived(fightingStyleCount(c));
	const styleOptions = $derived(fightingStyleOptions(c));
	const givenSenses = $derived(senses({ ...c, senses: [] }));
	const xpLevel = $derived(whole(c.xp) ? levelForXp(c.xp) : 0);

	function toggleProf(key: string) {
		c.weaponProficiencies = c.weaponProficiencies.includes(key)
			? c.weaponProficiencies.filter((k) => k !== key)
			: [...c.weaponProficiencies, key];
	}

	function toggleStyle(key: string) {
		c.fightingStyles = c.fightingStyles.includes(key) ? c.fightingStyles.filter((k) => k !== key) : [...c.fightingStyles, key];
	}

	function addSense() {
		c.senses = [...c.senses, { id: crypto.randomUUID(), name: 'Darkvision', range: 60 }];
	}

	// Worked-out numbers for the form as it stands, so the player sees what their entries come to.
	const preview = $derived.by(() => {
		const snap = $state.snapshot(c) as Character;
		if (!whole(snap.level) || snap.level < 1) snap.level = 1;
		if (!whole(snap.hpBase)) snap.hpBase = 1;
		if (!whole(snap.acBase)) snap.acBase = 10;
		if (!whole(snap.initiativeOverride)) snap.initiativeOverride = undefined;
		if (!whole(snap.spellModOverride)) snap.spellModOverride = undefined;
		const breakdown = abilityBreakdown(snap);
		const spellMod = spellcastingMod(snap, breakdown.scores);
		return {
			breakdown,
			ac: armorClass(snap, breakdown.scores),
			hp: maxHp(snap, breakdown),
			init: initiative({ ...snap, initiativeOverride: undefined }, breakdown.scores),
			spellModAuto: spellcastingMod({ ...snap, spellModOverride: undefined }, breakdown.scores),
			spellDc: spellSaveDC({ ...snap, spellMod }),
			spellAttack: spellAttack({ ...snap, spellMod })
		};
	});
	const choice = $derived(raceChoice(c));
	const sources = $derived(
		ABILITIES.flatMap((a) => preview.breakdown.sources[a.key].map((src) => ({ ability: a.short, ...src })))
	);

	function setScore(key: Ability, value: number | null) {
		scores[key] = value;
		if (scoreOk(value)) c.abilities[key] = value;
	}

	function togglePick(key: Ability) {
		const picks = c.raceAbilityChoices;
		if (picks.includes(key)) c.raceAbilityChoices = picks.filter((k) => k !== key);
		else if (choice && picks.length < choice.count) c.raceAbilityChoices = [...picks, key];
	}

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
		c.raceAbilityChoices = [];
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
		for (const key of ['speed', 'initiativeOverride', 'passivePerception', 'spellModOverride'] as const) {
			if (!whole(out[key])) out[key] = undefined;
		}
		if (!whole(out.acBase)) out.acBase = preview.ac.total;
		// Only picks the race still allows.
		out.raceAbilityChoices = choice ? out.raceAbilityChoices.filter((k) => choice.from.includes(k)).slice(0, choice.count) : [];
		if (!whole(out.hpCurrent) || isNew) out.hpCurrent = preview.hp.total;
		// Starting at (or moving up to) a level gives at least the XP that level needs.
		if (!whole(out.xp) || out.xp < 0) out.xp = 0;
		if (!out.milestone && (isNew || out.level !== initial.level)) out.xp = Math.max(out.xp, xpForLevel(out.level));
		out.senses = out.senses.map((x) => ({ ...x, name: x.name.trim() }));
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
				<select bind:value={c.subraceKey} onchange={() => (c.raceAbilityChoices = [])}>
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

	<div class="two even">
		<label class="field">
			<span>Experience points</span>
			<input type="number" inputmode="numeric" min="0" step="1" bind:value={c.xp} disabled={c.milestone} placeholder="0" />
		</label>
		<label class="check boxed">
			<input type="checkbox" bind:checked={c.milestone} />
			Milestone levelling
		</label>
	</div>
	{#if !c.milestone && xpLevel && xpLevel !== c.level}
		<p class="hint">
			{xpLevel > c.level
				? `${c.xp.toLocaleString('en')} XP is enough for level ${xpLevel}. Level up from Experience on Vitals.`
				: `Level ${c.level} starts at ${xpForLevel(c.level).toLocaleString('en')} XP; saving sets XP to at least that.`}
		</p>
	{/if}

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

	<fieldset>
		<legend class="label">Ability scores</legend>
		<p class="hint">
			Enter base scores: before racial increases and magic items, with any Ability Score Improvements from levelling.
		</p>
		<div class="scores">
			{#each ABILITIES as a (a.key)}
				{@const ok = scoreOk(scores[a.key])}
				{@const total = preview.breakdown.scores[a.key]}
				<label class="score" class:invalid={!ok}>
					<span class="abbr">{a.short}</span>
					<input
						type="number"
						inputmode="numeric"
						min="1"
						max="30"
						aria-label="{a.name} base score"
						bind:value={() => scores[a.key], (v) => setScore(a.key, v)}
					/>
					<span class="mod" aria-label="{a.name}: {total}, modifier {signedMod(abilityMod(total))}">
						{#if !ok}—{:else}{#if total !== c.abilities[a.key]}<span class="total">{total}</span>{/if}{signedMod(abilityMod(total))}{/if}
					</span>
				</label>
			{/each}
		</div>
		{#if !scoresValid}<p class="error">Scores go from 1 to 30.</p>{/if}

		{#if choice}
			<div class="picks">
				<p class="sub">
					{race?.name ?? 'Race'}: choose {choice.count === 1 ? 'one ability' : `${choice.count} abilities`} to raise by {choice.amount}
					({c.raceAbilityChoices.length}/{choice.count})
				</p>
				<div class="chips">
					{#each choice.from as k (k)}
						{@const on = c.raceAbilityChoices.includes(k)}
						<button
							type="button"
							aria-pressed={on}
							disabled={!on && c.raceAbilityChoices.length >= choice.count}
							onclick={() => togglePick(k)}>{ABILITY_SHORT[k]}</button
						>
					{/each}
				</div>
			</div>
		{/if}

		{#if sources.length}
			<ul class="sources">
				{#each sources as src, i (i)}
					<li><b>{src.ability} {src.value}</b> {src.label}</li>
				{/each}
			</ul>
		{/if}
	</fieldset>

	<fieldset>
		<legend class="label">Armor class</legend>
		<div class="modes" role="radiogroup" aria-label="How AC is set">
			<button type="button" role="radio" aria-checked={c.acAuto} onclick={() => (c.acAuto = true)}>Work it out</button>
			<button type="button" role="radio" aria-checked={!c.acAuto} onclick={() => (c.acAuto = false)}>Enter my AC</button>
		</div>
		{#if c.acAuto}
			<p class="derived ac">AC {preview.ac.total}</p>
			<p class="hint">
				{preview.ac.parts.map((p) => `${p.label} ${p.value}`).join(' · ')}. Equip armor and shields in Inventory.
			</p>
		{:else}
			<label class="field">
				<span>AC</span>
				<input type="number" inputmode="numeric" min="0" bind:value={c.acBase} required />
			</label>
			{#if preview.ac.total !== c.acBase}
				<p class="hint">With items and adjustments: AC {preview.ac.total}</p>
			{/if}
		{/if}
	</fieldset>

	<div class="three">
		<label class="field">
			<span>Max HP</span>
			<input type="number" inputmode="numeric" min="1" bind:value={c.hpBase} required />
		</label>
		{#if !isNew}
			<label class="field">
				<span>Current HP</span>
				<input type="number" inputmode="numeric" min="0" max={preview.hp.total} bind:value={c.hpCurrent} />
			</label>
		{/if}
		<label class="field">
			<span>Speed</span>
			<input type="number" inputmode="numeric" min="0" step="5" bind:value={c.speed} placeholder="30" />
		</label>
	</div>
	{#if preview.hp.total !== c.hpBase}
		<p class="hint">With magic items: max HP {preview.hp.total} ({preview.hp.parts.slice(1).map((p) => `${p.label} ${p.value}`).join(', ')})</p>
	{/if}

	<div class="two even">
		<label class="field">
			<span>Initiative</span>
			<input type="number" inputmode="numeric" bind:value={c.initiativeOverride} placeholder={signedMod(preview.init.total)} />
		</label>
		<label class="field">
			<span>Passive Perc.</span>
			<input type="number" inputmode="numeric" min="0" bind:value={c.passivePerception} placeholder="12" />
		</label>
	</div>
	<p class="hint">
		Initiative: {preview.init.parts.map((p) => `${p.label} ${p.value}`).join(', ')}.
		{c.initiativeOverride != null ? 'Clear the box to use this.' : 'Type a number to use your own (Alert feat).'}
	</p>

	<fieldset>
		<legend class="label">Weapon proficiencies</legend>
		{#if givenSources.length}
			<ul class="sources">
				{#each givenSources as src (src.source)}
					<li><b>{src.source}</b> {proficiencyList(src.weapons).map(proficiencyLabel).join(', ')}</li>
				{/each}
			</ul>
		{/if}
		{#if !givenProfs.includes('martial') || c.weaponProficiencies.length}
			<p class="sub">Also proficient with (feats, multiclassing, Kensei or Bladesinger picks)</p>
		{/if}
		<div class="chips">
			{#each ['simple', 'martial'] as k (k)}
				{#if !givenProfs.includes(k)}
					<button type="button" aria-pressed={c.weaponProficiencies.includes(k)} onclick={() => toggleProf(k)}>{proficiencyLabel(k)}</button>
				{/if}
			{/each}
			{#each c.weaponProficiencies.filter((k) => k !== 'simple' && k !== 'martial') as k (k)}
				<button type="button" aria-pressed="true" aria-label="Remove {proficiencyLabel(k)}" onclick={() => toggleProf(k)}>{proficiencyLabel(k)} ×</button>
			{/each}
		</div>
		{#if addableWeapons.length}
			<label class="field">
				<span>Add a weapon</span>
				<select
					value=""
					onchange={(e) => {
						const v = e.currentTarget.value;
						if (v) toggleProf(v);
						e.currentTarget.value = '';
					}}
				>
					<option value="">Choose…</option>
					{#each addableWeapons as g (g.category)}
						<optgroup label={proficiencyLabel(g.category)}>
							{#each g.names as n (n)}<option value={n}>{proficiencyLabel(n)}</option>{/each}
						</optgroup>
					{/each}
				</select>
			</label>
		{/if}
	</fieldset>

	<fieldset>
		<legend class="label">Fighting styles</legend>
		<p class="hint">
			{styleCount
				? `Your class gives ${styleCount === 1 ? 'one' : styleCount} (${c.fightingStyles.length} picked).`
				: 'Your class has none at this level; pick one if you took the Fighting Initiate feat.'}
			Archery, Defense, Dueling, Two-Weapon and Unarmed Fighting are worked into AC and Attacks.
		</p>
		<div class="chips">
			{#each styleOptions as st (st.key)}
				<button type="button" aria-pressed={c.fightingStyles.includes(st.key)} onclick={() => toggleStyle(st.key)}>{st.name}</button>
			{/each}
			{#each c.fightingStyles.filter((k) => !styleOptions.some((o) => o.key === k)) as k (k)}
				<button type="button" aria-pressed="true" onclick={() => toggleStyle(k)}>{FIGHTING_STYLE_MAP.get(k)?.name ?? k} ×</button>
			{/each}
		</div>
		{#each c.fightingStyles as k (k)}
			{@const st = FIGHTING_STYLE_MAP.get(k)}
			{#if st}<p class="hint"><b>{st.name}:</b> {st.text}</p>{/if}
		{/each}
	</fieldset>

	<fieldset>
		<legend class="label">Senses</legend>
		{#if givenSenses.length}
			<ul class="sources">
				{#each givenSenses as sense (sense.name)}
					<li><b>{sense.name} {sense.range} ft</b> {sense.sources.join(', ')}</li>
				{/each}
			</ul>
		{:else}
			<p class="hint">Nothing from your race or class.</p>
		{/if}
		{#each c.senses as sense, i (sense.id)}
			<div class="sense">
				<label class="field">
					<span>Sense</span>
					<input bind:value={sense.name} list="sense-names" autocapitalize="words" required />
				</label>
				<label class="field">
					<span>Range (ft)</span>
					<input type="number" inputmode="numeric" min="5" step="5" bind:value={sense.range} required />
				</label>
				<button type="button" class="remove" aria-label="Remove {sense.name}" onclick={() => (c.senses = c.senses.filter((_, j) => j !== i))}>×</button>
			</div>
		{/each}
		<datalist id="sense-names">
			<option value="Darkvision"></option>
			<option value="Blindsight"></option>
			<option value="Tremorsense"></option>
			<option value="Truesight"></option>
			<option value="Devil's Sight"></option>
		</datalist>
		<button type="button" class="add-sense" onclick={addSense}>Add a sense</button>
		<p class="hint">For Custom Lineage darkvision, Goggles of Night, Devil's Sight and the like. The longest range of each sense counts.</p>
	</fieldset>

	{#if caster}
		<fieldset>
			<legend class="label">Spellcasting</legend>
			<label class="field">
				<span>{ability} modifier</span>
				<input
					type="number"
					inputmode="numeric"
					min="-5"
					max="10"
					bind:value={c.spellModOverride}
					placeholder={signedMod(preview.spellModAuto)}
				/>
			</label>
			<p class="hint">
				Your {ability} modifier is {signedMod(preview.spellModAuto)}.
				{c.spellModOverride != null ? 'Clear the box to use it.' : 'Type a number only to use something else.'}
			</p>
			<p class="derived">Spell save DC {preview.spellDc} · spell attack {signedMod(preview.spellAttack)}</p>

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

	.scores {
		display: grid;
		grid-template-columns: repeat(3, minmax(0, 1fr));
		gap: 8px;
	}

	.score {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 4px;
		padding: 8px 6px 6px;
		border-radius: 14px;
		background: var(--color-surface-raised);
		min-width: 0;
	}

	.abbr {
		font-size: 12px;
		font-weight: 800;
		letter-spacing: 0.08em;
		color: var(--color-text-muted);
	}

	.score input {
		width: 100%;
		height: 44px;
		border-radius: 10px;
		padding: 0 4px;
		background: var(--color-surface);
		text-align: center;
		font-size: 20px;
		font-weight: 800;
	}

	.score.invalid input {
		border-color: var(--color-danger);
	}

	.mod {
		font-family: var(--font-display);
		font-size: 18px;
		font-weight: 900;
		font-variant-numeric: tabular-nums;
		color: var(--color-accent);
	}

	.hint {
		font-size: 13px;
		color: var(--color-text-muted);
	}

	.total {
		margin-right: 4px;
		color: var(--color-text);
	}

	.picks {
		display: flex;
		flex-direction: column;
		gap: 6px;
	}

	.chips {
		display: flex;
		flex-wrap: wrap;
		gap: 6px;
	}

	.chips button {
		min-width: 52px;
		min-height: 40px;
		background: var(--color-surface);
		border: 1.5px solid var(--color-border-strong);
		color: var(--color-text);
		font-weight: 800;
	}

	.chips button[aria-pressed='true'] {
		background: var(--color-accent);
		border-color: var(--color-accent);
		color: var(--color-on-accent);
	}

	.chips button:disabled {
		opacity: 0.4;
	}

	.sources {
		list-style: none;
		display: flex;
		flex-direction: column;
		gap: 2px;
		font-size: 13px;
		color: var(--color-text-muted);
	}

	.sources b {
		color: var(--color-text);
	}

	.modes {
		display: grid;
		grid-template-columns: repeat(2, minmax(0, 1fr));
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

	.derived.ac {
		font-size: 20px;
		font-weight: 900;
		color: var(--color-accent);
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

	.check.boxed {
		align-self: end;
		height: 48px;
		min-height: 48px;
		font-weight: 600;
	}

	.check.boxed input {
		accent-color: var(--color-accent);
	}

	.field input:disabled {
		opacity: 0.5;
	}

	.sense {
		display: grid;
		grid-template-columns: minmax(0, 2fr) minmax(0, 1fr) 44px;
		align-items: end;
		gap: 8px;
	}

	.remove {
		height: 48px;
		padding: 0;
		background: var(--color-surface);
		border: 1.5px solid var(--color-border-strong);
		color: var(--color-text-muted);
		font-size: 20px;
		font-weight: 800;
	}

	.add-sense {
		min-height: 44px;
		border-radius: 12px;
		border: 1.5px dashed var(--color-border-strong);
		background: transparent;
		color: var(--color-accent);
		font-weight: 800;
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
