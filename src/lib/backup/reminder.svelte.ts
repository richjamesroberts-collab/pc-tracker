import type { Character } from '$lib/types';
import { backupReminderDue, hasUnbackedChanges } from './staleness';

/** Away from the app this long counts as closing it; a quick switch to another app mid-session doesn't. */
const AWAY_MS = 15 * 60 * 1000;

/**
 * Tracks visits to the app so Vitals can remind the player to back up when they come back to a
 * character they changed last time. Browsers can't show our own prompt as the app closes (iOS ignores
 * `beforeunload`), so the reminder shows on the next visit instead.
 */
class BackupReminder {
	/** Bumped when the app opens, or comes back after being away for a while. */
	visit = $state(1);
	visitStart = $state(Date.now());

	/** Character id → had changes not backed up when first seen this visit. */
	private pending = $state<Record<string, boolean>>({});
	private seenIn = new Map<string, number>();
	private hiddenAt: number | null = null;
	private listening = false;

	/** Starts watching for the app being hidden and shown again. Safe to call more than once. */
	listen(): void {
		if (this.listening || typeof document === 'undefined') return;
		this.listening = true;
		document.addEventListener('visibilitychange', () => {
			if (document.visibilityState === 'hidden') {
				this.hiddenAt = Date.now();
			} else if (this.hiddenAt !== null && Date.now() - this.hiddenAt >= AWAY_MS) {
				this.visit++;
				this.visitStart = Date.now();
				this.hiddenAt = null;
			}
		});
	}

	/** Note whether the character came into this visit with changes not backed up. Returns true the first time it does. */
	check(c: Character): boolean {
		if (this.seenIn.get(c.id) === this.visit) return false;
		this.seenIn.set(c.id, this.visit);
		const pending = !!c.lastBackupAt && hasUnbackedChanges(c);
		this.pending[c.id] = pending;
		return pending;
	}

	due(c: Character): boolean {
		return backupReminderDue(c, this.pending[c.id] ?? false, this.visitStart);
	}
}

export const backupReminder = new BackupReminder();
