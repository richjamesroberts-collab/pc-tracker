import type { Character } from '$lib/types';
import { backupFileName, toBackup } from './backup';

/** Save a character backup file. Resolves false if the player cancelled. */
export function saveBackupFile(c: Character): Promise<boolean> {
	return saveJsonFile(backupFileName(c), JSON.stringify(toBackup(c), null, 2), `${c.name} backup`);
}

/**
 * Save a JSON file. On phones this opens the share sheet (Save to Files, AirDrop, Messages);
 * elsewhere it downloads. Resolves false if the player cancelled.
 */
export async function saveJsonFile(name: string, json: string, title: string): Promise<boolean> {
	const file = new File([json], name, { type: 'application/json' });

	if (navigator.canShare?.({ files: [file] })) {
		try {
			await navigator.share({ files: [file], title });
			return true;
		} catch (err) {
			if (err instanceof DOMException && err.name === 'AbortError') return false;
			// Share failed for another reason (e.g. not allowed here); fall back to a download.
		}
	}

	const url = URL.createObjectURL(file);
	const a = document.createElement('a');
	a.href = url;
	a.download = name;
	a.click();
	setTimeout(() => URL.revokeObjectURL(url), 1000);
	return true;
}
