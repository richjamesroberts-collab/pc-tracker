<script lang="ts">
	import { untrack } from 'svelte';
	import Sheet from './Sheet.svelte';
	import { ITEM_TYPES, RARITIES, copyWeapon, loadGear, rarityLabel, type GearItem } from '$lib/data/content';
	import { armorFits, parseRegain, picksArmor, specificName, weaponFits } from '$lib/rules/items';
	import { WEAPONS, proficiencyLabel } from '$lib/rules/proficiency';
	import type { ArmorType, InventoryItem, ItemArmor, ItemContainer, ItemEffects, ItemWeapon } from '$lib/types';

	let {
		open,
		item,
		bundledName,
		kind = 'magic',
		onsave,
		ondelete,
		check,
		onclose
	}: {
		open: boolean;
		/** The item being edited; absent for a new custom item. */
		item?: InventoryItem;
		/** The bundled item's own name ("+1 Weapon"), so picking what it is can rename it. */
		bundledName?: string;
		/** What a new custom item is; an edited item keeps its own. */
		kind?: InventoryItem['kind'];
		onsave: (item: InventoryItem) => void;
		ondelete?: () => void;
		/** Why the edited item can't be saved as it is (too heavy to carry where it is); empty when it can. */
		check?: (item: InventoryItem) => string;
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
	/** The PHB weapon it is (lowercase name), or '' if it isn't one. */
	let weaponBase = $state('');
	/** The PHB armor a magic armor of any kind is (lowercase name), or '' if not picked. */
	let armorBase = $state('');
	/** Custom items only: a magic weapon's bonus to attack and damage rolls. */
	let weaponBonus = $state<number | null>(null);
	let gearList = $state<GearItem[] | null>(null);
	let charges = $state(0);
	let regain = $state('');
	/** Custom items only: pounds it holds as a container, and whether what's inside weighs nothing. */
	let holds = $state<number | null>(null);
	let weightless = $state(false);
	let notes = $state('');
	/** Why the last save was refused, cleared on the next edit. */
	let problem = $state('');
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
			type = item?.type ?? ITEM_TYPES[gear ? 'gear' : 'magic'][0];
			rarity = item?.rarity ?? '';
			attunement = item?.attunement ?? false;
			quantity = item?.quantity ?? 1;
			weight = item?.weight ?? null;
			armorType = item?.armor?.type ?? '';
			armorAc = item?.armor?.ac ?? null;
			acBonus = item?.effects?.ac ?? null;
			weaponBase = item?.weapon?.base ?? '';
			armorBase = item?.armor?.base ?? '';
			weaponBonus = item?.effects?.attack ?? null;
			charges = item?.charges?.max ?? 0;
			regain = item?.charges?.regain ?? '';
			holds = item?.container?.lb ?? null;
			weightless = !!item?.container?.weightless;
			notes = item?.notes ?? '';
			problem = '';
		});
	});

	// A refusal stops applying once the numbers it was about change.
	$effect(() => {
		void quantity;
		void weight;
		void holds;
		void weightless;
		untrack(() => (problem = ''));
	});

	/** The dropdown's choices, keeping a type typed before it was a dropdown. */
	const typeOptions = $derived.by(() => {
		const list = ITEM_TYPES[gear ? 'gear' : 'magic'];
		return type && !list.includes(type) ? [type, ...list] : list;
	});

	// Custom items and magic weapons can say which PHB weapon they are; bundled gear weapons already know.
	const pickWeapon = $derived(custom || (!gear && (!!item?.weapon || type.startsWith('Weapon'))));
	// Magic armor of any kind (+1 Armor) says which PHB armor it is; the rest have theirs already.
	const pickArmor = $derived(!custom && !gear && picksArmor(type));
	/** Generic magic weapons and armor are renamed for what they are ("+1 Longsword"). */
	const renames = $derived(!custom && !gear && (type.startsWith('Weapon (any') || picksArmor(type)));
	/** The name before anything was picked, from the bundled item (or the entry, if nothing's been picked yet). */
	const generic = $derived(bundledName ?? (item && !item.weapon && !item.armor?.base ? item.name : undefined));

	$effect(() => {
		if (!open || !(pickWeapon || pickArmor) || gearList) return;
		loadGear().then(
			(g) => (gearList = g),
			() => {}
		);
	});

	/** PHB weapons by base name, from the bundled gear (the Staff focus fights as a quarterstaff, so names win). */
	const weaponsByBase = $derived.by(() => {
		const out = new Map<string, GearItem & { weapon: ItemWeapon }>();
		for (const g of gearList ?? []) {
			if (!g.weapon) continue;
			if (!out.has(g.weapon.base) || g.name.toLowerCase() === g.weapon.base) out.set(g.weapon.base, g as GearItem & { weapon: ItemWeapon });
		}
		return out;
	});

	/** PHB armor by lowercase name, leaving out what this item can't be (light armor for Mithral Armor). */
	const armorsByBase = $derived.by(() => {
		const out = new Map<string, GearItem & { armor: ItemArmor }>();
		for (const g of gearList ?? []) if (g.armor && armorFits(type, g.armor)) out.set(g.name.toLowerCase(), g as GearItem & { armor: ItemArmor });
		return out;
	});

	const ARMOR_GROUPS = ['light', 'medium', 'heavy'] as const;

	/** The weapon stats to save: the item's own if the base is unchanged, else the PHB weapon's. */
	function weaponFor(base: string): ItemWeapon | undefined {
		if (!base) return undefined;
		if (item?.weapon?.base === base) return copyWeapon(item.weapon);
		const w = weaponsByBase.get(base)?.weapon;
		return w ? copyWeapon(w) : undefined;
	}

	/** The armor to save for a magic armor of any kind: the PHB armor picked, or AC entered before it could be picked. */
	function armorFor(base: string): ItemArmor | undefined {
		if (!base) return item?.armor && !item.armor.base ? { ...item.armor } : undefined;
		const g = armorsByBase.get(base);
		if (g) return { type: g.armor.type, ac: g.armor.ac, base };
		return item?.armor?.base === base ? { ...item.armor } : undefined;
	}

	/** After picking what it is: rename it ("+1 Longsword") and use its weight, unless the player changed those. */
	function picked(prev: { name: string; weight?: number } | undefined, next: { name: string; weight?: number } | undefined) {
		if (renames && generic) {
			const was = name.trim();
			if (was === generic || (prev && was === specificName(generic, prev.name))) name = next ? specificName(generic, next.name) : generic;
		}
		if (weight === null || weight === (prev?.weight ?? null)) weight = next?.weight ?? null;
	}

	function chooseWeapon(base: string) {
		picked(weaponsByBase.get(weaponBase), weaponsByBase.get(base));
		weaponBase = base;
	}

	function chooseArmor(base: string) {
		picked(armorsByBase.get(armorBase), armorsByBase.get(base));
		armorBase = base;
	}

	const armorLine = (a: ItemArmor) => (a.type === 'shield' ? `Shield +${a.ac}` : `${a.type[0].toUpperCase()}${a.type.slice(1)} armor, AC ${a.ac}`);

	const regainOk = $derived(!regain.trim() || parseRegain(regain) !== null);
	const valid = $derived(
		!!name.trim() &&
			Number.isInteger(quantity) &&
			quantity >= 1 &&
			quantity <= 9999 &&
			(weight === null || (Number.isFinite(weight) && weight >= 0)) &&
			(holds === null || (Number.isFinite(holds) && holds >= 0 && holds <= 99_999)) &&
			(!armorType || (Number.isInteger(armorAc) && armorAc! >= 0 && armorAc! <= 30)) &&
			(acBonus === null || Number.isInteger(acBonus)) &&
			(weaponBonus === null || Number.isInteger(weaponBonus)) &&
			Number.isInteger(charges) &&
			charges >= 0 &&
			charges <= 99 &&
			regainOk
	);

	function save(e: SubmitEvent) {
		e.preventDefault();
		if (!valid) return;
		const max = charges;
		const weapon = pickWeapon ? weaponFor(weaponBase) : item?.weapon;
		const armor = pickArmor ? armorFor(armorBase) : armorType && armorAc !== null ? { type: armorType, ac: armorAc } : undefined;
		const effects: ItemEffects = { ...(item?.effects ?? {}) };
		const container: ItemContainer | undefined = !custom
			? item?.container
			: holds || weightless
				? { ...(holds ? { lb: holds } : {}), ...(weightless ? { weightless: true } : {}), ...(item?.container?.coins ? { coins: true } : {}) }
				: undefined;
		if (custom) {
			if (acBonus) effects.ac = acBonus;
			else delete effects.ac;
			if (weapon && weaponBonus) effects.attack = effects.damage = weaponBonus;
			else {
				delete effects.attack;
				delete effects.damage;
			}
		}
		const next: InventoryItem = {
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
			...(armor ? { armor } : {}),
			...(weapon ? { weapon } : {}),
			...(armor || weapon || container ? { equipped: !!item?.equipped } : {}),
			effects,
			...(max > 0
				? { charges: { max, used: Math.min(item?.charges?.used ?? 0, max), ...(regain.trim() ? { regain: regain.trim() } : {}) } }
				: {}),
			...(item?.use ? { use: item.use } : {}),
			...(container ? { container } : {}),
			...(container && item?.coins ? { coins: item.coins } : {}),
			...(item?.inside ? { inside: item.inside } : {}),
			...(item?.stash ? { stash: item.stash } : {}),
			notes
		};
		problem = check?.(next) ?? '';
		if (problem) return;
		onsave(next);
		onclose();
	}
</script>

{#snippet typeSelect()}
	<select bind:value={type}>
		{#each typeOptions as t (t)}
			<option value={t}>{t}</option>
		{/each}
		<option value="">Other</option>
	</select>
{/snippet}

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
				{@render typeSelect()}
			</label>
		{:else if custom}
			<div class="two">
				<label class="field">
					<span>Type</span>
					{@render typeSelect()}
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
		{#if pickArmor}
			<label class="field">
				<span>Armor</span>
				<select value={armorBase} onchange={(e) => chooseArmor(e.currentTarget.value)} disabled={!gearList && !item?.armor?.base}>
					<option value="">{item?.armor && !item.armor.base ? `As entered: ${armorLine(item.armor)}` : 'Pick which armor…'}</option>
					{#if item?.armor?.base && !gearList}
						<option value={item.armor.base}>{proficiencyLabel(item.armor.base)}</option>
					{/if}
					{#if gearList}
						{#each ARMOR_GROUPS as group (group)}
							{@const list = [...armorsByBase].filter(([, g]) => g.armor.type === group)}
							{#if list.length}
								<optgroup label="{group[0].toUpperCase()}{group.slice(1)} armor">
									{#each list as [key, g] (key)}
										<option value={key}>{g.name} (AC {g.armor.ac})</option>
									{/each}
								</optgroup>
							{/if}
						{/each}
					{/if}
				</select>
				<small>Which armor this is, for its AC. Its magic bonus is added on top.</small>
			</label>
		{:else if custom}
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
		{/if}
		{#if pickWeapon}
			<label class="field">
				<span>Weapon</span>
				<select value={weaponBase} onchange={(e) => chooseWeapon(e.currentTarget.value)} disabled={!gearList && !item?.weapon}>
					<option value="">{custom ? 'Not a weapon' : 'Pick which weapon…'}</option>
					{#if item?.weapon && !gearList}
						<option value={item.weapon.base}>{proficiencyLabel(item.weapon.base)}</option>
					{/if}
					{#if gearList}
						{#each WEAPONS as group (group.category)}
							{@const names = group.names.filter((n) => weaponsByBase.has(n) && weaponFits(type, weaponsByBase.get(n)!.weapon))}
							{#if names.length}
								<optgroup label={proficiencyLabel(group.category)}>
									{#each names as n (n)}
										<option value={n}>{weaponsByBase.get(n)!.name}</option>
									{/each}
								</optgroup>
							{/if}
						{/each}
					{/if}
				</select>
				<small>{custom ? 'Pick the closest PHB weapon so it can be equipped for Attacks.' : 'Which weapon this is, for its damage and Attacks.'}</small>
			</label>
			{#if custom && weaponBase}
				<label class="field">
					<span>Magic bonus to attack and damage</span>
					<input type="number" inputmode="numeric" step="1" bind:value={weaponBonus} placeholder="0" />
				</label>
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
		{#if custom}
			<div class="two">
				<label class="field">
					<span>Holds (lb)</span>
					<input type="number" inputmode="decimal" min="0" step="any" bind:value={holds} placeholder="Not a container" />
				</label>
				<label class="check holds">
					<input type="checkbox" bind:checked={weightless} /> Weightless inside
				</label>
			</div>
		{/if}
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
		{#if problem}<p class="problem" role="alert">{problem}</p>{/if}
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

	.problem {
		padding: 10px 12px;
		border-radius: 12px;
		border-left: 4px solid var(--color-warning);
		background: var(--color-surface-raised);
		font-size: 14px;
		line-height: 1.45;
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

	.check.holds {
		align-self: end;
		min-height: 46px;
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
