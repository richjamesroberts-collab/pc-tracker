import type { Character } from '$lib/types';

const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

/** True when the character has changed since its last backup and that backup is over a week old (or never made). */
export function backupIsStale(c: Character, now = Date.now()): boolean {
	if (!c.lastBackupAt) return true;
	const last = Date.parse(c.lastBackupAt);
	return Date.parse(c.updatedAt) > last && now - last > WEEK_MS;
}

/** True when the character has never been backed up, or has changed since its last backup. */
export function hasUnbackedChanges(c: Pick<Character, 'updatedAt' | 'lastBackupAt'>): boolean {
	return !c.lastBackupAt || Date.parse(c.updatedAt) > Date.parse(c.lastBackupAt);
}

/**
 * Whether to show the back-up reminder. A character never backed up always gets one. After that it
 * only comes up when the player left the app with changes not backed up (`pendingAtVisit`, checked
 * when this visit began), so changes made mid-session don't nag. Backing up during the visit clears it.
 */
export function backupReminderDue(c: Pick<Character, 'updatedAt' | 'lastBackupAt'>, pendingAtVisit: boolean, visitStart: number): boolean {
	if (!c.lastBackupAt) return true;
	return pendingAtVisit && Date.parse(c.lastBackupAt) < visitStart;
}
