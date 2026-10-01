import Dexie, { type EntityTable } from 'dexie';
import type { Character } from '$lib/types';

class PcTrackerDB extends Dexie {
	characters!: EntityTable<Character, 'id'>;

	constructor() {
		super('pc-tracker');
		this.version(1).stores({
			characters: 'id, name, updatedAt'
		});
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
