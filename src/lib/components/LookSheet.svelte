<script lang="ts">
	import Sheet from './Sheet.svelte';
	import HeroSprite from './HeroSprite.svelte';
	import { session } from '$lib/session.svelte';
	import { CLASS_MAP } from '$lib/data/classes';
	import { raceLabel } from '$lib/data/races';
	import { GENDERS, HAIR_TONES, SKIN_TONES, heroGear, heroLook, raceLook } from '$lib/sprite';
	import type { Character, Gender } from '$lib/types';

	/** How the pixel hero looks: gender, then skin and hair colours over the race's. */
	let { open, onclose }: { open: boolean; onclose: () => void } = $props();

	const c = $derived(session.character as Character);
	const look = $derived(heroLook(c));
	const race = $derived(raceLook(c.raceKey, c.subraceKey));
	const raceName = $derived(raceLabel(c) || 'Human');
	const name = (tone: string) => tone[0].toUpperCase() + tone.slice(1);

	function setGender(g: Gender | undefined) {
		session.mutate(g ? `Gender: ${GENDERS.find((x) => x.key === g)!.label}` : 'Gender not set', (d) => {
			if (g) d.gender = g;
			else delete d.gender;
		});
	}

	/** A colour, or the race's (`undefined`). */
	function setTone(part: 'skin' | 'hair', tone: string | undefined) {
		session.mutate(tone ? `${name(part)}: ${name(tone)}` : `${name(part)} as ${raceName}`, (d) => {
			const next = { ...d.look };
			if (tone) next[part] = tone;
			else delete next[part];
			if (Object.keys(next).length) d.look = next;
			else delete d.look;
		});
	}
</script>

<Sheet {open} {onclose} label="Look">
	<h2>Look</h2>
	<p class="hint">Drawn on PC Equipped as {raceName} {CLASS_MAP.get(c.classKey)?.name ?? ''}, in the race's colours unless you pick others.</p>

	<div class="stage">
		<span class="floor" aria-hidden="true"></span>
		<HeroSprite gear={heroGear(c)} {look} px={4} label="{c.name || 'Your character'} as drawn" />
	</div>

	<h3 class="label">Gender</h3>
	<div class="seg" role="group" aria-label="Gender">
		<button type="button" aria-pressed={!c.gender} onclick={() => setGender(undefined)}>Not set</button>
		{#each GENDERS as g (g.key)}
			<button type="button" aria-pressed={c.gender === g.key} onclick={() => setGender(g.key)}>{g.label}</button>
		{/each}
	</div>

	{#each [{ part: 'skin', tones: SKIN_TONES, own: c.look?.skin, def: race.skin, title: race.face || race.style === 'none' ? 'Skin, scales or fur' : 'Skin' }, { part: 'hair', tones: HAIR_TONES, own: c.look?.hair, def: race.hair, title: race.style === 'feathers' ? 'Feathers' : 'Hair' }] as const as row (row.part)}
		<h3 class="label">{row.title}</h3>
		<div class="swatches" role="group" aria-label={row.title}>
			<button type="button" class="swatch race" aria-pressed={!row.own} onclick={() => setTone(row.part, undefined)}>
				<span class="chip" style:background="var(--color-px-{row.part}-{row.def})"></span>
				{raceName}
			</button>
			{#each row.tones as tone (tone)}
				<button
					type="button"
					class="swatch"
					aria-pressed={row.own === tone}
					aria-label={name(tone)}
					title={name(tone)}
					onclick={() => setTone(row.part, tone)}
				>
					<span class="chip" style:background="var(--color-px-{row.part}-{tone})"></span>
				</button>
			{/each}
		</div>
	{/each}
</Sheet>

<style>
	h2 {
		font-size: 22px;
	}

	.hint {
		margin-top: 4px;
		font-size: 14px;
		line-height: 1.45;
		color: var(--color-text-muted);
	}

	.stage {
		position: relative;
		display: flex;
		justify-content: center;
		align-items: flex-end;
		margin-top: 12px;
		height: 190px;
		padding-bottom: 10px;
		border-radius: 12px;
		overflow: hidden;
		background: var(--color-stage);
	}

	.floor {
		position: absolute;
		inset: auto 0 0;
		height: 28px;
		background: var(--color-stage-floor);
		border-top: 4px solid var(--color-stage-edge);
	}

	h3 {
		margin-top: 16px;
	}

	.seg {
		display: grid;
		grid-template-columns: repeat(4, minmax(0, 1fr));
		gap: 6px;
		margin-top: 6px;
	}

	.seg button {
		min-height: 40px;
		padding: 0 4px;
		border: 1px solid var(--color-border);
		border-radius: 10px;
		background: var(--color-surface);
		font-weight: 700;
		font-size: 14px;
	}

	.seg button[aria-pressed='true'] {
		border-color: var(--color-effect-ink);
		box-shadow: inset 0 0 0 1px var(--color-effect-ink);
		color: var(--color-effect-ink);
	}

	.swatches {
		display: flex;
		flex-wrap: wrap;
		gap: 6px;
		margin-top: 6px;
	}

	.swatch {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		gap: 6px;
		min-width: 40px;
		height: 40px;
		padding: 0 6px;
		border: 1px solid var(--color-border);
		border-radius: 10px;
		background: var(--color-surface);
		font-weight: 700;
		font-size: 14px;
	}

	.swatch[aria-pressed='true'] {
		border-color: var(--color-effect-ink);
		box-shadow: inset 0 0 0 1px var(--color-effect-ink);
	}

	.chip {
		width: 24px;
		height: 24px;
		border-radius: 6px;
		border: 2px solid var(--color-px-outline);
	}
</style>
