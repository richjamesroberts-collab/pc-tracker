import type { Character } from '$lib/types';
import { backupFileName, toBackup } from './backup';

/**
 * Save a backup file. On phones this opens the share sheet (Save to Files, AirDrop, Messages);
 * elsewhere it downloads. Resolves false if the player cancelled.
 */
export async function saveBackupFile(c: Character): Promise<boolean> {
	const name = backupFileName(c);
	const json = JSON.stringify(toBackup(c), null, 2);
	const file = new File([json], name, { type: 'application/json' });

	if (navigator.canShare?.({ files: [file] })) {
		try {
			await navigator.share({ files: [file], title: `${c.name} backup` });
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
