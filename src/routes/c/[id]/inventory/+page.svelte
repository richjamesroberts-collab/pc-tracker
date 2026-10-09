<script lang="ts">
	import Pips from '$lib/components/Pips.svelte';
	import CoinSheet from '$lib/components/CoinSheet.svelte';
	import ItemSheet from '$lib/components/ItemSheet.svelte';
	import ItemText from '$lib/components/ItemText.svelte';
	import ItemPickerSheet, { type PickerEntry } from '$lib/components/ItemPickerSheet.svelte';
	import PlaceSheet, { type Destination } from '$lib/components/PlaceSheet.svelte';
	import CarrySheet from '$lib/components/CarrySheet.svelte';
	import { session } from '$lib/session.svelte';
	import {
		GEAR_CATEGORIES,
		RARITIES,
		gearInventoryItem,
		inventoryItem,
		loadGear,
		loadItems,
		priceLabel,
		rarityLabel,
		unpack,
		type GearItem,
		type MagicItem
	} from '$lib/data/content';
	import { COINS, coinCount, coinWorth, formatGp, purseOf } from '$lib/rules/coins';
	import {
		CARRY_STATUS,
		addStash,
		carriedCoins,
		carryState,
		coinRoom,
		editProblem,
		encumbrance,
		moveItem,
		overLimit,
		placed,
		putCoinsAway,
		samePlace,
		stashCapacity,
		wornContainers,
		type Place
	} from '$lib/rules/carry';
	import {
		addItem,
		attunedCopy,
		attunedCount,
		attunementLimit,
		changeQuantity,
		chargesLeft,
		dawn,
		restoreCharges,
		isActive,
		picksArmor,
		removeItem,
		setAttuned,
		setEquipped,
		spendCharges,
		stacks
	} from '$lib/rules/items';
	import { describeEffects } from '$lib/rules/stats';
	import type { Character, InventoryItem, Stash } from '$lib/types';

	type Kind = InventoryItem['kind'];

	/** Rows with more charges than this show as a number with −/+ buttons instead. */
	const MAX_PIPS = 10;

	const c = $derived(session.character as Character);
	const attuned = $derived(attunedCount(c));
	const limit = $derived(attunementLimit(c));
	const recharges = $derived(c.items.some((i) => i.charges?.regain));

	/** The stash being looked at, or null for what the character has with them. */
	let at = $state<string | null>(null);
	const here = $derived(at && c.stashes.some((s) => s.id === at) ? at : null);
	const stash = $derived(here ? c.stashes.find((s) => s.id === here) : undefined);
	const herePlace = $derived<Place>(here ? { stash: here } : {});
	const shown = $derived(c.items.filter((i) => (i.stash ?? null) === here));
	const magicItems = $derived(shown.filter((i) => i.kind === 'magic'));
	const gearItems = $derived(shown.filter((i) => i.kind === 'gear'));

	const carry = $derived(carryState(c));
	const load = $derived(encumbrance(c, carry.carried));
	const variant = $derived(c.encumbranceRule === 'variant');
	const purse = $derived(here ? (purseOf(c, here) ?? c.coins) : carriedCoins(c));
	const worn = $derived(wornContainers(c));
	const loose = $derived(coinCount(c.coins));
	const carriers = $derived(c.stashes.filter((s) => s.kind !== 'place'));
	const cap = (s: Stash) => stashCapacity(s);
	let carryOpen = $state(false);

	let library = $state<MagicItem[] | null>(null);
	let gear = $state<GearItem[] | null>(null);
	let failed = $state({ magic: false, gear: false });
	let attempt = $state(0);

	$effect(() => {
		void attempt;
		failed = { magic: false, gear: false };
		let live = true;
		loadItems().then(
			(x) => live && (library = x),
			() => live && (failed.magic = true)
		);
		loadGear().then(
			(x) => live && (gear = x),
			() => live && (failed.gear = true)
		);
		return () => (live = false);
	});

	const magicById = $derived(new Map((library ?? []).map((i) => [i.id, i])));
	const gearById = $derived(new Map((gear ?? []).map((i) => [i.id, i])));
	const dataFor = (i: InventoryItem): MagicItem | GearItem | undefined =>
		i.ref ? (i.kind === 'gear' ? gearById : magicById).get(i.ref) : undefined;


	const magicEntries = $derived<PickerEntry[] | null>(
		library?.map((m) => ({
			id: m.id,
			name: m.name,
			meta: [m.type, rarityLabel(m.rarity), m.attunement !== undefined ? 'Attunement' : '', m.source !== 'DMG' ? m.source : '']
				.filter(Boolean)
				.join(' · '),
			group: m.rarity,
			attunement: m.attunement,
			text: m.text
		})) ?? null
	);

	const gearEntries = $derived<PickerEntry[] | null>(
		gear?.map((g) => ({
			id: g.id,
			name: g.bundle ? `${g.name} ×${g.bundle}` : g.name,
			meta: [g.type, g.weight ? `${g.weight} lb` : '', g.value ? priceLabel(g.value) : ''].filter(Boolean).join(' · '),
			group: g.category,
			stats: g.stats,
			text: g.text
		})) ?? null
	);

	let expanded = $state<string | null>(null);
	let picker = $state<Kind | null>(null);
	let coinsOpen = $state(false);
	let sheetOpen = $state(false);
	/** Id of the item being edited; null for a new custom item of `customKind`. */
	let editing = $state<string | null>(null);
	let customKind = $state<Kind>('magic');
	const editingItem = $derived(editing ? c.items.find((i) => i.id === editing) : undefined);

	const lb = (n: number) => `${Math.round(n * 100) / 100} lb`;

	function meta(i: InventoryItem) {
		const box = carry.parents.get(i.id);
		return (
			[
				box ? `In ${box.name}` : '',
				i.type,
				rarityLabel(i.rarity),
				i.attunement && !i.attuned ? 'Attunement' : '',
				i.kind === 'gear' && i.weight ? lb(i.weight * i.quantity) : '',
				i.container ? `holds ${holds(i)}` : ''
			]
				.filter(Boolean)
				.join(' · ') || 'Item'
		);
	}

	/** "12 of 30 lb · 300 coins" for a container. */
	function holds(i: InventoryItem): string {
		const cap = i.container?.lb;
		const inside = carry.loads.get(i.id) ?? 0;
		const coins = i.coins ? coinCount(i.coins) : 0;
		return [
			cap !== undefined ? `${lb(inside)} of ${lb(cap)}` : `${lb(inside)} inside`,
			coins ? `${coins.toLocaleString('en')} coins` : '',
			i.container?.weightless ? 'weightless inside' : ''
		]
			.filter(Boolean)
			.join(' · ');
	}

	const copy = () => structuredClone($state.snapshot(c)) as Character;
	const placeName = (to: Place) =>
		to.inside ? `${c.items.find((i) => i.id === to.inside)?.name ?? 'the container'}` : to.stash ? (c.stashes.find((s) => s.id === to.stash)?.name ?? 'the stash') : 'you';

	/** Things to add, waiting for the player to say where they go. */
	interface Pending {
		label: string;
		/** What's being added, for the sheet's title ("Pouch", "3 × Torch"). */
		what: string;
		items: InventoryItem[];
		/** Why the sheet opened by itself, if it wasn't just asking. */
		message: string;
		/** One more of this entry: if it stays where that entry is, its count goes up instead. */
		more?: string;
		/** An equipment pack: its container (by item id) and the items that go in it. */
		pack?: { box: string; inside: string[] };
	}
	let pending = $state<Pending | null>(null);

	/** Add a pending lot at `to`. A pack's contents go in its own container, wherever that ends up. */
	function addAll(d: Character, p: Pending, to: Place): string | undefined {
		let last: string | undefined;
		const box = p.pack && p.items.find((i) => i.id === p.pack!.box);
		if (box) addItem(d, placed(d, box, to));
		for (const it of p.items) {
			if (it === box) continue;
			last = addItem(d, placed(d, it, box && p.pack!.inside.includes(it.id) ? { inside: box.id } : to));
		}
		return box && p.items.length === 1 ? box.id : last;
	}

	/** The character with a pending lot added at `to`. */
	function withAdded(p: Pending, to: Place): Character {
		const next = copy();
		addAll(next, p, to);
		return next;
	}

	/**
	 * Add things. On the With you tab the player always says how they're carrying them; in a stash they go there unless
	 * it can't take them. One more of a stack goes where the stack is, if there's room.
	 */
	function place(label: string, items: InventoryItem[], what: string, extra: Partial<Pending> = {}): string | undefined {
		const p: Pending = { label, what, items, message: '', ...extra };
		const at: Place | null = p.more ? placeOf(c.items.find((i) => i.id === p.more)!) : here ? herePlace : null;
		if (at) {
			const problem = overLimit(c, withAdded(p, at), at);
			if (!problem) return commit(p, at);
			p.message = `${what} won't fit: ${problem}. Where should ${items.length > 1 || /^\d/.test(what) ? 'they' : 'it'} go?`;
		}
		pending = p;
		return undefined;
	}

	const placeOf = (i: InventoryItem): Place => ({ stash: i.stash, inside: carry.parents.get(i.id)?.id });

	function commit(p: Pending, to: Destination): string | undefined {
		const same = p.more ? c.items.find((i) => i.id === p.more) : undefined;
		return session.mutate(to.newPlace ? `${p.label} (left at ${to.newPlace})` : p.label, (d) => {
			const target: Place = to.newPlace ? { stash: addStash(d, 'place', to.newPlace) } : to;
			if (same && samePlace(target, placeOf(same))) {
				changeQuantity(d, same.id, 1);
				return same.id;
			}
			return addAll(d, p, target);
		});
	}

	function pickPending(to: Destination) {
		// A plain copy: the items are about to be saved, and state proxies can't be.
		const p = pending && ($state.snapshot(pending) as Pending);
		pending = null;
		if (!p) return;
		const added = commit(p, to);
		if (added && (p.items.length === 1 || p.pack)) expanded = added;
	}

	/** Pack contents that fit in the pack's own container (a backpack's 30 lb), in order; the rest is strapped on. */
	function packPlan(items: InventoryItem[]): Pending['pack'] {
		const box = items.find((i) => i.container);
		if (!box) return undefined;
		let room = box.container!.lb ?? Infinity;
		const inside: string[] = [];
		for (const i of items) {
			const w = (i.weight ?? 0) * i.quantity;
			if (i === box || w > room) continue;
			inside.push(i.id);
			room -= w;
		}
		return { box: box.id, inside };
	}

	function putAway() {
		session.mutate(null, (d) => {
			const moved = putCoinsAway(d);
			session.notify(moved ? `${moved.toLocaleString('en')} coins put away` : 'No room: equip a pouch or sack', { canUndo: !!moved, tone: moved ? undefined : 'warn' });
		});
	}

	/** The entry being moved. */
	let moving = $state<string | null>(null);
	const movingItem = $derived(moving ? c.items.find((i) => i.id === moving) : undefined);
	const movingFrom = $derived<Place | undefined>(movingItem ? { stash: movingItem.stash, inside: carry.parents.get(movingItem.id)?.id } : undefined);
	const movingFull = $derived(!!movingItem && c.items.some((i) => carry.parents.get(i.id) === movingItem));

	function simulateMove(to: Place, n: number): Character | null {
		const next = copy();
		return moving && moveItem(next, moving, to, n) ? next : null;
	}

	function move(to: Destination, n: number) {
		const item = movingItem;
		if (!item) return;
		const what = n > 1 ? `${n} × ${item.name}` : item.name;
		const where = to.newPlace ?? placeName(to);
		const label = to.inside ? `${what} put in ${where}` : to.stash || to.newPlace ? `${what} left at ${where}` : `${what} back with you`;
		session.mutate(label, (d) => moveItem(d, item.id, to.newPlace ? { stash: addStash(d, 'place', to.newPlace) } : to, n));
	}

	function pick(id: string) {
		const kind = picker;
		picker = null;
		if (kind === 'magic') {
			const m = magicById.get(id);
			if (!m) return;
			const added = place(`Added ${m.name}`, [inventoryItem(m)], m.name);
			if (added) expanded = added;
			return;
		}
		const g = gearById.get(id);
		if (!g) return;
		if (g.contents) {
			const items = unpack(g, gearById);
			place(`Unpacked ${g.name}: ${items.length} items`, items, `everything in the ${g.name}`, { pack: packPlan(items) });
			return;
		}
		const item = gearInventoryItem(g);
		const what = `${item.quantity > 1 ? `${item.quantity} × ` : ''}${g.name}`;
		const added = place(`Added ${what}`, [item], what);
		if (added) expanded = added;
	}

	function openCustom() {
		customKind = picker ?? 'magic';
		picker = null;
		editing = null;
		sheetOpen = true;
	}

	function openEdit(i: InventoryItem) {
		editing = i.id;
		sheetOpen = true;
	}

	function saveItem(item: InventoryItem) {
		if (editing) {
			session.mutate(`${item.name} saved`, (d) => {
				const index = d.items.findIndex((x) => x.id === item.id);
				if (index < 0) return;
				// No longer a container: its coins come out, loose where it is.
				const coins = d.items[index].coins;
				const purse = item.stash ? d.stashes.find((x) => x.id === item.stash)?.coins : d.coins;
				if (coins && !item.container && purse) for (const k of COINS) purse[k] += coins[k];
				d.items[index] = item;
			});
		} else {
			const added = place(`Added ${item.name}`, [item], item.name);
			if (added) expanded = added;
		}
	}

	function deleteItem() {
		const id = editing;
		const name = editingItem?.name ?? 'Item';
		if (id) session.mutate(`${name} removed`, (d) => removeItem(d, id));
	}

	function toggleAttuned(i: InventoryItem) {
		if (!i.attuned && attuned >= limit) {
			session.notify(`You can attune to ${limit} items at once. End one first.`, { tone: 'warn' });
			return;
		}
		if (!i.attuned && attunedCopy(c, i)) {
			session.notify(`You're already attuned to another ${i.name}. You can't attune to two of the same item.`, { tone: 'warn' });
			return;
		}
		session.mutate(i.attuned ? `Ended attunement to ${i.name}` : `Attuned to ${i.name}`, (d) => setAttuned(d, i.id, !i.attuned));
	}

	function toggleWorn(i: InventoryItem) {
		const label = i.container
			? i.equipped
				? `Stopped using ${i.name}: it's carried as it is`
				: `Equipped ${i.name}: you can carry things in it`
			: i.weapon
			? i.equipped
				? `Put away ${i.name}`
				: `Equipped ${i.name}: it's under Attacks on Vitals`
			: i.equipped
				? `Took off ${i.name}`
				: `${i.armor?.type === 'shield' ? 'Equipped' : 'Wearing'} ${i.name}`;
		session.mutate(label, (d) => setEquipped(d, i.id, !i.equipped));
	}

	/** A generic magic weapon (+1 Weapon) whose base weapon hasn't been picked yet. */
	const needsWeapon = (i: InventoryItem) => !i.weapon && i.type.startsWith('Weapon');
	/** A magic armor of any kind (+1 Armor) whose armor hasn't been picked yet. */
	const needsArmor = (i: InventoryItem) => i.kind === 'magic' && !i.armor && picksArmor(i.type);

	/** "1d8 slashing · Versatile (1d10) · Finesse", for the details. */
	function weaponLine(i: InventoryItem): string {
		const w = i.weapon!;
		const props = w.properties.filter((p) => p !== 'versatile').map((p) => p[0].toUpperCase() + p.slice(1));
		return [
			w.damage ? `${w.damage} ${w.damageType}` : '',
			w.versatile ? `Versatile (${w.versatile})` : '',
			...props,
			w.range ? `${w.range[0]}/${w.range[1]} ft` : '',
			`${w.category[0].toUpperCase()}${w.category.slice(1)} ${w.ranged ? 'ranged' : 'melee'}`
		]
			.filter(Boolean)
			.join(' · ');
	}

	/** Why an item's effects aren't counting, if they aren't. */
	function inactiveReason(i: InventoryItem): string {
		if (i.stash) return 'Not with you';
		if (i.attunement && !i.attuned) return 'Attune to use';
		if (i.armor && !i.equipped) return i.armor.type === 'shield' ? 'Equip to use' : 'Wear to use';
		return '';
	}

	function quantity(i: InventoryItem, delta: number) {
		const label = i.quantity + delta < 1 ? `${i.name} removed` : `${i.name}: ${i.quantity + delta}`;
		if (delta > 0 && !i.container) {
			const { id: _id, coins: _coins, ...rest } = i;
			const one = { ...structuredClone($state.snapshot(rest)), id: crypto.randomUUID(), quantity: delta } as InventoryItem;
			place(label, [one], `Another ${i.name}`, { more: i.id });
			return;
		}
		session.mutate(label, (d) => changeQuantity(d, i.id, delta));
	}

	const usesWord = (i: InventoryItem, n = 2) => (i.kind === 'gear' ? (n === 1 ? 'use' : 'uses') : n === 1 ? 'charge' : 'charges');

	function spend(i: InventoryItem, n = 1) {
		session.mutate(`${i.name}: ${n} ${usesWord(i, n)} used`, (d) => spendCharges(d, i.id, n));
	}

	function restore(i: InventoryItem, n = 1) {
		session.mutate(`${i.name}: ${usesWord(i, 1)} restored`, (d) => restoreCharges(d, i.id, n));
	}

	function newDay() {
		const spent = c.items.some((i) => i.charges?.regain && chargesLeft(i) < i.charges.max);
		if (!spent) {
			session.notify('Dawn: every item is already fully charged');
			return;
		}
		const back = session.mutate(null, (d) => dawn(d)) ?? [];
		const list = back.map((r) => `${r.name} +${r.amount}`).join(', ');
		session.notify(back.length ? `Dawn: ${list}` : 'Dawn: no charges came back', { canUndo: true });
	}
</script>

{#snippet itemList(list: InventoryItem[], kind: Kind)}
	<div class="card list">
		{#each list as i (i.id)}
			{@const open = expanded === i.id}
			{@const data = dataFor(i)}
			{@const left = chargesLeft(i)}
			<div class="item">
				<button type="button" class="info" aria-expanded={open} onclick={() => (expanded = open ? null : i.id)}>
					<span class="line">
						<span class="name">{i.name}</span>
						{#if i.quantity > 1}<span class="qty">×{i.quantity}</span>{/if}
					</span>
					<span class="meta">{meta(i)}</span>
				</button>
				<div class="badges">
					{#if i.equipped}<span class="tag worn">{i.armor && i.armor.type !== 'shield' ? 'Worn' : 'Equipped'}</span>{/if}
					{#if i.attuned}<span class="tag attuned">Attuned</span>{/if}
					{#if i.charges}<span class="charges" aria-label="{left} of {i.charges.max} {usesWord(i)} left">{left}/{i.charges.max}</span>{/if}
				</div>
			</div>
			{#if open}
				<div class="details">
					{#if i.charges}
						<div class="block">
							<div class="head">
								<span class="sub">{i.kind === 'gear' ? 'Uses' : 'Charges'}</span>
								<span class="meta">
									{i.charges.regain ? `Regains ${i.charges.regain === 'all' ? `all ${usesWord(i)}` : i.charges.regain} at dawn` : 'No recharge'}
								</span>
							</div>
							{#if i.charges.max > MAX_PIPS}
								<div class="stepper">
									<span class="num">{left} / {i.charges.max}</span>
									<button type="button" aria-label="Use {i.name}" disabled={left < 1} onclick={() => spend(i)}>−</button>
									<button type="button" aria-label="Restore {i.name}" disabled={left >= i.charges.max} onclick={() => restore(i)}>+</button>
								</div>
							{:else}
								<Pips label="{i.name} {usesWord(i)}" max={i.charges.max} {left} onspend={() => spend(i)} onrestore={() => restore(i)} />
							{/if}
						</div>
					{/if}

					{#if describeEffects(i)}
						<p class="effects" class:off={!isActive(i)}>
							<b>{describeEffects(i)}</b>
							{#if !isActive(i)}<span>{inactiveReason(i)}</span>{/if}
						</p>
					{/if}
					{#if i.armor}
						<p class="effects">
							<b>{i.armor.type === 'shield' ? `Shield +${i.armor.ac} AC` : `${i.armor.type[0].toUpperCase()}${i.armor.type.slice(1)} armor, AC ${i.armor.ac}`}</b>
						</p>
					{/if}
					{#if i.weapon}
						<p class="effects"><b>{weaponLine(i)}</b></p>
					{:else if needsWeapon(i)}
						<p class="effects off"><span>Tap Edit to pick which weapon it is, then equip it for Attacks.</span></p>
					{/if}
					{#if needsArmor(i)}
						<p class="effects off"><span>Tap Edit to pick which armor it is, then wear it for AC.</span></p>
					{/if}

					{#if i.stash && (i.weapon || i.armor)}
						<p class="effects off"><span>Bring it back with you to {i.weapon ? 'equip' : 'wear'} it.</span></p>
					{/if}

					<div class="actions">
						{#if i.weapon && !i.stash}
							<button type="button" class="wear" class:on={i.equipped} aria-pressed={!!i.equipped} onclick={() => toggleWorn(i)}>
								{i.equipped ? 'Equipped' : 'Equip'}
							</button>
						{/if}
						{#if i.armor && !i.stash}
							<button type="button" class="wear" class:on={i.equipped} aria-pressed={!!i.equipped} onclick={() => toggleWorn(i)}>
								{i.equipped ? (i.armor.type === 'shield' ? 'Equipped' : 'Wearing') : i.armor.type === 'shield' ? 'Equip' : 'Wear'}
							</button>
						{/if}
						{#if i.attunement}
							<button type="button" class="attune" class:on={i.attuned} aria-pressed={i.attuned} onclick={() => toggleAttuned(i)}>
								{i.attuned ? 'Attuned' : 'Attune'}
							</button>
						{/if}
						{#if stacks(i) || i.quantity > 1}
							<div class="count" role="group" aria-label="Quantity">
								<button type="button" aria-label="One fewer {i.name}" onclick={() => quantity(i, -1)}>−</button>
								<span>{i.quantity}</span>
								<button type="button" aria-label="One more {i.name}" onclick={() => quantity(i, 1)}>+</button>
							</div>
						{/if}
						{#if i.container && !i.stash}
							<button type="button" class="wear" class:on={i.equipped} aria-pressed={!!i.equipped} onclick={() => toggleWorn(i)}>
								{i.equipped ? 'Equipped' : 'Equip'}
							</button>
						{/if}
						<button type="button" class="edit" onclick={() => (moving = i.id)}>Move</button>
						<button type="button" onclick={() => openEdit(i)}>Edit</button>
					</div>

					<div class="text">
						{#if data}
							{#if data.name !== i.name}<p class="was">{data.name}</p>{/if}
							<ItemText item={data} />
						{:else if i.ref && !failed[i.kind] && !(i.kind === 'gear' ? gear : library)}
							<p class="muted">Loading description…</p>
						{/if}
						{#if i.notes.trim()}
							{#if data}<h3 class="sub notes">Notes</h3>{/if}
							<p class="notes-text">{i.notes}</p>
						{:else if !i.ref}
							<p class="muted">No description. Tap Edit to add one.</p>
						{/if}
					</div>
				</div>
			{/if}
		{:else}
			<p class="none">{kind === 'gear' ? 'No gear yet.' : 'No magic items yet.'}</p>
		{/each}
		<button type="button" class="add" onclick={() => (picker = kind)}>{kind === 'gear' ? 'Add gear' : 'Add magic item'}</button>
	</div>
{/snippet}

<div class="top">
	<h1>Inventory</h1>
	{#if recharges}
		<button type="button" class="dawn" onclick={newDay}>
			<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 18h16M7 18a5 5 0 0 1 10 0M12 4v4M4.9 9.9l1.4 1.4M19.1 9.9l-1.4 1.4" /></svg>
			Dawn
		</button>
	{/if}
</div>

<div class="places" role="tablist" aria-label="Where things are">
	<button type="button" role="tab" aria-selected={!here} onclick={() => (at = null)}>With you</button>
	{#each c.stashes as p (p.id)}
		<button type="button" role="tab" aria-selected={here === p.id} onclick={() => (at = p.id)}>{p.name}</button>
	{/each}
	<button type="button" class="more" aria-label="Places, the party's Bag of Holding and encumbrance" onclick={() => (carryOpen = true)}>
		{c.stashes.length ? '•••' : '+ Place or party bag'}
	</button>
</div>

{#if stash}
	{@const most = cap(stash)}
	{@const kept = carry.stashLoads.get(stash.id) ?? 0}
	<button type="button" class="card load" class:warn={most !== undefined && kept > most} onclick={() => (carryOpen = true)}>
		<span class="load-top">
			<b>{lb(kept)}</b>
			{#if most !== undefined}of {lb(most)}{:else}kept here{/if}
		</span>
		{#if most !== undefined}
			<span class="bar" aria-hidden="true"><span class="fill" style:width="{Math.min(100, (kept / most) * 100)}%"></span></span>
		{/if}
		<span class="load-note">
			{stash.kind === 'bag'
				? 'Carried by someone else in the party: your things here weigh nothing on you. Fetching something takes an action.'
				: stash.kind === 'mount'
					? `Carried by ${stash.name}, up to its carrying capacity. Nothing here weighs on you, or can be used until you take it.`
					: `Not with you: things kept at ${stash.name} don't weigh on you, and can't be used until you fetch them.`}
		</span>
	</button>
{:else}
	<h2 class="label group">Carrying capacity</h2>
	<button type="button" class="card load" class:warn={load.status !== 'light'} aria-label="Carrying {lb(load.carried)} of {lb(load.capacity)}. Tap for details." onclick={() => (carryOpen = true)}>
		<span class="load-top">
			<b>{lb(load.carried)}</b> of {lb(load.capacity)}
			<span class="status">{CARRY_STATUS[load.status].label}</span>
		</span>
		<span class="bar" aria-hidden="true">
			<span class="fill" style:width="{Math.min(100, (load.carried / load.capacity) * 100)}%"></span>
			{#if variant}
				<span class="mark" style:left="{(load.encumberedAt! / load.capacity) * 100}%"></span>
				<span class="mark" style:left="{(load.heavyAt! / load.capacity) * 100}%"></span>
			{/if}
		</span>
		{#if load.status !== 'light'}<span class="load-note">{CARRY_STATUS[load.status].note}</span>{/if}
	</button>

	<h2 class="label group">Carrying on</h2>
	<div class="card carriers">
		<div class="carrier">
			<span class="what"><b>Person</b><small>Worn, held or strapped on</small></span>
			<span class="amount">{lb(carry.onPerson)}</span>
		</div>
		{#each worn as box (box.id)}
			{@const used = carry.loads.get(box.id) ?? 0}
			{@const max = box.container!.lb}
			<button type="button" class="carrier" onclick={() => (expanded = box.id)}>
				<span class="what">
					<b>{box.name}</b>
					<small>
						{[box.coins && coinCount(box.coins) ? `${coinCount(box.coins).toLocaleString('en')} coins` : '', Number.isFinite(coinRoom(carry, box)) ? `room for ${coinRoom(carry, box).toLocaleString('en')} more coins` : '', box.container!.weightless ? 'weightless inside' : '']
							.filter(Boolean)
							.join(' · ') || 'Equipped'}
					</small>
				</span>
				<span class="amount">{max !== undefined ? `${lb(used)} of ${lb(max)}` : lb(used)}</span>
				{#if max !== undefined}<span class="bar mini" aria-hidden="true"><span class="fill" style:width="{Math.min(100, (used / max) * 100)}%"></span></span>{/if}
			</button>
		{/each}
		{#each carriers as s (s.id)}
			{@const used = carry.stashLoads.get(s.id) ?? 0}
			{@const max = cap(s)}
			<button type="button" class="carrier" onclick={() => (at = s.id)}>
				<span class="what"><b>{s.name}</b><small>{s.kind === 'mount' ? 'Mount' : 'Carried by someone else'}</small></span>
				<span class="amount">{max !== undefined ? `${lb(used)} of ${lb(max)}` : lb(used)}</span>
				{#if max !== undefined}<span class="bar mini" aria-hidden="true"><span class="fill" style:width="{Math.min(100, (used / max) * 100)}%"></span></span>{/if}
			</button>
		{/each}
		{#if !worn.length}
			<p class="carrier-hint">No container equipped, so there's nowhere to keep coins. Add a pouch or sack under Gear, or equip one you have.</p>
		{/if}
	</div>
{/if}

<h2 class="label group">Coins{stash ? ` at ${stash.name}` : ' with you'}</h2>
<button type="button" class="card coins" aria-label="Coins: {formatGp(coinWorth(purse))} in all. Tap to spend, gain or move." onclick={() => (coinsOpen = true)}>
	{#each COINS as k (k)}
		<span class="coin" class:empty={!purse[k]}>
			<span class="amount">{purse[k].toLocaleString('en')}</span>
			<span class="code">{k}</span>
		</span>
	{/each}
</button>
{#if !stash && loose}
	<p class="coin-note warn">
		{loose.toLocaleString('en')} coins aren't in anything.
		{#if worn.length}
			<button type="button" class="put-away" onclick={putAway}>Put them in {worn.map((b) => b.name).join(' or ')}</button>
		{:else}
			Equip a pouch, sack or other container to keep them in.
		{/if}
	</p>
{/if}

<h2 class="label group heading">
	<span>Magic items{magicItems.length ? ` · ${magicItems.length}` : ''}</span>
	{#if !stash}<span class="attuned-count" class:full={attuned >= limit}>Attuned <b>{attuned} / {limit}</b></span>{/if}
</h2>
{@render itemList(magicItems, 'magic')}

<h2 class="label group">Gear{gearItems.length ? ` · ${gearItems.length}` : ''}</h2>
{@render itemList(gearItems, 'gear')}

<ItemPickerSheet
	open={picker === 'magic'}
	title="Add magic item"
	noun="magic items"
	entries={magicEntries}
	filters={RARITIES.map((r) => ({ key: r, label: rarityLabel(r) }))}
	failed={failed.magic}
	onretry={() => attempt++}
	onpick={pick}
	oncustom={openCustom}
	onclose={() => (picker = null)}
/>

<ItemPickerSheet
	open={picker === 'gear'}
	title="Add gear"
	noun="gear"
	entries={gearEntries}
	filters={GEAR_CATEGORIES}
	failed={failed.gear}
	onretry={() => attempt++}
	onpick={pick}
	oncustom={openCustom}
	onclose={() => (picker = null)}
/>

<ItemSheet
	open={sheetOpen}
	item={editingItem}
	bundledName={editingItem ? dataFor(editingItem)?.name : undefined}
	kind={customKind}
	onsave={saveItem}
	ondelete={deleteItem}
	check={(item) => (editing ? editProblem(c, $state.snapshot(item) as InventoryItem) : '')}
	onclose={() => (sheetOpen = false)}
/>

<CoinSheet open={coinsOpen} stash={here ?? undefined} onclose={() => (coinsOpen = false)} />

<CarrySheet
	open={carryOpen}
	onclose={() => (carryOpen = false)}
	onplace={(id) => {
		at = id;
		carryOpen = false;
	}}
/>

<PlaceSheet
	open={!!pending}
	title={pending?.message ? 'Where should it go?' : `How will you carry ${pending?.what ?? 'it'}?`}
	message={pending?.message}
	simulate={(to) => (pending ? withAdded(pending, to) : null)}
	onpick={pickPending}
	onclose={() => (pending = null)}
/>

<PlaceSheet
	open={!!movingItem}
	title={movingItem ? `Move ${movingItem.name}` : 'Move'}
	max={movingItem?.quantity ?? 1}
	split={!movingFull}
	from={movingFrom}
	simulate={simulateMove}
	onpick={move}
	onclose={() => (moving = null)}
/>

<style>
	.top {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 8px;
	}

	h1 {
		font-size: 26px;
		font-weight: 900;
	}

	.dawn {
		display: inline-flex;
		align-items: center;
		gap: 6px;
		height: 38px;
		background: var(--color-surface);
		border: 1.5px solid var(--color-border-strong);
		color: var(--color-text);
		font-size: 13px;
		font-weight: 700;
	}

	.dawn svg {
		width: 18px;
		height: 18px;
		fill: none;
		stroke: var(--color-warning);
		stroke-width: 2;
		stroke-linecap: round;
		stroke-linejoin: round;
	}

	.places {
		display: flex;
		gap: 6px;
		margin: 8px -16px 0;
		padding: 2px 16px 4px;
		overflow-x: auto;
		scrollbar-width: none;
	}

	.places button {
		flex-shrink: 0;
		min-height: 36px;
		padding: 0 14px;
		border-radius: 999px;
		border: 1.5px solid var(--color-border-strong);
		background: var(--color-surface);
		color: var(--color-text);
		font-size: 14px;
		font-weight: 800;
		white-space: nowrap;
	}

	.places button[aria-selected='true'] {
		background: var(--color-effect-ink);
		border-color: var(--color-effect-ink);
		color: var(--color-bg);
	}

	.places .more {
		border-style: dashed;
		color: var(--color-accent);
	}

	.load {
		display: flex;
		flex-direction: column;
		align-items: stretch;
		gap: 6px;
		width: 100%;
		margin-top: 10px;
		padding: 12px 14px;
		color: var(--color-text);
		font-weight: 400;
		text-align: left;
	}

	.load-top {
		display: flex;
		align-items: baseline;
		gap: 6px;
		font-size: 14px;
		color: var(--color-text-muted);
		font-variant-numeric: tabular-nums;
	}

	.load-top b {
		font-size: 22px;
		font-weight: 900;
		color: var(--color-effect-ink);
	}

	.load-top .status {
		margin-left: auto;
		font-size: 13px;
		font-weight: 800;
	}

	.load.warn .load-top b,
	.load.warn .status {
		color: var(--color-warning);
	}

	.bar {
		position: relative;
		height: 8px;
		border-radius: 999px;
		background: var(--color-chip);
		overflow: hidden;
	}

	.fill {
		position: absolute;
		inset: 0 auto 0 0;
		border-radius: 999px;
		background: var(--color-effect-ink);
	}

	.load.warn .fill {
		background: var(--color-warning);
	}

	.mark {
		position: absolute;
		top: 0;
		bottom: 0;
		width: 2px;
		background: var(--color-surface);
	}

	.load-note {
		font-size: 13px;
		line-height: 1.4;
		color: var(--color-text-muted);
	}

	.coin-note {
		margin: 6px 4px 0;
		font-size: 13px;
		line-height: 1.4;
		color: var(--color-text-muted);
	}

	.coin-note.warn {
		color: var(--color-warning);
		font-weight: 700;
	}

	.put-away {
		display: block;
		margin-top: 6px;
		min-height: 38px;
		padding: 0 14px;
		background: var(--color-surface);
		border: 1.5px solid var(--color-accent);
		color: var(--color-accent);
		font-weight: 800;
	}

	.carriers {
		overflow: hidden;
	}

	.carrier {
		display: grid;
		grid-template-columns: minmax(0, 1fr) auto;
		align-items: center;
		gap: 2px 10px;
		width: 100%;
		min-height: 54px;
		padding: 8px 14px;
		border: 0;
		border-radius: 0;
		background: transparent;
		color: var(--color-text);
		text-align: left;
		font-weight: 400;
	}

	.carrier + .carrier,
	.carrier + .carrier-hint {
		border-top: 1px solid var(--color-border);
	}

	.carrier .what {
		display: flex;
		flex-direction: column;
		min-width: 0;
	}

	.carrier b {
		font-size: 15px;
		overflow-wrap: anywhere;
	}

	.carrier small {
		font-size: 12px;
		color: var(--color-text-muted);
	}

	.carrier .amount {
		font-size: 14px;
		font-weight: 800;
		font-variant-numeric: tabular-nums;
		color: var(--color-effect-ink);
	}

	.bar.mini {
		grid-column: 1 / -1;
		height: 4px;
	}

	.carrier-hint {
		padding: 10px 14px;
		font-size: 13px;
		line-height: 1.4;
		font-weight: 700;
		color: var(--color-warning);
	}

	.heading {
		display: flex;
		align-items: baseline;
		justify-content: space-between;
		gap: 12px;
	}

	.attuned-count b {
		color: var(--color-effect-ink);
	}

	.attuned-count.full b {
		color: var(--color-warning);
	}

	.coins {
		display: grid;
		grid-template-columns: repeat(5, minmax(0, 1fr));
		width: 100%;
		padding: 10px 6px;
		color: var(--color-text);
		font-weight: 400;
		text-align: center;
	}

	.coin {
		display: flex;
		flex-direction: column;
		align-items: center;
		min-width: 0;
	}

	.coin + .coin {
		border-left: 1px solid var(--color-border);
	}

	.coin .amount {
		max-width: 100%;
		overflow: hidden;
		text-overflow: ellipsis;
		font-size: 20px;
		font-weight: 900;
		font-variant-numeric: tabular-nums;
		color: var(--color-effect-ink);
	}

	.coin .code {
		font-size: 11px;
		font-weight: 800;
		letter-spacing: 0.08em;
		text-transform: uppercase;
		color: var(--color-text-muted);
	}

	.coin.empty .amount {
		color: var(--color-text-faint);
	}

	.group {
		margin: 18px 4px 6px;
	}

	.list {
		overflow: hidden;
		padding-bottom: 12px;
	}

	.item {
		display: flex;
		align-items: center;
		gap: 8px;
		padding-right: 12px;
	}

	.list > .item:not(:first-child) {
		border-top: 1px solid var(--color-border);
	}

	.info {
		flex: 1;
		min-width: 0;
		display: flex;
		flex-direction: column;
		align-items: flex-start;
		justify-content: center;
		min-height: 58px;
		padding: 8px 12px;
		border: 0;
		border-radius: 0;
		background: transparent;
		color: var(--color-text);
		text-align: left;
		font-weight: 400;
	}

	.line {
		display: flex;
		align-items: baseline;
		gap: 6px;
		min-width: 0;
	}

	.name {
		font-size: 16px;
		font-weight: 700;
		overflow-wrap: anywhere;
	}

	.qty {
		flex-shrink: 0;
		font-size: 14px;
		font-weight: 800;
		color: var(--color-text-muted);
	}

	.meta {
		font-size: 12px;
		color: var(--color-text-muted);
	}

	.badges {
		display: flex;
		align-items: center;
		gap: 6px;
		flex-shrink: 0;
	}

	.tag {
		font-size: 11px;
		font-weight: 800;
		padding: 2px 8px;
		border-radius: 999px;
	}

	.tag.worn {
		background: var(--color-current-bg);
		color: var(--color-accent);
	}

	.effects {
		margin-top: 8px;
		font-size: 14px;
	}

	.effects b {
		color: var(--color-effect-ink);
	}

	.effects.off b {
		color: var(--color-text-muted);
	}

	.effects span {
		margin-left: 6px;
		font-size: 12px;
		font-weight: 700;
		color: var(--color-warning);
	}

	.actions .wear {
		border-color: var(--color-accent);
		color: var(--color-accent);
	}

	.actions .wear.on {
		background: var(--color-current-bg);
	}

	.tag.attuned {
		background: var(--color-effect-bg);
		color: var(--color-effect-ink);
	}

	.charges {
		min-width: 44px;
		padding: 3px 8px;
		border-radius: 10px;
		background: var(--color-spell-bg);
		color: var(--color-spell-ink);
		font-size: 14px;
		font-weight: 900;
		font-variant-numeric: tabular-nums;
		text-align: center;
	}

	.details {
		padding: 0 12px 14px;
	}

	.block {
		padding: 4px 0 2px;
	}

	.head {
		display: flex;
		align-items: baseline;
		justify-content: space-between;
		gap: 8px;
	}

	.sub {
		font-size: 13px;
		font-weight: 800;
		color: var(--color-text-muted);
	}

	.stepper {
		display: flex;
		align-items: center;
		gap: 6px;
		padding: 6px 0;
	}

	.num {
		margin-right: auto;
		font-size: 20px;
		font-weight: 900;
		font-variant-numeric: tabular-nums;
		color: var(--color-spell-ink);
	}

	.stepper button {
		min-width: 48px;
		height: 40px;
		padding: 0 10px;
		background: var(--color-surface);
		border: 1.5px solid var(--color-spell-edge);
		color: var(--color-spell-ink);
		font-weight: 800;
	}

	.stepper button:disabled {
		opacity: 0.4;
	}

	.actions {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 8px;
		margin-top: 8px;
	}

	.actions button {
		min-height: 40px;
		background: var(--color-surface);
		border: 1.5px solid var(--color-border-strong);
		color: var(--color-text);
		font-weight: 800;
	}

	.actions .attune {
		border-color: var(--color-effect-edge);
		color: var(--color-effect-ink);
	}

	.actions .attune.on {
		background: var(--color-effect-bg);
	}

	.actions .edit {
		margin-left: auto;
	}

	.count {
		display: flex;
		align-items: center;
		gap: 4px;
	}

	.count span {
		min-width: 32px;
		text-align: center;
		font-size: 18px;
		font-weight: 900;
		font-variant-numeric: tabular-nums;
	}

	.actions .count button {
		min-width: 44px;
	}

	.text {
		margin-top: 12px;
	}

	.text p {
		font-size: 15px;
		line-height: 1.5;
	}

	.was {
		margin-bottom: 6px;
		font-weight: 800;
	}

	.notes {
		margin-top: 12px;
		font-family: inherit;
	}

	.notes-text {
		white-space: pre-line;
		overflow-wrap: anywhere;
	}

	.muted {
		color: var(--color-text-muted);
	}

	.none {
		padding: 16px 16px 4px;
		font-size: 14px;
		color: var(--color-text-muted);
	}

	.add {
		display: block;
		width: calc(100% - 24px);
		min-height: 44px;
		margin: 12px 12px 0;
		border-radius: 12px;
		border: 1.5px dashed var(--color-border-strong);
		background: transparent;
		color: var(--color-accent);
		font-weight: 800;
	}
</style>
