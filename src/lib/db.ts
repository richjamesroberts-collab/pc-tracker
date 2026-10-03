import Dexie, { type EntityTable } from 'dexie';
import type { Character, SpellPack } from '$lib/types';
import { migrateToBaseStats } from '$lib/character';

class PcTrackerDB extends Dexie {
	characters!: EntityTable<Character, 'id'>;
	spellPacks!: EntityTable<SpellPack, 'id'>;

	constructor() {
		super('pc-tracker');
		this.version(1).stores({
			characters: 'id, name, updatedAt'
		});
		this.version(2)
			.stores({ spellPacks: 'id' })
			.upgrade((tx) =>
				tx
					.table('characters')
					.toCollection()
					.modify((c: Character) => {
						c.spellCache ??= [];
					})
			);
		this.version(3).upgrade((tx) =>
			tx
				.table('characters')
				.toCollection()
				.modify((c: Character) => {
					c.resourcesUsed ??= {};
					c.customResources ??= [];
				})
		);
		this.version(4).upgrade((tx) =>
			tx
				.table('characters')
				.toCollection()
				.modify((c: Character) => {
					c.items ??= [];
				})
		);
		this.version(5).upgrade((tx) =>
			tx
				.table('characters')
				.toCollection()
				.modify((c: Character) => {
					for (const i of c.items) i.kind ??= 'magic';
					c.coins ??= { cp: 0, sp: 0, ep: 0, gp: 0, pp: 0 };
				})
		);
		this.version(6).upgrade((tx) =>
			tx
				.table('characters')
				.toCollection()
				.modify((c: Character) => migrateToBaseStats(c))
		);
	}
}

export const db = new PcTrackerDB();

/**
 * Ask the browser not to evict our data. Safari otherwise clears storage for sites
 * not opened in 7 days unless they're installed to the home screen.
 */
export async function requestPersistentStorage(): Promise<boolean> {
	try {
		if (!navigator.storage?.persist) return false;
		if (await navigator.storage.persisted()) return true;
		return await navigator.storage.persist();
	} catch {
		return false;
	}
}
