<script lang="ts">
	import { untrack } from 'svelte';
	import Sheet from './Sheet.svelte';
	import { RARITIES, rarityLabel } from '$lib/data/content';
	import { parseRegain } from '$lib/rules/items';
	import type { ArmorType, InventoryItem, ItemEffects } from '$lib/types';

	let {
		open,
		item,
		kind = 'magic',
		onsave,
		ondelete,
		onclose
	}: {
		open: boolean;
		/** The item being edited; absent for a new custom item. */
		item?: InventoryItem;
		/** What a new custom item is; an edited item keeps its own. */
		kind?: InventoryItem['kind'];
		onsave: (item: InventoryItem) => void;
		ondelete?: () => void;
		onclose: () => void;
	} = $props();

	let name = $state('');
	let type = $state('');
	let rarity = $state('');
	let attunement = $state(false);
	let quantity = $state(1);
	let weight = $state<number | null>(null);
	let armorType = $state<ArmorType | ''>('');
	let armorAc = $state<number | null>(null);
	/** Custom items only: a flat AC bonus while attuned (or worn, for armor). */
	let acBonus = $state<number | null>(null);
	let charges = $state(0);
	let regain = $state('');
	let notes = $state('');
	// Fixed when the sheet opens, so the title doesn't change while it closes after a delete.
	let editing = $state(false);
	let custom = $state(true);
	let gear = $state(false);

	// Seed the form only when the sheet opens, so Undo underneath doesn't wipe what's typed.
	$effect(() => {
		if (!open) return;
		untrack(() => {
			editing = !!item;
			custom = !item?.ref;
			gear = (item?.kind ?? kind) === 'gear';
			name = item?.name ?? '';
			type = item?.type ?? '';
			rarity = item?.rarity ?? '';
			attunement = item?.attunement ?? false;
			quantity = item?.quantity ?? 1;
			weight = item?.weight ?? null;
			armorType = item?.armor?.type ?? '';
			armorAc = item?.armor?.ac ?? null;
			acBonus = item?.effects?.ac ?? null;
			charges = item?.charges?.max ?? 0;
			regain = item?.charges?.regain ?? '';
			notes = item?.notes ?? '';
		});
	});

	const regainOk = $derived(!regain.trim() || parseRegain(regain) !== null);
	const valid = $derived(
		!!name.trim() &&
			Number.isInteger(quantity) &&
			quantity >= 1 &&
			quantity <= 9999 &&
			(weight === null || (Number.isFinite(weight) && weight >= 0)) &&
			(!armorType || (Number.isInteger(armorAc) && armorAc! >= 0 && armorAc! <= 30)) &&
			(acBonus === null || Number.isInteger(acBonus)) &&
			Number.isInteger(charges) &&
			charges >= 0 &&
			charges <= 99 &&
			regainOk
	);

	function save(e: SubmitEvent) {
		e.preventDefault();
		if (!valid) return;
		const max = charges;
		const effects: ItemEffects = { ...(item?.effects ?? {}) };
		if (custom) {
			if (acBonus) effects.ac = acBonus;
			else delete effects.ac;
		}
		onsave({
			id: item?.id ?? crypto.randomUUID(),
			kind: gear ? 'gear' : 'magic',
			...(item?.ref ? { ref: item.ref } : {}),
			name: name.trim(),
			type: type.trim(),
			rarity: gear ? '' : rarity,
			attunement: !gear && attunement,
			attuned: !gear && attunement && !!item?.attuned,
			quantity,
			...(weight ? { weight } : {}),
			...(armorType && armorAc !== null
				? { armor: { type: armorType, ac: armorAc }, equipped: !!item?.equipped }
				: {}),
			effects,
			...(max > 0
				? { charges: { max, used: Math.min(item?.charges?.used ?? 0, max), ...(regain.trim() ? { regain: regain.trim() } : {}) } }
				: {}),
			notes
		});
		onclose();
	}
</script>

<Sheet {open} {onclose} label={editing ? 'Edit item' : 'Add a custom item'}>
	<h2>{editing ? 'Edit item' : 'Custom item'}</h2>
	{#if custom && !editing}
		<p class="muted">{gear ? 'For anything not on the list: loot, keepsakes, homebrew.' : 'For items from other books, homebrew, or anything missing from the list.'}</p>
	{/if}
	<form onsubmit={save}>
		<label class="field">
			<span>Name</span>
			<input bind:value={name} required autocapitalize="words" placeholder={custom ? (gear ? 'Silver locket' : 'Cloak of the Bat') : ''} />
		</label>
		{#if custom && gear}
			<label class="field">
				<span>Type</span>
				<input bind:value={type} autocapitalize="sentences" placeholder="Adventuring gear" />
			</label>
		{:else if custom}
			<div class="two">
				<label class="field">
					<span>Type</span>
					<input bind:value={type} autocapitalize="sentences" placeholder="Wondrous item" />
				</label>
				<label class="field">
					<span>Rarity</span>
					<select bind:value={rarity}>
						<option value="">Unknown</option>
						{#each RARITIES as r (r)}
							<option value={r}>{rarityLabel(r)}</option>
						{/each}
					</select>
				</label>
			</div>
			<label class="check">
				<input type="checkbox" bind:checked={attunement} /> Requires attunement
			</label>
		{/if}
		{#if custom || item?.armor || type.startsWith('Armor')}
			<div class="two">
				<label class="field">
					<span>Armor</span>
					<select
						bind:value={armorType}
						onchange={() => {
							if (armorType === 'shield' && armorAc === null) armorAc = 2;
						}}
					>
						<option value="">Not armor</option>
						<option value="light">Light armor</option>
						<option value="medium">Medium armor</option>
						<option value="heavy">Heavy armor</option>
						<option value="shield">Shield</option>
					</select>
				</label>
				{#if armorType}
					<label class="field">
						<span>{armorType === 'shield' ? 'Shield AC bonus' : 'Base AC'}</span>
						<input type="number" inputmode="numeric" min="0" max="30" step="1" bind:value={armorAc} placeholder={armorType === 'shield' ? '2' : '14'} />
					</label>
				{/if}
			</div>
			{#if type.startsWith('Armor (any') || type.startsWith('Armor (medium')}
				<small>Pick the armor it is (chain mail is heavy, AC 16). Its magic bonus is added on top.</small>
			{/if}
		{/if}
		{#if custom}
			<label class="field">
				<span>AC bonus while {attunement ? 'attuned' : armorType ? 'worn' : 'carried'}</span>
				<input type="number" inputmode="numeric" step="1" bind:value={acBonus} placeholder="0" />
			</label>
		{/if}
		<div class="three">
			<label class="field">
				<span>Quantity</span>
				<input type="number" inputmode="numeric" min="1" max="9999" step="1" bind:value={quantity} required />
			</label>
			<label class="field">
				<span>Weight (lb)</span>
				<input type="number" inputmode="decimal" min="0" step="any" bind:value={weight} placeholder="0" />
			</label>
			<label class="field">
				<span>{gear ? 'Uses' : 'Charges'}</span>
				<input type="number" inputmode="numeric" min="0" max="99" step="1" bind:value={charges} />
			</label>
		</div>
		{#if charges > 0}
			<label class="field">
				<span>{gear ? 'Uses back at dawn' : 'Regains at dawn'}</span>
				<input bind:value={regain} placeholder="all, 3 or 1d6 + 1" aria-invalid={!regainOk} />
				{#if !regainOk}
					<small class="error">Use “all”, a number, or dice like 1d6 + 1.</small>
				{:else}
					<small>Leave blank if {gear ? 'uses' : 'charges'} don't come back by themselves.</small>
				{/if}
			</label>
		{/if}
		<label class="field">
			<span>{custom ? 'Description' : 'Notes'}</span>
			<textarea bind:value={notes} rows="4" placeholder={custom ? '' : gear ? 'Where it is, who gave it to you…' : 'Command word, which weapon it is…'}></textarea>
		</label>
		<button type="submit" class="save" disabled={!valid}>{editing ? 'Save' : 'Add item'}</button>
		{#if editing && ondelete}
			<button
				type="button"
				class="delete"
				onclick={() => {
					ondelete();
					onclose();
				}}>Remove item</button
			>
		{/if}
	</form>
</Sheet>

<style>
	h2 {
		font-size: 22px;
	}

	.muted {
		font-size: 14px;
		color: var(--color-text-muted);
	}

	form {
		display: flex;
		flex-direction: column;
		gap: 10px;
		margin-top: 12px;
	}

	.field {
		display: flex;
		flex-direction: column;
		gap: 4px;
		min-width: 0;
	}

	.field > span {
		font-size: 13px;
		font-weight: 700;
		color: var(--color-text-muted);
	}

	.field input,
	.field select {
		height: 46px;
		border-radius: 12px;
		width: 100%;
	}

	.field textarea {
		border-radius: 12px;
		width: 100%;
	}

	small {
		font-size: 12px;
		color: var(--color-text-muted);
	}

	small.error {
		color: var(--color-danger);
		font-weight: 700;
	}

	.two,
	.three {
		display: grid;
		grid-template-columns: repeat(2, minmax(0, 1fr));
		gap: 10px;
	}

	.three {
		grid-template-columns: repeat(3, minmax(0, 1fr));
	}

	.check {
		display: flex;
		align-items: center;
		gap: 8px;
		min-height: 40px;
		font-weight: 600;
	}

	.check input {
		width: 20px;
		height: 20px;
		accent-color: var(--color-effect-ink);
	}

	.save {
		height: 52px;
		margin-top: 4px;
		border: 0;
		border-radius: 14px;
		background: var(--color-effect-ink);
		color: var(--color-bg);
		font-size: 16px;
		font-weight: 800;
	}

	.save:disabled {
		opacity: 0.45;
	}

	.delete {
		height: 46px;
		border: 1.5px solid var(--color-used-edge);
		border-radius: 14px;
		background: transparent;
		color: var(--color-danger);
		font-weight: 800;
	}
</style>
