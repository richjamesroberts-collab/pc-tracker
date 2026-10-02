import { describe, expect, it } from 'vitest';
import { backupReminderDue, hasUnbackedChanges } from './staleness';

const at = (iso: string) => Date.parse(iso);

describe('backup reminders', () => {
	it('spots changes since the last backup', () => {
		expect(hasUnbackedChanges({ updatedAt: '2026-10-01T10:00:00Z' })).toBe(true);
		expect(hasUnbackedChanges({ updatedAt: '2026-10-01T10:00:00Z', lastBackupAt: '2026-10-01T11:00:00Z' })).toBe(false);
		expect(hasUnbackedChanges({ updatedAt: '2026-10-01T12:00:00Z', lastBackupAt: '2026-10-01T11:00:00Z' })).toBe(true);
	});

	it('always reminds a character that was never backed up', () => {
		expect(backupReminderDue({ updatedAt: '2026-10-01T10:00:00Z' }, false, at('2026-10-02T09:00:00Z'))).toBe(true);
	});

	it('reminds on the next visit when the player left changes not backed up', () => {
		const c = { updatedAt: '2026-10-01T22:00:00Z', lastBackupAt: '2026-10-01T18:00:00Z' };
		expect(backupReminderDue(c, true, at('2026-10-02T09:00:00Z'))).toBe(true);
	});

	it("doesn't nag about changes made during this visit", () => {
		const c = { updatedAt: '2026-10-02T09:30:00Z', lastBackupAt: '2026-10-01T18:00:00Z' };
		expect(backupReminderDue(c, false, at('2026-10-02T09:00:00Z'))).toBe(false);
	});

	it('clears once the player backs up during the visit', () => {
		const c = { updatedAt: '2026-10-02T09:30:00Z', lastBackupAt: '2026-10-02T09:10:00Z' };
		expect(backupReminderDue(c, true, at('2026-10-02T09:00:00Z'))).toBe(false);
	});
});
