<script lang="ts">
	import { resolve } from '$app/paths';
	import Portrait from '$lib/components/Portrait.svelte';
	import AcShield from '$lib/components/AcShield.svelte';
	import HpSheet, { type HpMode } from '$lib/components/HpSheet.svelte';
	import DeathSaves from '$lib/components/DeathSaves.svelte';
	import Pips from '$lib/components/Pips.svelte';
	import Sheet from '$lib/components/Sheet.svelte';
	import BackupSheet from '$lib/components/BackupSheet.svelte';
	import ThemeToggle from '$lib/components/ThemeToggle.svelte';
	import { theme } from '$lib/theme.svelte';
	import { session } from '$lib/session.svelte';
	import { CLASSES } from '$lib/data/classes';
	import { isDead, isDown } from '$lib/rules/hp';
	import { longRest, shortRest, sorceryPointsLeft, sorceryPointsMax } from '$lib/rules/resources';
	import { isCaster, ordinal, pactSlots, slotMax, slotsLeft, spellSaveDC } from '$lib/rules/spellcasting';
	import { backupIsStale } from '$lib/backup/staleness';
	import type { Character } from '$lib/types';

	const c = $derived(session.character as Character);
	const cls = $derived(CLASSES.find((x) => x.key === c.classKey));
	const subclass = $derived(cls?.subclasses.find((s) => s.key === c.subclassKey)?.name);
	const down = $derived(isDown(c));
	const caster = $derived(isCaster(c));
	const hpPct = $derived(Math.max(0, Math.min(100, (c.hpCurrent / c.hpMax) * 100)));
	const tempPct = $derived(Math.min(100 - hpPct, (c.tempHp / c.hpMax) * 100));
	const hpTone = $derived(hpPct > 50 ? 'high' : hpPct > 25 ? 'mid' : 'low');
	const pact = $derived(pactSlots(c));
	const spMax = $derived(sorceryPointsMax(c));

	const stats = $derived(
		[
			c.speed != null && { k: 'Speed', v: `${c.speed}` },
			c.initiativeModifier != null && { k: 'Init', v: `${c.initiativeModifier >= 0 ? '+' : ''}${c.initiativeModifier}` },
			c.passivePerception != null && { k: 'Passive', v: `${c.passivePerception}` },
			caster && { k: 'Save DC', v: `${spellSaveDC(c)}` }
		].filter((s): s is { k: string; v: string } => !!s)
	);

	let hpOpen = $state(false);
	let hpMode = $state<HpMode>('damage');
	let menuOpen = $state(false);
	let backupOpen = $state(false);

	function openHp(mode: HpMode) {
		hpMode = mode;
		hpOpen = true;
	}

	function resolveConcentration(kept: boolean) {
		const check = session.concentrationCheck;
		session.concentrationCheck = null;
		if (!check || kept) return;
		session.mutate(`Lost concentration on ${check.spell}`, (ch) => (ch.concentration = undefined));
	}

	function rest(kind: 'short' | 'long') {
		menuOpen = false;
		if (kind === 'long') session.mutate('Long rest: HP, slots and points restored', longRest);
		else session.mutate('Short rest taken', shortRest);
	}
</script>

<header>
	<Portrait name={c.name} image={c.image} size={60} muted={isDead(c)} />
	<div class="who">
		<h1>{c.name}</h1>
		<p>{subclass ? `${subclass} · ` : ''}{cls?.name ?? c.classKey} {c.level}</p>
	</div>
	<AcShield ac={c.ac} />
	<button
		type="button"
		class="icon-btn"
		aria-label={theme.resolved === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
		onclick={() => theme.toggle()}
	>
		{#if theme.resolved === 'dark'}
			<svg viewBox="0 0 24 24" aria-hidden="true" class="line">
				<circle cx="12" cy="12" r="4.5" />
				<path d="M12 2v2.5M12 19.5V22M2 12h2.5M19.5 12H22M4.9 4.9l1.8 1.8M17.3 17.3l1.8 1.8M4.9 19.1l1.8-1.8M17.3 6.7l1.8-1.8" />
			</svg>
		{:else}
			<svg viewBox="0 0 24 24" aria-hidden="true" class="line"><path d="M20 14.5A8 8 0 1 1 9.5 4a6.5 6.5 0 0 0 10.5 10.5z" /></svg>
		{/if}
	</button>
	<button type="button" class="icon-btn menu" aria-label="Menu" onclick={() => (menuOpen = true)}>
		<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="5" cy="12" r="1.8" /><circle cx="12" cy="12" r="1.8" /><circle cx="19" cy="12" r="1.8" /></svg>
	</button>
</header>

{#if session.concentrationCheck}
	<div class="alert" role="alert">
		<p>Roll a CON save, <strong>DC {session.concentrationCheck.dc}</strong>, to keep concentrating on {session.concentrationCheck.spell}.</p>
		<div class="alert-actions">
			<button type="button" onclick={() => resolveConcentration(true)}>Kept it</button>
			<button type="button" onclick={() => resolveConcentration(false)}>Lost it</button>
		</div>
	</div>
{/if}

{#if down}
	<DeathSaves onheal={() => openHp('heal')} ondamage={() => openHp('damage')} />
{:else}
	<section class="card hp" aria-labelledby="hp-title">
		<div class="hp-head">
			<h2 id="hp-title" class="label">Hit points</h2>
			{#if c.tempHp > 0}<span class="temp-chip">+{c.tempHp} temp</span>{/if}
		</div>
		<p class="hp-num"><span class="cur">{c.hpCurrent}</span><span class="max">/ {c.hpMax}</span></p>
		<div class="bar" aria-hidden="true">
			<div class="fill {hpTone}" style:width="{hpPct}%"></div>
			<div class="fill temp" style:width="{tempPct}%"></div>
		</div>
		<div class="hp-buttons">
			<button type="button" class="hit" onclick={() => openHp('damage')}>Damage</button>
			<button type="button" class="heal" onclick={() => openHp('heal')}>Heal</button>
			<button type="button" class="temp" onclick={() => openHp('temp')}>Temp HP</button>
		</div>
	</section>
{/if}

{#if c.concentration}
	<div class="conc">
		<span>Concentrating · {c.concentration}</span>
		<button
			type="button"
			aria-label="End concentration on {c.concentration}"
			onclick={() => session.mutate(`Stopped concentrating on ${c.concentration}`, (ch) => (ch.concentration = undefined))}
		>×</button>
	</div>
{/if}

{#if stats.length}
	<div class="stats" style:--cols={stats.length}>
		{#each stats as s (s.k)}
			<div class="stat"><strong>{s.v}</strong><span>{s.k}</span></div>
		{/each}
	</div>
{/if}

{#if caster}
	<a class="card slots" href={resolve('/c/[id]/spells', { id: c.id })}>
		<div class="slots-head">
			<span class="label">Spell slots</span>
			<span class="more">{spMax ? `Sorcery ${sorceryPointsLeft(c)} / ${spMax}` : 'Spells'} ›</span>
		</div>
		<div class="slot-rows">
			{#each slotMax(c) as max, i (i)}
				<span class="slot-row"><b>{ordinal(i + 1)}</b><Pips label="{ordinal(i + 1)} slots" {max} left={slotsLeft(c, i + 1)} size={14} /></span>
			{/each}
			{#if pact}
				<span class="slot-row"><b>Pact {ordinal(pact.level)}</b><Pips label="Pact slots" max={pact.count} left={pact.count - c.pactSlotsUsed} size={14} /></span>
			{/if}
		</div>
	</a>
{/if}

{#if backupIsStale(c)}
	<button type="button" class="nudge" onclick={() => (backupOpen = true)}>
		{c.lastBackupAt ? 'Your last backup is over a week old.' : "You haven't backed up this character yet."}
		<strong>Back up now</strong>
	</button>
{/if}

<HpSheet open={hpOpen} bind:mode={hpMode} onclose={() => (hpOpen = false)} />
<BackupSheet open={backupOpen} onclose={() => (backupOpen = false)} />

<Sheet open={menuOpen} onclose={() => (menuOpen = false)} label="Menu">
	<div class="menu-list">
		<button type="button" onclick={() => rest('short')}>Short rest <span>Pact slots back</span></button>
		<button type="button" onclick={() => rest('long')}>Long rest <span>Full HP, slots, points</span></button>
		<button type="button" onclick={() => ((menuOpen = false), (backupOpen = true))}>Back up character</button>
		<a href={resolve('/c/[id]/edit', { id: c.id })}>Edit character</a>
		<a href={resolve('/')}>All characters</a>
		<div class="theme"><span>Theme</span><ThemeToggle /></div>
	</div>
</Sheet>

<style>
	header {
		display: flex;
		align-items: center;
		gap: 10px;
		margin-bottom: 14px;
	}

	.who {
		flex: 1;
		min-width: 0;
	}

	h1 {
		font-size: 24px;
		font-weight: 900;
		line-height: 1.1;
		overflow-wrap: anywhere;
	}

	.who p {
		font-size: 13px;
		color: var(--color-text-muted);
		margin-top: 2px;
	}

	.icon-btn {
		flex-shrink: 0;
		width: 40px;
		height: 44px;
		padding: 0;
		border: 0;
		background: transparent;
		color: var(--color-text-muted);
		display: flex;
		align-items: center;
		justify-content: center;
	}

	.icon-btn + .icon-btn {
		margin-left: -10px;
	}

	.menu {
		margin-right: -8px;
	}

	.icon-btn svg {
		width: 24px;
		height: 24px;
		fill: currentColor;
	}

	.icon-btn svg.line {
		width: 22px;
		height: 22px;
		fill: none;
		stroke: currentColor;
		stroke-width: 2;
		stroke-linecap: round;
		stroke-linejoin: round;
	}

	.alert {
		margin-bottom: 12px;
		padding: 12px 14px;
		border-radius: var(--radius-lg);
		background: var(--color-alert-bg);
		border: 1px solid var(--color-alert-edge);
		color: var(--color-alert-ink);
		font-weight: 600;
	}

	.alert-actions {
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: 8px;
		margin-top: 10px;
	}

	.alert-actions button {
		height: 44px;
		border-radius: 12px;
		border: 1.5px solid var(--color-alert-edge);
		background: var(--color-surface);
		color: var(--color-text);
		font-weight: 800;
	}

	.hp {
		padding: 16px;
	}

	.hp-head {
		display: flex;
		justify-content: space-between;
		align-items: center;
	}

	.temp-chip {
		font-size: 13px;
		font-weight: 700;
		padding: 3px 10px;
		border-radius: 999px;
		background: var(--color-conc-bg);
		border: 1px solid var(--color-conc-edge);
		color: var(--color-conc-ink);
	}

	.hp-num {
		display: flex;
		align-items: baseline;
		gap: 6px;
		margin-top: 4px;
		font-family: var(--font-display);
		font-variant-numeric: tabular-nums;
	}

	.cur {
		font-size: 76px;
		font-weight: 900;
		line-height: 1;
	}

	.max {
		font-size: 28px;
		font-weight: 800;
		color: var(--color-text-faint);
	}

	.bar {
		display: flex;
		height: 12px;
		margin-top: 10px;
		border-radius: 999px;
		background: var(--color-chip);
		overflow: hidden;
	}

	.fill {
		transition: width 0.25s;
	}
	.fill.high {
		background: var(--color-hp-high);
	}
	.fill.mid {
		background: var(--color-hp-mid);
	}
	.fill.low {
		background: var(--color-hp-low);
	}
	.fill.temp {
		background: var(--color-accent);
		opacity: 0.55;
	}

	.hp-buttons {
		display: grid;
		grid-template-columns: repeat(3, minmax(0, 1fr));
		gap: 8px;
		margin-top: 16px;
	}

	.hp-buttons button {
		height: 56px;
		border: 0;
		border-radius: 14px;
		font-size: 16px;
		font-weight: 800;
		color: var(--color-on-solid);
	}

	.hp-buttons .hit {
		background: var(--color-hit);
		box-shadow: 0 2px 0 var(--color-hit-edge);
	}
	.hp-buttons .heal {
		background: var(--color-heal);
		box-shadow: 0 2px 0 var(--color-heal-edge);
	}
	.hp-buttons .temp {
		background: var(--color-accent);
		color: var(--color-on-accent);
		box-shadow: var(--shadow-btn);
	}

	.hp-buttons button:active {
		transform: translateY(2px);
		box-shadow: none;
	}

	.conc {
		display: inline-flex;
		align-items: center;
		gap: 8px;
		margin-top: 12px;
		height: 40px;
		padding: 0 4px 0 14px;
		border-radius: 999px;
		background: var(--color-conc-bg);
		border: 1px solid var(--color-conc-edge);
		color: var(--color-conc-ink);
		font-size: 14px;
		font-weight: 700;
	}

	.conc button {
		width: 32px;
		height: 32px;
		padding: 0;
		border: 0;
		border-radius: 50%;
		background: var(--color-conc-edge);
		color: var(--color-conc-ink);
		font-size: 18px;
		font-weight: 800;
	}

	.stats {
		display: grid;
		grid-template-columns: repeat(var(--cols), minmax(0, 1fr));
		gap: 8px;
		margin-top: 12px;
	}

	.stat {
		display: flex;
		flex-direction: column;
		align-items: center;
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
		color: var(--color-text-muted);
	}

	.slots {
		display: block;
		margin-top: 12px;
		padding: 14px 16px;
		text-decoration: none;
		color: inherit;
	}

	.slots-head {
		display: flex;
		justify-content: space-between;
	}

	.more {
		font-size: 12px;
		font-weight: 800;
		color: var(--color-spell-ink);
	}

	.slot-rows {
		display: flex;
		flex-wrap: wrap;
		gap: 8px 16px;
		margin-top: 10px;
	}

	.slot-row {
		display: inline-flex;
		align-items: center;
		gap: 6px;
		font-size: 14px;
	}

	.nudge {
		display: block;
		width: 100%;
		margin-top: 12px;
		padding: 12px 14px;
		text-align: left;
		border-radius: var(--radius-lg);
		background: var(--color-alert-bg);
		border: 1px solid var(--color-alert-edge);
		color: var(--color-alert-ink);
		font-size: 14px;
		font-weight: 600;
	}

	.nudge strong {
		display: block;
		text-decoration: underline;
		text-underline-offset: 3px;
	}

	.menu-list {
		display: flex;
		flex-direction: column;
	}

	.menu-list > button,
	.menu-list > a {
		display: flex;
		justify-content: space-between;
		align-items: center;
		min-height: 54px;
		padding: 0 4px;
		border: 0;
		border-bottom: 1px solid var(--color-border);
		border-radius: 0;
		background: transparent;
		color: var(--color-text);
		font-size: 17px;
		font-weight: 700;
		text-decoration: none;
		text-align: left;
	}

	.menu-list span {
		font-size: 13px;
		font-weight: 500;
		color: var(--color-text-muted);
	}

	.theme {
		display: flex;
		justify-content: space-between;
		align-items: center;
		min-height: 54px;
		padding: 0 4px;
		font-size: 17px;
		font-weight: 700;
	}
</style>
