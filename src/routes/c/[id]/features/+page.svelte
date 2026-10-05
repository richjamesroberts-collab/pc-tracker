<script lang="ts">
	import { resolve } from '$app/paths';
	import { session } from '$lib/session.svelte';
	import { loadContent, loadFeats, loadOptions, featureGroups, type ClassOptionData, type Content, type FeatData } from '$lib/data/content';
	import { OPTION_INFO } from '$lib/rules/levelup';
	import { proficiencyBonus } from '$lib/rules/features';
	import { signedMod } from '$lib/rules/abilities';
	import { FIGHTING_STYLE_MAP } from '$lib/rules/attacks';
	import { proficiencyLabel, proficiencyList, weaponProficiencies } from '$lib/rules/proficiency';
	import { senses } from '$lib/rules/senses';
	import type { Character } from '$lib/types';

	const c = $derived(session.character as Character);

	let content = $state<Content | null>(null);
	let featData = $state.raw<Map<string, FeatData>>(new Map());
	let optionData = $state.raw<Map<string, ClassOptionData>>(new Map());
	let failed = $state(false);
	let attempt = $state(0);

	$effect(() => {
		void attempt;
		failed = false;
		let live = true;
		Promise.all([loadContent(), loadFeats(), loadOptions()]).then(
			([x, f, o]) => {
				if (!live) return;
				content = x;
				featData = new Map(f.map((d) => [d.id, d]));
				optionData = new Map(o.map((d) => [d.id, d]));
			},
			() => live && (failed = true)
		);
		return () => (live = false);
	});

	const groups = $derived(content ? featureGroups(content, c) : []);
	/** Feats, then each kind of class option the character knows, with their text where it's bundled. */
	const picks = $derived([
		{
			key: 'feats',
			title: 'Feats',
			list: c.feats.map((f) => ({
				name: f.name,
				meta: f.level ? `Lv ${f.level}` : '',
				text: (f.ref && featData.get(f.ref)?.text) || ''
			}))
		},
		...(Object.keys(OPTION_INFO) as (keyof typeof OPTION_INFO)[]).map((kind) => ({
			key: kind,
			title: OPTION_INFO[kind].many,
			list: c.classOptions
				.filter((o) => o.kind === kind)
				.map((o) => ({ name: o.name, meta: '', text: optionData.get(o.ref)?.text ?? '' }))
		}))
	].filter((g) => g.list.length));
	const weapons = $derived(proficiencyList(weaponProficiencies(c)).map(proficiencyLabel));
	const styles = $derived(c.fightingStyles.map((k) => FIGHTING_STYLE_MAP.get(k)).filter((s) => !!s));
	const senseList = $derived(senses(c));
</script>

<h1>Features</h1>

<h2 class="label group">Proficiencies and senses</h2>
<div class="card profs">
	<p><b>Proficiency bonus</b> {signedMod(proficiencyBonus(c.level))}</p>
	<p><b>Weapons</b> {weapons.length ? weapons.join(', ') : 'None'}</p>
	{#each styles as st (st.key)}
		<p><b>{st.name}</b> {st.text}</p>
	{/each}
	<p><b>Senses</b> {senseList.length ? senseList.map((x) => `${x.name} ${x.range} ft`).join(', ') : 'None beyond normal sight'}</p>
	<a href={resolve('/c/[id]/edit', { id: c.id })}>Change in Edit</a>
</div>

{#if !c.raceKey}
	<div class="card pick">
		<a href={resolve('/c/[id]/edit', { id: c.id })}>Pick a race in Edit</a>
	</div>
{/if}

{#if failed}
	<div class="card status" role="alert">
		<p>Couldn't load features</p>
		<button type="button" onclick={() => attempt++}>Retry</button>
	</div>
{:else if !content}
	<p class="status muted">Loading features…</p>
{:else}
	{#each groups as group (group.kind)}
		<h2 class="label group">{group.title}</h2>
		<div class="card list">
			{#each group.features as f, i (i)}
				<details>
					<summary>
						<span class="fname">{f.name}</span>
						{#if 'optional' in f && f.optional}<span class="tag">Optional</span>{/if}
						{#if f.level > 0}<span class="lv">Lv {f.level}</span>{/if}
					</summary>
					<div class="text" class:optional={'optional' in f && f.optional}>
						{#each f.text.split('\n').filter((p) => p.trim()) as para, j (j)}
							<p>{para}</p>
						{/each}
					</div>
				</details>
			{/each}
		</div>
	{/each}
	{#each picks as group (group.key)}
		<h2 class="label group">{group.title}</h2>
		<div class="card list">
			{#each group.list as f, i (i)}
				<details>
					<summary>
						<span class="fname">{f.name}</span>
						{#if f.meta}<span class="lv">{f.meta}</span>{/if}
					</summary>
					<div class="text">
						{#each (f.text || 'Added by hand; no description bundled.').split('\n').filter((p) => p.trim()) as para, j (j)}
							<p>{para}</p>
						{/each}
					</div>
				</details>
			{/each}
		</div>
	{/each}
{/if}

<style>
	h1 {
		font-size: 26px;
		font-weight: 900;
	}

	.profs {
		display: flex;
		flex-direction: column;
		gap: 6px;
		padding: 14px 16px;
		font-size: 15px;
	}

	.profs b {
		margin-right: 4px;
	}

	.profs a {
		align-self: flex-start;
		padding-top: 4px;
		font-size: 14px;
		font-weight: 800;
		color: var(--color-accent);
	}

	.pick {
		margin-top: 14px;
		padding: 16px;
		text-align: center;
	}

	.pick a {
		color: var(--color-accent);
		font-weight: 800;
	}

	.status {
		margin-top: 18px;
		padding: 16px;
		text-align: center;
		font-weight: 700;
	}

	.status.muted {
		color: var(--color-text-muted);
	}

	.status button {
		margin-top: 10px;
		min-height: 40px;
		background: var(--color-surface);
		border: 1.5px solid var(--color-border-strong);
		color: var(--color-text);
		font-weight: 800;
	}

	.group {
		margin: 18px 4px 6px;
	}

	.list {
		overflow: hidden;
	}

	details + details {
		border-top: 1px solid var(--color-border);
	}

	summary {
		display: flex;
		align-items: center;
		gap: 8px;
		min-height: 52px;
		padding: 8px 12px;
		cursor: pointer;
		list-style: none;
	}

	summary::-webkit-details-marker {
		display: none;
	}

	.fname {
		flex: 1;
		min-width: 0;
		font-size: 16px;
		font-weight: 700;
		overflow-wrap: anywhere;
	}

	.tag {
		flex-shrink: 0;
		font-size: 11px;
		font-weight: 800;
		padding: 1px 6px;
		border-radius: 6px;
		background: var(--color-chip);
		color: var(--color-text-muted);
	}

	.lv {
		flex-shrink: 0;
		font-size: 13px;
		font-weight: 700;
		color: var(--color-text-muted);
	}

	details:has(.tag) summary .fname {
		color: var(--color-text-muted);
	}

	.text {
		padding: 0 12px 12px;
	}

	.text.optional {
		color: var(--color-text-muted);
	}

	.text p {
		font-size: 15px;
		line-height: 1.5;
	}

	.text p + p {
		margin-top: 8px;
	}
</style>
