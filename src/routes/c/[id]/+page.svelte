<script lang="ts">
	import { resolve } from '$app/paths';
	import Portrait from '$lib/components/Portrait.svelte';
	import AcShield from '$lib/components/AcShield.svelte';
	import AcSheet from '$lib/components/AcSheet.svelte';
	import HpSheet, { type HpChange, type HpMode } from '$lib/components/HpSheet.svelte';
	import DeathSaves from '$lib/components/DeathSaves.svelte';
	import Pips from '$lib/components/Pips.svelte';
	import Sheet from '$lib/components/Sheet.svelte';
	import BackupSheet from '$lib/components/BackupSheet.svelte';
	import AttackSheet from '$lib/components/AttackSheet.svelte';
	import SavingThrows from '$lib/components/SavingThrows.svelte';
	import DefensesCard from '$lib/components/DefensesCard.svelte';
	import XpSheet from '$lib/components/XpSheet.svelte';
	import ShortRestSheet from '$lib/components/ShortRestSheet.svelte';
	import SpellcastingSheet from '$lib/components/SpellcastingSheet.svelte';
	import FontOfMagicSheet from '$lib/components/FontOfMagicSheet.svelte';
	import CountersCard from '$lib/components/CountersCard.svelte';
	import PotionIcon from '$lib/components/PotionIcon.svelte';
	import PotionSheet from '$lib/components/PotionSheet.svelte';
	import ItemIcon from '$lib/components/ItemIcon.svelte';
	import UsableSheet from '$lib/components/UsableSheet.svelte';
	import UseFx from '$lib/components/UseFx.svelte';
	import ThemeToggle from '$lib/components/ThemeToggle.svelte';
	import { theme } from '$lib/theme.svelte';
	import { session } from '$lib/session.svelte';
	import { CLASSES } from '$lib/data/classes';
	import { raceLabel } from '$lib/data/races';
	import { isDead, isDown } from '$lib/rules/hp';
	import { longRest, sorceryPointsLeft, sorceryPointsMax } from '$lib/rules/resources';
	import {
		isCaster,
		ordinal,
		pactSlots,
		slotMax,
		slotsLeft,
		SPELL_ABILITY,
		spellAttack,
		spellSaveDC
	} from '$lib/rules/spellcasting';
	import { backupReminder } from '$lib/backup/reminder.svelte';
	import { signedMod } from '$lib/rules/abilities';
	import { abilityBreakdown, raceSpeed } from '$lib/rules/stats';
	import { attacks as attackList, attacksPerAction } from '$lib/rules/attacks';
	import { senses } from '$lib/rules/senses';
	import { healingDice, isPotion } from '$lib/rules/potions';
	import { isUsable, type UseFx as UseFxKind } from '$lib/rules/usable';
	import { CARRY_STATUS, carrySpeed, encumbrance } from '$lib/rules/carry';
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

	const load = $derived(encumbrance(c));
	const slowed = $derived(load.status !== 'light');

	// The player's own speed (Unarmored Movement, Fast Movement, Mobile), or the race's.
	const speed = $derived(c.speed ?? raceSpeed(c));
	const stats = $derived(
		[
			speed != null && { k: slowed ? `Speed · ${CARRY_STATUS[load.status].label}` : 'Speed', v: `${carrySpeed(speed, load.status)} ft`, warn: slowed },
			c.passivePerception != null && { k: 'Passive', v: `${c.passivePerception}` },
			...senses(c).map((s) => ({ k: s.name, v: `${s.range} ft` }))
		].filter((s): s is { k: string; v: string; warn?: boolean } => !!s)
	);

	const signed = (n: number) => `${n >= 0 ? '+' : ''}${n}`;
	const spellcasting = $derived([
		{ k: 'Spellcasting ability', v: `${SPELL_ABILITY[c.classKey] ?? ''} ${signed(c.spellMod)}`.trim() },
		{ k: 'Spell save DC', v: `${spellSaveDC(c)}` },
		{ k: 'Spell attack bonus', v: signed(spellAttack(c)) }
	]);

	let hpOpen = $state(false);
	let acOpen = $state(false);

	const abilities = $derived(abilityBreakdown(c));
	const attacks = $derived(attackList(c, abilities));
	const perAction = $derived(attacksPerAction(c));
	/** Id of the attack whose sheet is open. */
	let attackId = $state<string | null>(null);
	const openAttack = $derived(attacks.find((a) => a.id === attackId) ?? null);
	let xpOpen = $state(false);
	let restOpen = $state(false);
	let spellcastingOpen = $state(false);
	let fontOpen = $state(false);
	let hpMode = $state<HpMode>('damage');
	let menuOpen = $state(false);
	let backupOpen = $state(false);

	const potions = $derived.by(() => {
		const all = c.items.filter((i) => isPotion(i) && !i.stash);
		const group = (healing: boolean) => {
			const list = all.filter((i) => !!healingDice(i) === healing);
			return {
				count: list.reduce((n, i) => n + i.quantity, 0),
				names: list.map((i) => (i.quantity > 1 ? `${i.name} ×${i.quantity}` : i.name)).join(', ')
			};
		};
		return { healing: group(true), other: group(false) };
	});
	let potionGroup = $state<'healing' | 'other' | null>(null);

	const usable = $derived(c.items.filter(isUsable));
	let usableOpen = $state(false);

	/** The last item used, animated on the Usable items card; `n` restarts the animation. */
	let useFx = $state<{ kind: UseFxKind; label: string; n: number } | null>(null);
	let useFxTimer: ReturnType<typeof setTimeout> | undefined;
	let usableCard: HTMLElement | undefined = $state();

	function used(u: { kind: UseFxKind; label: string }) {
		clearTimeout(useFxTimer);
		useFx = { ...u, n: (useFx?.n ?? 0) + 1 };
		useFxTimer = setTimeout(() => (useFx = null), 1900);
		// The sheet covered the bottom of the screen; bring the card into view if it was under it or scrolled off.
		requestAnimationFrame(() => {
			const r = usableCard?.getBoundingClientRect();
			if (r && (r.top < 0 || r.bottom > window.innerHeight - 80)) usableCard?.scrollIntoView({ behavior: 'smooth', block: 'center' });
		});
	}

	/** The last damage, healing or temp HP, animated on the hit points; `n` restarts the animation. */
	let hpFx = $state<(HpChange & { n: number }) | null>(null);
	let hpFxTimer: ReturnType<typeof setTimeout> | undefined;
	let hpCard: HTMLElement | undefined = $state();

	function hpChanged(change: HpChange) {
		if (change.amount <= 0) return;
		clearTimeout(hpFxTimer);
		hpFx = { ...change, n: (hpFx?.n ?? 0) + 1 };
		hpFxTimer = setTimeout(() => (hpFx = null), 1800);
		// The sheet has closed by now; bring the hit points into view if the page was scrolled down (to the potions).
		requestAnimationFrame(() => {
			const top = hpCard?.getBoundingClientRect().top ?? 0;
			if (top < 0) hpCard?.scrollIntoView({ behavior: 'smooth', block: 'center' });
		});
	}

	const drank = (gain: { amount: number; temp: boolean }) =>
		hpChanged({ kind: gain.temp ? 'temp' : 'heal', amount: gain.amount });

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
		if (kind === 'long') session.mutate('Long rest: HP, slots, points, features and hit dice restored', longRest);
		else restOpen = true;
	}
</script>

<header>
	<Portrait name={c.name} image={c.image} size={60} muted={isDead(c)} />
	<div class="who">
		<h1>{c.name}</h1>
		<p>{[raceLabel(c), subclass, `${cls?.name ?? c.classKey} ${c.level}`].filter(Boolean).join(' · ')}</p>
	</div>
	{#if c.initiativeModifier != null}
		<div class="init" role="img" aria-label="Initiative {signedMod(c.initiativeModifier)}">
			<span class="k">INIT</span>
			<span class="v">{signedMod(c.initiativeModifier)}</span>
		</div>
	{/if}
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

{#if backupReminder.due(c)}
	<button type="button" class="nudge" onclick={() => (backupOpen = true)}>
		{c.lastBackupAt ? `${c.name} has changed since your last backup.` : "You haven't backed up this character yet."}
		<strong>Back up now</strong>
	</button>
{/if}

<div class="vitals-row" class:down>
	<button type="button" class="card ac-card" aria-label="Armor class {c.ac}. Tap to change." onclick={() => (acOpen = true)}>
		<span class="label">Armor class</span>
		<AcShield ac={c.ac} size={76} />
		<span class="ac-hint">Tap to change</span>
	</button>
	{#if down}
		<DeathSaves onheal={() => openHp('heal')} ondamage={() => openHp('damage')} />
	{:else}
		<section
			class="card hp {hpFx ? `fx-${hpFx.kind}` : ''}"
			aria-labelledby="hp-title"
			bind:this={hpCard}
		>
			<div class="hp-head">
				<h2 id="hp-title" class="label">Hit points</h2>
				{#if c.tempHp > 0}
					{#key hpFx?.n}<span class="temp-chip" class:pulse={hpFx?.kind === 'temp'}>+{c.tempHp} temp</span>{/key}
				{/if}
			</div>
			<p class="hp-num">
				{#key hpFx?.n}<span class="cur" class:pulse={hpFx?.kind === 'heal'} class:hit={hpFx?.kind === 'damage'}>{c.hpCurrent}</span>{/key}<span class="max">/ {c.hpMax}</span>
			</p>
			<div class="bar" aria-hidden="true">
				<div class="fill {hpTone}" style:width="{hpPct}%"></div>
				<div class="fill temp" style:width="{tempPct}%"></div>
			</div>
			<div class="hp-buttons">
				<button type="button" class="hit" onclick={() => openHp('damage')}>Damage</button>
				<button type="button" class="heal" onclick={() => openHp('heal')}>Heal</button>
				<button type="button" class="temp" onclick={() => openHp('temp')}>Temp HP</button>
			</div>
			{#if hpFx?.kind === 'damage'}
				{#key hpFx.n}
					<span class="hit-fx" aria-hidden="true">
						<span class="flash"></span>
						{#each [24, 50, 76] as x, i (x)}
							<span class="slash" style:left="{x}%" style:animation-delay="{i * 70}ms"></span>
						{/each}
						<span class="loss">−{hpFx.amount}</span>
					</span>
				{/key}
			{:else if hpFx}
				{#key hpFx.n}
					<span class="heal-fx" class:temp={hpFx.kind === 'temp'} aria-hidden="true">
						<span class="glow"></span>
						<span class="gain">+{hpFx.amount}{hpFx.kind === 'temp' ? ' temp' : ''}</span>
						{#each [18, 38, 62, 82] as x, i (x)}
							<span class="spark" style:left="{x}%" style:animation-delay="{i * 90}ms">+</span>
						{/each}
					</span>
				{/key}
			{/if}
		</section>
	{/if}
</div>

<DefensesCard />

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

<SavingThrows />

{#if stats.length}
	<div class="stats" style:--cols={Math.min(stats.length, 4)}>
		{#each stats as s (s.k)}
			<div class="stat" class:warn={s.warn}><strong>{s.v}</strong><span>{s.k}</span></div>
		{/each}
	</div>
{/if}

{#if slowed}
	<a class="card load" href={resolve('/c/[id]/inventory', { id: c.id })}>
		<span class="load-head">
			<b>{CARRY_STATUS[load.status].label}</b>
			<span>{load.carried} / {load.capacity} lb</span>
		</span>
		<span class="load-note">{CARRY_STATUS[load.status].note} Tap to lighten the load in Inventory.</span>
	</a>
{/if}

{#if potions.healing.count || potions.other.count}
	<section class="potions" aria-labelledby="potions-title">
		<h2 id="potions-title" class="label">Potions</h2>
		<div class="card potion-list">
			{#each [['healing', 'Healing potions'], ['other', 'Other potions']] as const as [key, label] (key)}
				{#if potions[key].count}
					<button type="button" class="potion-row" onclick={() => (potionGroup = key)}>
						<PotionIcon kind={key} size={36} />
						<span class="p-name">
							<b>{label}</b>
							<span>{potions[key].names}</span>
						</span>
						<span class="p-count {key}">{potions[key].count}</span>
					</button>
				{/if}
			{/each}
		</div>
	</section>
{/if}

{#if usable.length || useFx}
	<section class="potions usable" aria-labelledby="usable-title" bind:this={usableCard}>
		<h2 id="usable-title" class="label">Items</h2>
		<div class="usable-wrap">
			{#key useFx?.n}
				<div class="card potion-list {useFx ? `fx-${useFx.kind}` : ''}">
					<button type="button" class="potion-row" onclick={() => (usableOpen = true)}>
						<span class="item-icon" class:jiggle={!!useFx}><ItemIcon size={36} /></span>
						<span class="p-name">
							<b>Usable items</b>
							<span>{usable.map((i) => (i.quantity > 1 ? `${i.name} ×${i.quantity}` : i.name)).join(', ')}</span>
						</span>
						<span class="p-count usable" class:bump={!!useFx}>{usable.length}</span>
					</button>
				</div>
			{/key}
			{#if useFx}
				{#key useFx.n}
					<UseFx kind={useFx.kind} label={useFx.label} />
				{/key}
			{/if}
		</div>
	</section>
{/if}

<section class="attacks" aria-labelledby="attacks-title">
	<div class="attacks-head">
		<h2 id="attacks-title" class="label">Attacks</h2>
		{#if perAction > 1}<span class="per">{perAction} attacks per Attack action</span>{/if}
	</div>
	<div class="card attack-list">
		{#each attacks as a (a.id)}
			<button type="button" class="attack" onclick={() => (attackId = a.id)}>
				<span class="a-name">
					<b>{a.name}</b>
					<span>{a.reach}{a.ammo ? ` · ${a.ammo.count} ${a.ammo.name.toLowerCase()}` : ''}</span>
				</span>
				<span class="a-hit" class:unskilled={!a.proficient}>{signedMod(a.toHit)}</span>
				<span class="a-dmg">{a.damage}</span>
			</button>
		{/each}
		{#if attacks.length === 1}
			<a class="equip-hint" href={resolve('/c/[id]/inventory', { id: c.id })}>Equip weapons in Inventory to see them here</a>
		{/if}
	</div>
</section>

{#if caster}
	<section class="spellcasting" aria-labelledby="spellcasting-title">
		<h2 id="spellcasting-title" class="label">Spellcasting</h2>
		<div class="stats" style:--cols={spellcasting.length}>
			{#each spellcasting as s (s.k)}
				<button type="button" class="stat spell" aria-label="{s.k} {s.v}. Tap for details." onclick={() => (spellcastingOpen = true)}>
					<strong>{s.v}</strong><span>{s.k}</span>
				</button>
			{/each}
		</div>
	</section>

	<a class="card slots" href={resolve('/c/[id]/spells', { id: c.id })}>
		<div class="slots-head">
			<span class="label">Spell slots</span>
			<span class="more">Spells ›</span>
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

	{#if spMax}
		<section class="card sp" aria-labelledby="sp-title">
			<div class="slots-head">
				<h2 id="sp-title" class="label">Sorcery points</h2>
				<span class="sp-count">{sorceryPointsLeft(c)} / {spMax}</span>
			</div>
			<Pips
				label="sorcery point"
				shape="diamond"
				max={spMax}
				left={sorceryPointsLeft(c)}
				onspend={() => session.mutate('Spent a sorcery point', (ch) => (ch.sorceryPointsUsed += 1))}
				onrestore={() => session.mutate('Got a sorcery point back', (ch) => (ch.sorceryPointsUsed = Math.max(0, ch.sorceryPointsUsed - 1)))}
			/>
			<button type="button" class="font" onclick={() => (fontOpen = true)}>Font of Magic: convert slots and points</button>
		</section>
	{/if}
{/if}

<CountersCard onhealed={hpChanged} />

<div class="rests">
	<button type="button" onclick={() => rest('short')}>Short rest</button>
	<button type="button" onclick={() => rest('long')}>Long rest</button>
</div>

<HpSheet open={hpOpen} bind:mode={hpMode} onclose={() => (hpOpen = false)} onchanged={hpChanged} />
<AttackSheet attack={openAttack} onclose={() => (attackId = null)} />
<XpSheet open={xpOpen} onclose={() => (xpOpen = false)} />
<ShortRestSheet open={restOpen} onclose={() => (restOpen = false)} />
<SpellcastingSheet open={spellcastingOpen} onclose={() => (spellcastingOpen = false)} />
<FontOfMagicSheet open={fontOpen} onclose={() => (fontOpen = false)} />
<AcSheet open={acOpen} onclose={() => (acOpen = false)} />
<BackupSheet open={backupOpen} onclose={() => (backupOpen = false)} />
<PotionSheet group={potionGroup} onclose={() => (potionGroup = null)} ondrank={drank} />
<UsableSheet open={usableOpen} onclose={() => (usableOpen = false)} onused={used} />

<Sheet open={menuOpen} onclose={() => (menuOpen = false)} label="Menu">
	<div class="menu-list">
		<button type="button" onclick={() => rest('short')}>Short rest <span>Spend hit dice; short-rest features back</span></button>
		<button type="button" onclick={() => rest('long')}>Long rest <span>Full HP, slots, features, half hit dice</span></button>
		<button type="button" onclick={() => ((menuOpen = false), (xpOpen = true))}>
			{c.milestone ? 'Level up' : 'Experience'} <span>{c.milestone ? `Now level ${c.level}` : `${c.xp.toLocaleString('en')} XP`}</span>
		</button>
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

	/* AC on the left (a third of the row at most), hit points or death saves on the right. */
	.vitals-row {
		display: grid;
		grid-template-columns: minmax(0, 1fr) minmax(0, 2fr);
		gap: 10px;
		align-items: stretch;
	}

	.ac-card {
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		gap: 6px;
		min-width: 0;
		padding: 14px 6px;
		color: var(--color-text);
		font-weight: 400;
	}

	.ac-card .label {
		text-align: center;
	}

	/* Death saves need the full width, so AC drops below as a strip. */
	.vitals-row.down {
		grid-template-columns: minmax(0, 1fr);
	}

	.vitals-row.down .ac-card {
		order: 2;
		flex-direction: row;
		gap: 12px;
		padding: 10px 16px;
	}

	.ac-card:active :global(.shield) {
		transform: scale(0.95);
	}

	.ac-hint {
		font-size: 11px;
		font-weight: 700;
		color: var(--color-text-faint);
	}

	.init {
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		flex-shrink: 0;
		width: 54px;
		height: 54px;
		border-radius: 14px;
		background: var(--color-surface-raised);
		border: 1.5px solid var(--color-border-strong);
	}

	.init .k {
		font-size: 9px;
		font-weight: 800;
		letter-spacing: 0.06em;
		color: var(--color-text-muted);
	}

	.init .v {
		font-family: var(--font-display);
		font-size: 22px;
		font-weight: 900;
		line-height: 1;
	}

	.hp {
		position: relative;
		min-width: 0;
		padding: 14px;
		transition: box-shadow 0.4s;
	}

	.hp.fx-heal {
		box-shadow: 0 0 0 2px var(--color-heal), var(--shadow-sm);
	}

	.hp.fx-temp {
		box-shadow: 0 0 0 2px var(--color-accent), var(--shadow-sm);
	}

	.hp.fx-damage {
		box-shadow: 0 0 0 2px var(--color-hit), var(--shadow-sm);
		animation: hit-shake 0.45s ease-out;
	}

	/* Damage: the card jolts, a red flash closes in from the edges, three claw slashes, and the number drops away. */
	.hit-fx {
		position: absolute;
		inset: 0;
		border-radius: inherit;
		overflow: hidden;
		pointer-events: none;
	}

	.flash {
		position: absolute;
		inset: 0;
		box-shadow: inset 0 0 40px 6px var(--color-hit);
		opacity: 0;
		animation: hit-flash 1s ease-out;
	}

	.slash {
		position: absolute;
		top: -10%;
		width: 4px;
		height: 120%;
		border-radius: 2px;
		background: var(--color-hit);
		transform: rotate(28deg) scaleY(0);
		transform-origin: top;
		opacity: 0;
		animation: hit-slash 0.8s ease-out both;
	}

	.loss {
		position: absolute;
		right: 14px;
		top: 34px;
		font-family: var(--font-display);
		font-size: 34px;
		font-weight: 900;
		color: var(--color-hit);
		opacity: 0;
		animation: hit-drop 1.6s ease-in;
	}

	.cur.hit {
		display: inline-block;
		animation: hit-pulse 0.6s ease-out;
	}

	@keyframes hit-shake {
		0%,
		100% {
			transform: translateX(0);
		}
		20% {
			transform: translateX(-6px);
		}
		40% {
			transform: translateX(5px);
		}
		60% {
			transform: translateX(-3px);
		}
		80% {
			transform: translateX(2px);
		}
	}

	@keyframes hit-flash {
		0% {
			opacity: 0;
		}
		15% {
			opacity: 0.55;
		}
		100% {
			opacity: 0;
		}
	}

	@keyframes hit-slash {
		0% {
			opacity: 0.9;
			transform: rotate(28deg) scaleY(0);
		}
		45% {
			opacity: 0.9;
			transform: rotate(28deg) scaleY(1);
		}
		100% {
			opacity: 0;
			transform: rotate(28deg) scaleY(1);
		}
	}

	@keyframes hit-drop {
		0% {
			opacity: 0;
			transform: translateY(-14px) scale(1.4);
		}
		12% {
			opacity: 1;
			transform: translateY(0) scale(1);
		}
		70% {
			opacity: 1;
			transform: translateY(6px);
		}
		100% {
			opacity: 0;
			transform: translateY(30px);
		}
	}

	@keyframes hit-pulse {
		0% {
			transform: scale(1);
		}
		30% {
			transform: scale(0.88);
			color: var(--color-hit);
		}
		100% {
			transform: scale(1);
		}
	}

	/* Healing (a potion or the Heal button): a green wash, the number floating up, and little crosses rising off the card. */
	.heal-fx {
		position: absolute;
		inset: 0;
		border-radius: inherit;
		overflow: hidden;
		pointer-events: none;
	}

	.glow {
		position: absolute;
		inset: 0;
		background: radial-gradient(circle at 30% 45%, var(--color-heal), transparent 70%);
		opacity: 0;
		animation: heal-glow 1.2s ease-out;
	}

	.gain {
		position: absolute;
		right: 14px;
		top: 34px;
		font-family: var(--font-display);
		font-size: 34px;
		font-weight: 900;
		color: var(--color-heal);
		opacity: 0;
		animation: heal-rise 1.6s ease-out;
	}

	.spark {
		position: absolute;
		bottom: 8px;
		font-size: 18px;
		font-weight: 900;
		color: var(--color-heal);
		opacity: 0;
		animation: heal-spark 1.3s ease-out both;
	}

	.cur.pulse {
		display: inline-block;
		animation: heal-pulse 0.7s ease-out;
	}

	/* Temp HP (the Temp HP button or Heroism) in the temp colour, and the temp chip pulses instead of the hit points. */
	.heal-fx.temp .glow {
		background: radial-gradient(circle at 30% 45%, var(--color-accent), transparent 70%);
	}

	.heal-fx.temp .gain {
		top: 40px;
		font-size: 26px;
	}

	.heal-fx.temp .gain,
	.heal-fx.temp .spark {
		color: var(--color-accent);
	}

	.temp-chip.pulse {
		display: inline-block;
		animation: temp-pulse 0.8s ease-out;
	}

	@keyframes temp-pulse {
		0% {
			transform: scale(1);
		}
		35% {
			transform: scale(1.2);
		}
		100% {
			transform: scale(1);
		}
	}

	@keyframes heal-glow {
		0% {
			opacity: 0;
		}
		25% {
			opacity: 0.28;
		}
		100% {
			opacity: 0;
		}
	}

	@keyframes heal-rise {
		0% {
			opacity: 0;
			transform: translateY(16px) scale(0.7);
		}
		20% {
			opacity: 1;
			transform: translateY(0) scale(1.1);
		}
		70% {
			opacity: 1;
			transform: translateY(-10px) scale(1);
		}
		100% {
			opacity: 0;
			transform: translateY(-26px);
		}
	}

	@keyframes heal-spark {
		0% {
			opacity: 0;
			transform: translateY(0) scale(0.6);
		}
		30% {
			opacity: 0.9;
		}
		100% {
			opacity: 0;
			transform: translateY(-90px) scale(1.2);
		}
	}

	@keyframes heal-pulse {
		0% {
			transform: scale(1);
		}
		35% {
			transform: scale(1.15);
			color: var(--color-heal);
		}
		100% {
			transform: scale(1);
		}
	}

	@media (prefers-reduced-motion: reduce) {
		.hp.fx-damage,
		.glow,
		.spark,
		.flash,
		.slash,
		.cur.pulse,
		.cur.hit,
		.temp-chip.pulse,
		.item-icon.jiggle,
		.p-count.bump,
		.fx-lightning,
		.fx-strike,
		.fx-vanish .potion-row {
			animation: none;
		}

		.gain,
		.loss {
			animation: heal-fade 1.6s ease-out;
		}

		@keyframes heal-fade {
			0%,
			70% {
				opacity: 1;
			}
			100% {
				opacity: 0;
			}
		}
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
		flex-wrap: wrap;
		align-items: baseline;
		gap: 6px;
		margin-top: 4px;
		font-family: var(--font-display);
		font-variant-numeric: tabular-nums;
	}

	.cur {
		font-size: 64px;
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

	/* Damage and Heal side by side, Temp HP across the bottom, so they fit a narrow column. */
	.hp-buttons {
		display: grid;
		grid-template-columns: repeat(2, minmax(0, 1fr));
		gap: 8px;
		margin-top: 14px;
	}

	.hp-buttons .temp {
		grid-column: 1 / -1;
		height: 44px;
	}

	.hp-buttons button {
		height: 52px;
		padding: 0 6px;
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

	.stat.warn strong,
	.stat.warn span {
		color: var(--color-warning);
	}

	.load {
		display: flex;
		flex-direction: column;
		gap: 2px;
		margin-top: 8px;
		padding: 10px 14px;
		border-left: 4px solid var(--color-warning);
		color: var(--color-text);
		text-decoration: none;
	}

	.load-head {
		display: flex;
		justify-content: space-between;
		gap: 8px;
		font-size: 15px;
	}

	.load-head b {
		color: var(--color-warning);
	}

	.load-head span {
		font-weight: 800;
		font-variant-numeric: tabular-nums;
	}

	.load-note {
		font-size: 13px;
		line-height: 1.4;
		color: var(--color-text-muted);
	}

	.stat span {
		font-size: 11px;
		font-weight: 700;
		line-height: 1.3;
		text-align: center;
		color: var(--color-text-muted);
	}

	.attacks {
		margin-top: 14px;
	}

	.potions {
		margin-top: 14px;
	}

	.potions .label {
		margin: 0 4px 6px;
	}

	.potion-list {
		overflow: hidden;
	}

	.potion-row {
		display: flex;
		align-items: center;
		gap: 12px;
		width: 100%;
		min-height: 60px;
		padding: 8px 12px;
		border: 0;
		border-radius: 0;
		background: transparent;
		color: var(--color-text);
		font-weight: 400;
		text-align: left;
	}

	.potion-row + .potion-row {
		border-top: 1px solid var(--color-border);
	}

	.potion-row:active {
		background: var(--color-chip);
	}

	.p-name {
		flex: 1;
		display: flex;
		flex-direction: column;
		min-width: 0;
	}

	.p-name b {
		font-size: 16px;
	}

	.p-name span {
		overflow: hidden;
		white-space: nowrap;
		text-overflow: ellipsis;
		font-size: 12px;
		color: var(--color-text-muted);
	}

	.p-count {
		flex-shrink: 0;
		min-width: 36px;
		padding: 4px 8px;
		border-radius: 10px;
		font-family: var(--font-display);
		font-size: 18px;
		font-weight: 900;
		text-align: center;
		font-variant-numeric: tabular-nums;
	}

	.p-count.healing {
		background: var(--color-chip);
		color: var(--color-heal);
	}

	.p-count.other {
		background: var(--color-spell-bg);
		color: var(--color-spell-ink);
	}

	.p-count.usable {
		background: var(--color-effect-bg);
		color: var(--color-effect-ink);
	}

	/* Using an item: the pouch jiggles as it's pulled from, and the card does what the item does (UseFx). */
	.usable-wrap {
		position: relative;
	}

	.item-icon {
		display: block;
		flex-shrink: 0;
	}

	.item-icon.jiggle {
		animation: pouch 0.6s ease-out;
	}

	.p-count.bump {
		animation: heal-pulse 0.6s ease-out 0.2s;
	}

	.fx-lightning {
		animation: hit-shake 0.45s ease-out 0.1s;
	}

	.fx-strike {
		animation: hit-shake 0.35s ease-out 0.2s;
	}

	.fx-vanish .potion-row {
		animation: vanish 1.4s ease-in-out;
	}

	@keyframes pouch {
		0% {
			transform: rotate(0) scale(1);
		}
		20% {
			transform: rotate(-14deg) scale(1.12);
		}
		45% {
			transform: rotate(10deg) scale(1.05);
		}
		70% {
			transform: rotate(-5deg);
		}
		100% {
			transform: rotate(0) scale(1);
		}
	}

	@keyframes vanish {
		0%,
		100% {
			opacity: 1;
			filter: none;
		}
		35%,
		60% {
			opacity: 0.12;
			filter: blur(3px);
		}
	}

	.attacks-head {
		display: flex;
		justify-content: space-between;
		align-items: baseline;
		gap: 8px;
		margin: 0 4px 6px;
	}

	.per {
		font-size: 12px;
		font-weight: 800;
		color: var(--color-accent);
	}

	.attack-list {
		overflow: hidden;
	}

	/* Name and reach on the left, to-hit and damage in fixed columns so rows line up. */
	.attack {
		display: grid;
		grid-template-columns: minmax(0, 1fr) 48px minmax(0, 0.9fr);
		align-items: center;
		gap: 8px;
		width: 100%;
		min-height: 56px;
		padding: 8px 12px;
		border: 0;
		border-radius: 0;
		background: transparent;
		color: var(--color-text);
		font-weight: 400;
		text-align: left;
	}

	.attack + .attack {
		border-top: 1px solid var(--color-border);
	}

	.a-name {
		display: flex;
		flex-direction: column;
		min-width: 0;
	}

	.a-name b {
		font-size: 16px;
		overflow-wrap: anywhere;
	}

	.a-name span {
		font-size: 12px;
		color: var(--color-text-muted);
	}

	.a-hit {
		padding: 4px 0;
		border-radius: 10px;
		background: var(--color-current-bg);
		color: var(--color-accent);
		font-family: var(--font-display);
		font-size: 18px;
		font-weight: 900;
		text-align: center;
		font-variant-numeric: tabular-nums;
	}

	.a-hit.unskilled {
		background: var(--color-chip);
		color: var(--color-text-muted);
	}

	.a-dmg {
		font-size: 14px;
		font-weight: 700;
		font-variant-numeric: tabular-nums;
	}

	.equip-hint {
		display: block;
		padding: 10px 12px 12px;
		border-top: 1px solid var(--color-border);
		font-size: 13px;
		font-weight: 700;
		color: var(--color-accent);
	}

	.spellcasting {
		margin-top: 14px;
	}

	.spellcasting .label {
		margin: 0 4px;
	}

	.spellcasting .stats {
		margin-top: 6px;
	}

	.stat.spell {
		min-width: 0;
		border: 0;
		background: var(--color-spell-bg);
		color: var(--color-text);
		font-weight: 400;
	}

	.stat.spell:active {
		transform: scale(0.97);
	}

	.stat.spell strong {
		color: var(--color-spell-ink);
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

	.sp {
		margin-top: 12px;
		padding: 14px 12px 12px 16px;
	}

	.sp-count {
		font-size: 14px;
		font-weight: 800;
		color: var(--color-effect-ink);
	}

	.font {
		width: 100%;
		min-height: 44px;
		margin-top: 6px;
		border-radius: 12px;
		border: 1.5px solid var(--color-effect-edge);
		background: var(--color-effect-bg);
		color: var(--color-effect-ink);
		font-weight: 800;
	}

	.rests {
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: 8px;
		margin-top: 12px;
	}

	.rests button {
		height: 48px;
		background: var(--color-surface);
		border: 1.5px solid var(--color-border-strong);
		color: var(--color-text);
		font-size: 15px;
		font-weight: 800;
	}

	.nudge {
		display: block;
		width: 100%;
		margin-bottom: 12px;
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
