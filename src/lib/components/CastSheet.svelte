<script lang="ts">
	import { untrack } from 'svelte';
	import Sheet from './Sheet.svelte';
	import SpellDetails from './SpellDetails.svelte';
	import { session } from '$lib/session.svelte';
	import { METAMAGIC, metamagicCost, sorceryPointsLeft, spendPactSlot, spendSlot, spendSorceryPoints } from '$lib/rules/resources';
	import { grantCasting, grantCastOptions, grantedSpells, slotsAllowed, spendCast, type CastSpend } from '$lib/rules/grants';
	import { spellNotes } from '$lib/rules/spellnotes';
	import { castSpent, type Spent } from '$lib/rules/castfx';
	import { signedMod } from '$lib/rules/abilities';
	import { arcanumLevels, ordinal, pactSlots, slotMax, slotsLeft } from '$lib/rules/spellcasting';
	import type { Character, Spell } from '$lib/types';

	let {
		spell,
		onclose,
		oncast
	}: {
		spell: Spell | null;
		onclose: () => void;
		/** After a cast: what it used (slots, points, counters) and how it was cast ("1st", "ritual", "at will"). */
		oncast?: (cast: { spell: Spell; spent: Spent[]; how: string }) => void;
	} = $props();

	type Option = {
		key: string;
		label: string;
		detail: string;
		left: number;
		level: number;
		kind: 'slot' | 'pact' | 'arcanum' | 'ritual' | 'grant';
		/** For a granted spell's own ways to cast (at will, once per rest, ki): how it's paid for. */
		spend?: CastSpend;
	};

	const c = $derived(session.character as Character);
	let choice = $state<string | null>(null);
	let meta = $state<string[]>([]);

	const options = $derived.by((): Option[] => {
		if (!spell || spell.level === 0) return [];
		// A granted spell's own ways first (free, then points like ki and sorcery), then the slots.
		const own = grantCastOptions(c, spell).map((o): Option => ({ ...o, kind: 'grant' }));
		const granted = grantedSpells(c).find((g) => g.id === spell.id);
		const slots = !granted || slotsAllowed(c, granted);
		const out: Option[] = [...own.filter((o) => o.spend?.kind !== 'points'), ...own.filter((o) => o.spend?.kind === 'points')];
		if (slots) addSlots(spell, out);
		// An innate spell is only a ritual when its grant says so (Pact of the Chain), not for a Shadow monk's Silence.
		if (spell.ritual && (slots || granted?.cast.some((x) => x.kind === 'ritual'))) {
			out.push({ key: 'ritual', label: 'As a ritual', detail: '+10 minutes, no slot', left: 1, level: spell.level, kind: 'ritual' });
		}
		return out;
	});

	function addSlots(spell: Spell, out: Option[]) {
		slotMax(c).forEach((_, i) => {
			const level = i + 1;
			if (level < spell.level) return;
			const left = slotsLeft(c, level);
			out.push({ key: `slot-${level}`, label: ordinal(level), detail: level > spell.level ? `+${level - spell.level} level${level - spell.level > 1 ? 's' : ''}` : '', left, level, kind: 'slot' });
		});
		const pact = pactSlots(c);
		if (pact && pact.level >= spell.level) {
			out.push({ key: 'pact', label: `Pact (${ordinal(pact.level)})`, detail: '', left: pact.count - c.pactSlotsUsed, level: pact.level, kind: 'pact' });
		}
		if (arcanumLevels(c).includes(spell.level)) {
			const used = c.arcanumUsed.includes(spell.level);
			out.push({ key: 'arcanum', label: 'Mystic Arcanum', detail: '1 / long rest', left: used ? 0 : 1, level: spell.level, kind: 'arcanum' });
		}
	}

	// Pick the cheapest usable option whenever a new spell opens: a slot before points, a ritual last.
	$effect(() => {
		if (!spell) return;
		untrack(() => {
			meta = [];
			const usable = options.filter((o) => o.left > 0);
			choice = (usable.find((o) => o.kind !== 'ritual' && o.spend?.kind !== 'points') ?? usable.find((o) => o.kind !== 'ritual') ?? usable[0])?.key ?? null;
		});
	});

	/** A circle for a spell slot, a diamond for sorcery points, as on the Spells tab. */
	function icon(o: Option): 'circle' | 'diamond' | null {
		if (o.kind === 'slot' || o.kind === 'pact' || o.spend?.kind === 'pact') return 'circle';
		if (o.spend?.kind === 'points' && o.spend.points === 'sorcery') return 'diamond';
		return null;
	}
	const icons = $derived(options.some((o) => icon(o)));

	const selected = $derived(options.find((o) => o.key === choice));
	/** A granted spell cast with its own ability (a tiefling fighter's Charisma), and what features add. */
	const casting = $derived.by(() => {
		const g = spell && grantedSpells(c).find((x) => x.id === spell.id);
		return g ? grantCasting(c, g) : null;
	});
	const notes = $derived(spell ? spellNotes(c, spell) : []);
	const knownMeta = $derived(METAMAGIC.filter((m) => c.metamagic.includes(m.key)));
	const metaCost = $derived(spell ? meta.reduce((n, k) => n + metamagicCost(k, spell.level), 0) : 0);
	const pointsLeft = $derived(sorceryPointsLeft(c));
	const breaksConcentration = $derived(!!spell?.concentration && !!c.concentration && c.concentration !== spell.name);
	const canCast = $derived(!!spell && (spell.level === 0 || (!!selected && selected.left > 0)) && metaCost <= pointsLeft);

	function toggleMeta(key: string) {
		meta = meta.includes(key) ? meta.filter((k) => k !== key) : [...meta, key];
	}

	function cast(free = false) {
		if (!spell) return;
		const s = spell;
		const opt = selected;
		const atLevel =
			s.level === 0
				? 'cantrip'
				: free
					? 'free'
					: opt?.kind === 'ritual'
						? 'ritual'
						: opt?.kind === 'grant'
							? opt.label.toLowerCase()
							: ordinal(opt?.level ?? s.level);
		const before = structuredClone($state.snapshot(c)) as Character;
		session.mutate(`Cast ${s.name} (${atLevel})`, (ch) => {
			if (!free && s.level > 0 && opt) {
				if (opt.kind === 'slot') spendSlot(ch, opt.level);
				else if (opt.kind === 'pact') spendPactSlot(ch);
				else if (opt.kind === 'arcanum') ch.arcanumUsed = [...ch.arcanumUsed, s.level];
				else if (opt.kind === 'grant' && opt.spend) spendCast(ch, opt.spend);
			}
			if (!free && metaCost) spendSorceryPoints(ch, metaCost);
			if (s.concentration) ch.concentration = s.name;
		});
		oncast?.({ spell: s, spent: castSpent(before, session.character as Character), how: atLevel });
		onclose();
	}

	const castLabel = $derived.by(() => {
		if (!spell) return '';
		if (spell.level === 0) return `Cast ${spell.name}`;
		if (!selected || selected.left <= 0) return options.every((o) => o.kind === 'grant') ? 'None left' : 'No slots left';
		if (selected.kind === 'ritual') return 'Cast as a ritual';
		if (selected.kind === 'arcanum') return 'Cast with Mystic Arcanum';
		if (selected.kind === 'grant' && selected.spend?.kind === 'free') return `Cast ${spell.name}`;
		return `Cast at ${ordinal(selected.level)} level`;
	});
</script>

<Sheet open={!!spell} {onclose} label={spell?.name ?? 'Spell'}>
	{#if spell}
		<SpellDetails {spell} />

		{#if casting || notes.length}
			<div class="for-you">
				{#if casting}
					<p><b>{casting.name}</b> · {signedMod(casting.attack)} to hit · DC {casting.dc}</p>
				{/if}
				{#each notes as note (note)}<p>{note}</p>{/each}
			</div>
		{/if}

		{#if options.length}
			<p class="label section">Cast using</p>
			<div class="options" role="radiogroup" aria-label="Slot to use">
				{#each options as o (o.key)}
					<button
						type="button"
						role="radio"
						aria-checked={choice === o.key}
						disabled={o.left <= 0}
						onclick={() => (choice = o.key)}
					>
						{#if icons}
							{@const shape = icon(o)}
							<span class="icon" aria-hidden="true">
								{#if shape}<span class="pip {shape}" class:filled={o.left > 0}></span>{/if}
							</span>
						{/if}
						<b>{o.label}</b>
						<span class="detail">{o.detail}</span>
						<span class="left">{o.kind === 'ritual' || (o.kind === 'grant' && o.spend?.kind !== 'counter') ? '' : `${o.left} left`}</span>
					</button>
				{/each}
			</div>
		{/if}

		{#if knownMeta.length}
			<p class="label section">Metamagic · {pointsLeft} points left</p>
			<div class="meta">
				{#each knownMeta as m (m.key)}
					{@const cost = metamagicCost(m.key, spell.level)}
					<button type="button" aria-pressed={meta.includes(m.key)} onclick={() => toggleMeta(m.key)}>
						{m.name.replace(' Spell', '')} <span>{cost} SP</span>
					</button>
				{/each}
			</div>
		{/if}

		{#if breaksConcentration}
			<p class="warn">This ends your concentration on {c.concentration}.</p>
		{/if}
		{#if metaCost > pointsLeft}
			<p class="warn">Not enough sorcery points for that metamagic.</p>
		{/if}

		<button type="button" class="cast" disabled={!canCast} onclick={() => cast()}>{castLabel}</button>
		{#if spell.level > 0}
			<button type="button" class="free" onclick={() => cast(true)}>Cast without a slot (item or feature)</button>
		{/if}
	{/if}
</Sheet>

<style>
	.section {
		margin-top: 16px;
		margin-bottom: 8px;
	}

	.for-you {
		display: flex;
		flex-direction: column;
		gap: 6px;
		margin-top: 14px;
		padding: 12px 14px;
		border-radius: 14px;
		border: 1px solid var(--color-spell-edge);
		background: var(--color-spell-bg);
		color: var(--color-spell-ink);
		font-size: 14px;
		font-weight: 600;
	}

	.options {
		display: flex;
		flex-direction: column;
		gap: 8px;
	}

	.options button {
		display: flex;
		align-items: center;
		gap: 10px;
		min-height: 52px;
		padding: 0 14px;
		border-radius: 14px;
		border: 1.5px solid var(--color-border);
		background: var(--color-surface);
		color: var(--color-text);
		text-align: left;
	}

	.options button[aria-checked='true'] {
		border: 2px solid var(--color-spell-ink);
		background: var(--color-spell-bg);
		color: var(--color-spell-ink);
	}

	.options button:disabled {
		opacity: 0.45;
	}

	.options b {
		font-size: 16px;
		min-width: 44px;
	}

	.icon {
		display: flex;
		align-items: center;
		justify-content: center;
		width: 14px;
		flex: none;
	}

	.pip {
		display: block;
		width: 14px;
		height: 14px;
		box-sizing: border-box;
		border: 2px solid var(--color-text-faint);
		border-radius: 50%;
	}

	.pip.filled {
		background: var(--color-spell-ink);
		border-color: var(--color-spell-ink);
	}

	.pip.diamond {
		border-radius: 3px;
		transform: rotate(45deg) scale(0.72);
	}

	.pip.diamond.filled {
		background: var(--color-warning);
		border-color: var(--color-warning);
	}

	.detail {
		flex: 1;
		font-size: 14px;
		font-weight: 600;
	}

	.left {
		font-size: 13px;
		font-weight: 700;
	}

	.meta {
		display: flex;
		flex-wrap: wrap;
		gap: 6px;
	}

	.meta button {
		min-height: 40px;
		border-radius: 999px;
		border: 1.5px solid var(--color-effect-edge);
		background: var(--color-surface);
		color: var(--color-text);
		font-size: 14px;
		font-weight: 700;
	}

	.meta button[aria-pressed='true'] {
		background: var(--color-effect-bg);
		color: var(--color-effect-ink);
	}

	.meta span {
		font-weight: 800;
		color: var(--color-effect-ink);
	}

	.warn {
		margin-top: 12px;
		padding: 10px 12px;
		border-radius: 12px;
		background: var(--color-alert-bg);
		border: 1px solid var(--color-alert-edge);
		color: var(--color-alert-ink);
		font-size: 14px;
		font-weight: 600;
	}

	.cast {
		width: 100%;
		height: 56px;
		margin-top: 16px;
		border: 0;
		border-radius: 14px;
		background: var(--color-spell-ink);
		color: var(--color-bg);
		font-size: 17px;
		font-weight: 800;
	}

	.cast:disabled {
		opacity: 0.45;
	}

	.free {
		width: 100%;
		min-height: 44px;
		margin-top: 4px;
		border: 0;
		background: transparent;
		color: var(--color-text-muted);
		font-size: 14px;
		font-weight: 600;
	}
</style>
