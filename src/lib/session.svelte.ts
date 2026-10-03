import { db } from '$lib/db';
import type { Character } from '$lib/types';
import { recompute } from '$lib/rules/stats';
import { migrateToBaseStats } from '$lib/character';

export interface Toast {
	message: string;
	tone: 'info' | 'warn';
	canUndo: boolean;
}

export interface ConcentrationCheck {
	spell: string;
	dc: number;
}

const UNDO_LIMIT = 30;
const TOAST_MS = 6000;

/** The open character. Every change is saved to IndexedDB straight away and can be undone. */
class Session {
	character = $state<Character | null>(null);
	toast = $state<Toast | null>(null);
	concentrationCheck = $state<ConcentrationCheck | null>(null);

	private undoStack: Character[] = [];
	private toastTimer: ReturnType<typeof setTimeout> | undefined;

	async load(id: string): Promise<Character | null> {
		if (this.character?.id === id) return this.character;
		this.undoStack = [];
		this.toast = null;
		this.concentrationCheck = null;
		const c = await db.characters.get(id);
		// Worked-out numbers follow the current rules, even if they changed since the last save.
		this.character = c ? recompute(migrateToBaseStats(c)) : null;
		return this.character;
	}

	/**
	 * Apply a change to a copy of the character, save it, and offer Undo.
	 * Pass `label: null` for changes too small to announce (still undoable via the stack).
	 */
	mutate<T>(label: string | null, fn: (c: Character) => T): T | undefined {
		if (!this.character) return undefined;
		const prev = $state.snapshot(this.character) as Character;
		const next = structuredClone(prev);
		const result = fn(next);
		recompute(next);
		next.updatedAt = new Date().toISOString();
		this.character = next;
		this.undoStack.push(prev);
		if (this.undoStack.length > UNDO_LIMIT) this.undoStack.shift();
		void this.save(next);
		if (label) this.notify(label, { canUndo: true });
		return result;
	}

	/** Save bookkeeping (like the last backup time) without bumping updatedAt or adding an undo step. */
	record(fn: (c: Character) => void): void {
		if (!this.character) return;
		const next = structuredClone($state.snapshot(this.character) as Character);
		fn(next);
		recompute(next);
		this.character = next;
		void this.save(next);
	}

	undo(): void {
		const prev = this.undoStack.pop();
		if (!prev) return;
		this.character = prev;
		this.concentrationCheck = null;
		void this.save(prev);
		this.notify('Undone');
	}

	notify(message: string, opts: { tone?: Toast['tone']; canUndo?: boolean } = {}): void {
		clearTimeout(this.toastTimer);
		this.toast = { message, tone: opts.tone ?? 'info', canUndo: opts.canUndo ?? false };
		this.toastTimer = setTimeout(() => (this.toast = null), TOAST_MS);
	}

	dismissToast(): void {
		clearTimeout(this.toastTimer);
		this.toast = null;
	}

	private async save(c: Character): Promise<void> {
		try {
			await db.characters.put(c);
		} catch (err) {
			console.error('Save failed', err);
			this.notify('Could not save. Storage may be full.', { tone: 'warn' });
		}
	}
}

export const session = new Session();
