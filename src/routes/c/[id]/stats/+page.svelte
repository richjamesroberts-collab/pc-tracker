<script lang="ts">
	import { resolve } from '$app/paths';
	import Sheet from '$lib/components/Sheet.svelte';
	import CheckSheet, { type Check } from '$lib/components/CheckSheet.svelte';
	import SavingThrows from '$lib/components/SavingThrows.svelte';
	import XpSheet from '$lib/components/XpSheet.svelte';
	import ShortRestSheet from '$lib/components/ShortRestSheet.svelte';
	import { session } from '$lib/session.svelte';
	import { CLASSES } from '$lib/data/classes';
	import { hitDiceLeft, hitDiceMax } from '$lib/rules/resources';
	import { proficiencyBonus } from '$lib/rules/spellcasting';
	import { ABILITIES, abilityMod, signedMod } from '$lib/rules/abilities';
	import { abilityBreakdown } from '$lib/rules/stats';
	import { skillChecks, type SkillLevel } from '$lib/rules/skills';
	import { hitDie, xpProgress } from '$lib/rules/xp';
	import type { Character } from '$lib/types';

	const c = $derived(session.character as Character);
	const cls = $derived(CLASSES.find((x) => x.key === c.classKey));
	const abilities = $derived(abilityBreakdown(c));
	const skills = $derived(skillChecks(c, abilities));
	const xp = $derived(xpProgress(c));

	const LEVEL: Record<SkillLevel, string> = { none: 'Not proficient', half: 'Half proficiency', proficient: 'Proficient', expertise: 'Expertise' };
	/** The skill whose sheet is open. */
	let skillKey = $state<string | null>(null);
	const openSkill = $derived.by((): Check | null => {
		const s = skills.find((x) => x.key === skillKey);
		return s ? { ...s, sub: `${ABILITIES.find((a) => a.key === s.ability)?.name} · ${LEVEL[s.level]}` } : null;
	});

	let abilitiesOpen = $state(false);
	let xpOpen = $state(false);
	let restOpen = $state(false);
</script>

<div class="top">
	<h1>Stats</h1>
	<p>{cls?.name ?? c.classKey} {c.level}</p>
</div>

<button type="button" class="abilities" aria-label="Ability scores. Tap for details." onclick={() => (abilitiesOpen = true)}>
	{#each ABILITIES as a (a.key)}
		{@const score = abilities.scores[a.key]}
		<span class="ability" class:boosted={score !== abilities.withoutItems[a.key]}>
			<span class="abbr">{a.short}</span>
			<strong>{signedMod(abilityMod(score))}</strong>
			<span class="score">{score}</span>
		</span>
	{/each}
</button>

<div class="pair">
	<div class="stat"><strong>{signedMod(proficiencyBonus(c.level))}</strong><span>Proficiency</span></div>
	<button
		type="button"
		class="card dice"
		aria-label="Hit dice: {hitDiceLeft(c)} of {hitDiceMax(c)} d{hitDie(c.classKey)} left. Tap for a short rest."
		onclick={() => (restOpen = true)}
	>
		<span class="label">Hit dice</span>
		<span class="dice-num"><b>{hitDiceLeft(c)}</b> / {hitDiceMax(c)} d{hitDie(c.classKey)}</span>
		<span class="more">Short rest ›</span>
	</button>
</div>

<SavingThrows />

<section class="skills" aria-labelledby="skills-title">
	<h2 id="skills-title" class="label">Skills</h2>
	<div class="card skill-list">
		{#each skills as s (s.key)}
			<button
				type="button"
				class="skill"
				aria-label="{s.name} {signedMod(s.total)}{s.level === 'none' ? '' : `, ${s.level === 'half' ? 'half proficiency' : s.level}`}. Tap for details."
				onclick={() => (skillKey = s.key)}
			>
				<span class="prof {s.level}" aria-hidden="true"></span>
				<span class="s-name">{s.name}{#if s.notes.some((n) => !n.startsWith('Passive'))}<span class="s-flag" aria-hidden="true">*</span>{/if}</span>
				<span class="s-mod">{signedMod(s.total)}</span>
			</button>
		{/each}
	</div>
</section>

{#if c.milestone}
	<button type="button" class="card xp" aria-label="Level {c.level}, milestone levelling. Tap to level up." onclick={() => (xpOpen = true)}>
		<span class="xp-head">
			<span class="label">Level {c.level}</span>
			<span class="more">Level up ›</span>
		</span>
		<span class="xp-next">Milestone levelling: level up when your DM says so.</span>
	</button>
{:else}
	<button type="button" class="card xp" aria-label="Experience: {c.xp} XP. Tap to add XP or level up." onclick={() => (xpOpen = true)}>
		<span class="xp-head">
			<span class="label">Experience</span>
			{#if xp.ready}
				<span class="ready">Level up!</span>
			{:else}
				<span class="xp-num">{c.xp.toLocaleString('en')}{xp.next !== null ? ` / ${xp.next.toLocaleString('en')}` : ''} XP</span>
			{/if}
		</span>
		<span class="xp-bar" aria-hidden="true"><span class="xp-fill" class:ready={xp.ready} style:width="{xp.fraction * 100}%"></span></span>
		{#if xp.next !== null}
			<span class="xp-next">{xp.ready ? `${c.xp.toLocaleString('en')} XP · tap to reach level ${c.level + 1}` : `${(xp.next - c.xp).toLocaleString('en')} to level ${c.level + 1}`}</span>
		{/if}
	</button>
{/if}

<CheckSheet check={openSkill} edit="Change skill proficiencies in Edit" onclose={() => (skillKey = null)} />
<XpSheet open={xpOpen} onclose={() => (xpOpen = false)} />
<ShortRestSheet open={restOpen} onclose={() => (restOpen = false)} />

<Sheet open={abilitiesOpen} onclose={() => (abilitiesOpen = false)} label="Ability scores">
	<h2 class="sheet-title">Ability scores</h2>
	<ul class="ability-list">
		{#each ABILITIES as a (a.key)}
			{@const score = abilities.scores[a.key]}
			<li>
				<span class="name">{a.name}</span>
				<span class="total"><b>{score}</b> {signedMod(abilityMod(score))}</span>
				<span class="from">
					{[`Base ${c.abilities[a.key]}`, ...abilities.sources[a.key].map((src) => `${src.label} ${src.value}`)].join(' · ')}
				</span>
			</li>
		{/each}
	</ul>
	<a class="edit-link" href={resolve('/c/[id]/edit', { id: c.id })}>Change base scores in Edit</a>
</Sheet>

<style>
	.top {
		display: flex;
		align-items: baseline;
		justify-content: space-between;
		gap: 8px;
		margin-bottom: 12px;
	}

	h1 {
		font-size: 26px;
		font-weight: 900;
	}

	.top p {
		font-size: 13px;
		font-weight: 700;
		color: var(--color-text-muted);
	}

	.abilities {
		display: grid;
		grid-template-columns: repeat(6, minmax(0, 1fr));
		gap: 6px;
		width: 100%;
		padding: 0;
		border: 0;
		border-radius: 0;
		background: transparent;
		color: var(--color-text);
		font-weight: 400;
	}

	.ability {
		display: flex;
		flex-direction: column;
		align-items: center;
		min-width: 0;
		padding: 6px 2px 5px;
		border-radius: 12px;
		background: var(--color-surface-raised);
	}

	.ability .abbr {
		font-size: 10px;
		font-weight: 800;
		letter-spacing: 0.08em;
		color: var(--color-text-muted);
	}

	.ability strong {
		font-family: var(--font-display);
		font-size: 19px;
		font-weight: 900;
		line-height: 1.2;
		font-variant-numeric: tabular-nums;
	}

	.ability .score {
		font-size: 12px;
		font-weight: 700;
		color: var(--color-text-muted);
		font-variant-numeric: tabular-nums;
	}

	/* Raised by a magic item right now. */
	.ability.boosted {
		background: var(--color-effect-bg);
	}

	.ability.boosted strong,
	.ability.boosted .score {
		color: var(--color-effect-ink);
	}

	/* Proficiency bonus beside the hit dice. */
	.pair {
		display: grid;
		grid-template-columns: minmax(0, 1fr) minmax(0, 2.4fr);
		gap: 8px;
		margin-top: 12px;
	}

	.stat {
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		padding: 10px 4px;
		border-radius: 12px;
		background: var(--color-surface-raised);
	}

	.stat strong {
		font-family: var(--font-display);
		font-size: 20px;
		font-weight: 900;
	}

	.stat span {
		font-size: 11px;
		font-weight: 700;
		line-height: 1.3;
		text-align: center;
		color: var(--color-text-muted);
	}

	.dice {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 2px 10px;
		width: 100%;
		padding: 10px 14px;
		color: var(--color-text);
		font-weight: 400;
		text-align: left;
	}

	.dice .label {
		flex: 1;
	}

	.dice-num {
		font-size: 14px;
		font-weight: 700;
		color: var(--color-text-muted);
		font-variant-numeric: tabular-nums;
	}

	.dice-num b {
		font-family: var(--font-display);
		font-size: 20px;
		font-weight: 900;
		color: var(--color-text);
	}

	.more {
		font-size: 12px;
		font-weight: 800;
		color: var(--color-accent);
	}

	.dice .more {
		flex-basis: 100%;
	}

	.skills {
		margin-top: 10px;
	}

	.skills .label {
		margin: 0 4px 6px;
	}

	/* Two columns, filled down then across like a printed sheet. */
	.skill-list {
		display: grid;
		grid-template-columns: repeat(2, minmax(0, 1fr));
		grid-template-rows: repeat(9, auto);
		grid-auto-flow: column;
		column-gap: 1px;
		overflow: hidden;
		background: var(--color-border);
	}

	.skill {
		display: grid;
		grid-template-columns: 10px minmax(0, 1fr) auto;
		align-items: center;
		gap: 6px;
		min-height: 36px;
		padding: 4px 10px;
		border: 0;
		border-radius: 0;
		background: var(--color-surface);
		color: var(--color-text);
		font-weight: 400;
		text-align: left;
	}

	.skill:not(:nth-child(9n + 1)) {
		box-shadow: inset 0 1px 0 var(--color-border);
	}

	.prof {
		width: 10px;
		height: 10px;
		border-radius: 50%;
		border: 1.5px solid var(--color-border-strong);
	}

	.prof.half {
		background: linear-gradient(90deg, var(--color-accent) 50%, transparent 50%);
		border-color: var(--color-accent);
	}

	.prof.proficient {
		background: var(--color-accent);
		border-color: var(--color-accent);
	}

	.prof.expertise {
		background: var(--color-accent);
		border-color: var(--color-accent);
		box-shadow: 0 0 0 2px var(--color-surface), 0 0 0 3.5px var(--color-accent);
	}

	.s-name {
		min-width: 0;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
		font-size: 14px;
		font-weight: 600;
	}

	.s-flag {
		margin-left: 2px;
		color: var(--color-effect-ink);
		font-weight: 900;
	}

	.s-mod {
		font-family: var(--font-display);
		font-size: 16px;
		font-weight: 900;
		font-variant-numeric: tabular-nums;
	}

	.xp {
		display: flex;
		flex-direction: column;
		gap: 6px;
		width: 100%;
		margin-top: 12px;
		padding: 12px 16px;
		color: var(--color-text);
		font-weight: 400;
		text-align: left;
	}

	.xp-head {
		display: flex;
		justify-content: space-between;
		align-items: baseline;
		gap: 8px;
	}

	.xp-num {
		font-size: 14px;
		font-weight: 800;
		font-variant-numeric: tabular-nums;
	}

	.ready {
		font-size: 13px;
		font-weight: 900;
		padding: 2px 10px;
		border-radius: 999px;
		background: var(--color-ready-bg);
		color: var(--color-ready-ink);
	}

	.xp-bar {
		display: block;
		height: 8px;
		border-radius: 999px;
		background: var(--color-chip);
		overflow: hidden;
	}

	.xp-fill {
		display: block;
		height: 100%;
		background: var(--color-accent);
	}

	.xp-fill.ready {
		background: var(--color-heal);
	}

	.xp-next {
		font-size: 12px;
		color: var(--color-text-muted);
	}

	.sheet-title {
		font-size: 22px;
	}

	.ability-list {
		list-style: none;
		margin-top: 8px;
	}

	.ability-list li {
		display: grid;
		grid-template-columns: 1fr auto;
		gap: 0 8px;
		padding: 10px 0;
	}

	.ability-list li + li {
		border-top: 1px solid var(--color-border);
	}

	.ability-list .name {
		font-weight: 700;
	}

	.ability-list .total {
		font-variant-numeric: tabular-nums;
		color: var(--color-text-muted);
		font-weight: 700;
	}

	.ability-list .total b {
		font-size: 18px;
		color: var(--color-text);
	}

	.ability-list .from {
		grid-column: 1 / -1;
		font-size: 13px;
		color: var(--color-text-muted);
	}

	.edit-link {
		display: block;
		margin-top: 12px;
		padding: 12px 0;
		text-align: center;
		color: var(--color-accent);
		font-weight: 800;
	}
</style>
