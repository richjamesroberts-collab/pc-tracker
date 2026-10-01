import type { Character } from '$lib/types';

const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

/** True when the character has changed since its last backup and that backup is over a week old (or never made). */
export function backupIsStale(c: Character, now = Date.now()): boolean {
	if (!c.lastBackupAt) return true;
	const last = Date.parse(c.lastBackupAt);
	return Date.parse(c.updatedAt) > last && now - last > WEEK_MS;
}
