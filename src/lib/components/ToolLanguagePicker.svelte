<script lang="ts">
	import { canPick, LANGUAGES, picksMade, TOOL_GROUPS, toolChoices, toolLabel, toolSources, type ToolChoice, type ToolInput } from '$lib/rules/tools';

	let {
		character,
		tools = $bindable(),
		languages = $bindable(),
		strict = false
	}: {
		/** Who the picks are for: what they're given and owed is worked out from this. */
		character: ToolInput;
		/** The player's own picks. */
		tools: string[];
		languages: string[];
		/** Only what the character's choices allow, up to their limits (a new character, a level up); Edit takes anything. */
		strict?: boolean;
	} = $props();

	let newTool = $state('');
	let newLanguage = $state('');

	const sources = $derived(toolSources(character));
	const choices = $derived(toolChoices(character));
	const givenTools = $derived(sources.flatMap((s) => s.tools));
	const givenLanguages = $derived(sources.flatMap((s) => s.languages));
	/** Tools and languages that come from two places; the PHB lets the player take another instead. */
	const twice = $derived([...givenTools, ...givenLanguages].filter((k, i, all) => all.indexOf(k) !== i));
	const offered = $derived(new Set(choices.flatMap((ch) => ch.from ?? [])));

	const myTools = $derived(tools.filter((k) => !givenTools.includes(k)));
	const myLanguages = $derived(languages.filter((k) => !givenLanguages.includes(k)));
	const listedTools = new Set(TOOL_GROUPS.flatMap((g) => g.tools));
	const listedLanguages = new Set([...LANGUAGES.standard, ...LANGUAGES.exotic]);

	const toolChoiceList = $derived(choices.filter((ch) => ch.kind !== 'language'));
	const languageChoiceList = $derived(choices.filter((ch) => ch.kind === 'language'));
	const asked = (ch: ToolChoice) => {
		const what = ch.kind === 'either' ? `tool${ch.count > 1 ? 's' : ''} or language${ch.count > 1 ? 's' : ''}` : ch.kind === 'language' ? `language${ch.count > 1 ? 's' : ''}` : `tool${ch.count > 1 ? 's' : ''}`;
		return ch.from ? `choose ${ch.count} of ${ch.from.map(toolLabel).join(', ')}` : `choose ${ch.count} ${what}`;
	};
	const made = $derived(picksMade(choices, myTools, myLanguages));

	const toolOpen = (key: string) => !strict || canPick(choices, myTools, myLanguages, 'tool', key);
	const languageOpen = (key: string) => !strict || canPick(choices, myTools, myLanguages, 'language', key);

	const toggle = (list: string[], key: string) => (list.includes(key) ? list.filter((k) => k !== key) : [...list, key]);

	function addTool() {
		const name = newTool.trim().toLowerCase();
		if (name && !tools.includes(name) && !givenTools.includes(name) && toolOpen(name)) tools = [...tools, name];
		newTool = '';
	}

	function addLanguage() {
		const name = newLanguage.trim();
		if (name && !languages.includes(name) && !givenLanguages.includes(name) && languageOpen(name)) languages = [...languages, name];
		newLanguage = '';
	}

	/** Enter adds it here; in the form around it, Enter would move on. */
	const onEnter = (add: () => void) => (e: KeyboardEvent) => {
		if (e.key !== 'Enter') return;
		e.preventDefault();
		add();
	};
</script>

{#snippet chip(given: boolean, on: boolean, open: boolean, dashed: boolean, label: string, onclick: () => void)}
	<button type="button" class:offered={dashed && !on && !given} aria-pressed={given || on} disabled={given || (!on && !open)} {onclick}>{label}</button>
{/snippet}

<fieldset>
	<legend class="label">Languages</legend>
	{#if sources.some((s) => s.languages.length) || languageChoiceList.length}
		<ul class="sources">
			{#each sources.filter((s) => s.languages.length) as s (s.source)}
				<li><b>{s.source}</b> {s.languages.join(', ')}</li>
			{/each}
			{#each languageChoiceList as ch (ch.source)}
				<li><b>{ch.source}</b> {asked(ch)} ({made.get(ch) ?? 0}/{ch.count})</li>
			{/each}
		</ul>
	{/if}
	<p class="sub">Standard</p>
	<div class="chips">
		{#each LANGUAGES.standard as k (k)}
			{@render chip(givenLanguages.includes(k), languages.includes(k), languageOpen(k), strict ? languageOpen(k) : languageChoiceList.length > 0, k, () => (languages = toggle(languages, k)))}
		{/each}
	</div>
	<p class="sub">Exotic</p>
	<div class="chips">
		{#each LANGUAGES.exotic as k (k)}
			{@render chip(givenLanguages.includes(k), languages.includes(k), languageOpen(k), strict && languageOpen(k), k, () => (languages = toggle(languages, k)))}
		{/each}
	</div>
	{#if myLanguages.some((k) => !listedLanguages.has(k))}
		<div class="chips">
			{#each myLanguages.filter((k) => !listedLanguages.has(k)) as k (k)}
				<button type="button" aria-pressed="true" aria-label="Remove {k}" onclick={() => (languages = toggle(languages, k))}>{k} ×</button>
			{/each}
		</div>
	{/if}
	{#if languageOpen('')}
		<div class="add">
			<input bind:value={newLanguage} aria-label="Another language" placeholder="Another language" autocapitalize="words" autocomplete="off" onkeydown={onEnter(addLanguage)} />
			<button type="button" onclick={addLanguage} disabled={!newLanguage.trim()}>Add</button>
		</div>
	{/if}
</fieldset>

<fieldset>
	<legend class="label">Tools</legend>
	{#if sources.some((s) => s.tools.length) || toolChoiceList.length}
		<ul class="sources">
			{#each sources.filter((s) => s.tools.length) as s (s.source)}
				<li><b>{s.source}</b> {s.tools.map(toolLabel).join(', ')}</li>
			{/each}
			{#each toolChoiceList as ch, i (i)}
				<li><b>{ch.source}</b> {asked(ch)} ({made.get(ch) ?? 0}/{ch.count})</li>
			{/each}
		</ul>
	{/if}
	{#each TOOL_GROUPS as g (g.key)}
		<p class="sub">{g.name}</p>
		<div class="chips">
			{#each g.tools as k (k)}
				{@render chip(givenTools.includes(k), tools.includes(k), toolOpen(k), strict ? toolOpen(k) : offered.has(k), toolLabel(k), () => (tools = toggle(tools, k)))}
			{/each}
		</div>
	{/each}
	{#if myTools.some((k) => !listedTools.has(k))}
		<div class="chips">
			{#each myTools.filter((k) => !listedTools.has(k)) as k (k)}
				<button type="button" aria-pressed="true" aria-label="Remove {toolLabel(k)}" onclick={() => (tools = toggle(tools, k))}>{toolLabel(k)} ×</button>
			{/each}
		</div>
	{/if}
	{#if toolOpen('')}
		<div class="add">
			<input bind:value={newTool} aria-label="Another tool" placeholder="Another tool" autocomplete="off" onkeydown={onEnter(addTool)} />
			<button type="button" onclick={addTool} disabled={!newTool.trim()}>Add</button>
		</div>
	{/if}
</fieldset>

{#if twice.length}
	<p class="hint">
		{[...new Set(twice)].map(toolLabel).join(', ')} {twice.length === 1 ? 'comes' : 'come'} from two places; you can take another instead.
	</p>
{/if}

<style>
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

	.sub {
		font-size: 13px;
		font-weight: 700;
		color: var(--color-text-muted);
	}

	.hint {
		font-size: 13px;
		color: var(--color-text-muted);
	}

	.chips {
		display: flex;
		flex-wrap: wrap;
		gap: 6px;
	}

	.chips button {
		min-height: 36px;
		padding: 0 10px;
		font-size: 14px;
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

	/* What's given can't be turned off, but reads as on. */
	.chips button[aria-pressed='true']:disabled {
		opacity: 1;
	}

	/* Off, but one a list lets the player pick. */
	.chips button.offered {
		border-style: dashed;
		border-color: var(--color-accent);
	}

	.add {
		display: grid;
		grid-template-columns: minmax(0, 1fr) auto;
		gap: 8px;
	}

	.add input {
		height: 44px;
		border-radius: 12px;
		padding: 0 12px;
		background: var(--color-surface);
		width: 100%;
	}

	.add button {
		height: 44px;
		padding: 0 16px;
		border-radius: 12px;
		background: var(--color-surface);
		border: 1.5px solid var(--color-border-strong);
		color: var(--color-accent);
		font-weight: 800;
	}

	.add button:disabled {
		opacity: 0.5;
	}
</style>
