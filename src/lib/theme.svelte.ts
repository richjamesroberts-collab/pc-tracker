export type ThemePreference = 'auto' | 'light' | 'dark';
export type Theme = 'light' | 'dark';

const STORAGE_KEY = 'theme';
/** Page background per theme, used for the phone's status bar colour. Matches --color-bg in app.css. */
const BAR_COLOUR: Record<Theme, string> = { light: '#fffdf9', dark: '#191a1d' };

/**
 * Light / dark / auto. Auto follows the phone's own setting and switches live (e.g. at sunset).
 * The inline script in app.html applies the saved choice before first paint.
 */
class ThemeState {
	preference = $state<ThemePreference>('auto');
	systemDark = $state(false);
	resolved = $derived<Theme>(this.preference === 'auto' ? (this.systemDark ? 'dark' : 'light') : this.preference);

	private started = false;

	start(): void {
		if (this.started || typeof window === 'undefined') return;
		this.started = true;
		let saved: string | null = null;
		try {
			saved = localStorage.getItem(STORAGE_KEY);
		} catch {
			// Storage blocked (private mode): fall back to auto.
		}
		this.preference = saved === 'light' || saved === 'dark' ? saved : 'auto';
		const media = window.matchMedia('(prefers-color-scheme: dark)');
		this.systemDark = media.matches;
		media.addEventListener('change', (e) => {
			this.systemDark = e.matches;
			this.apply();
		});
		this.apply();
	}

	set(preference: ThemePreference): void {
		this.preference = preference;
		try {
			if (preference === 'auto') localStorage.removeItem(STORAGE_KEY);
			else localStorage.setItem(STORAGE_KEY, preference);
		} catch {
			// Storage unavailable; the choice still applies for this session.
		}
		this.apply();
	}

	/** One-tap switch to the opposite of what's showing. */
	toggle(): void {
		this.set(this.resolved === 'dark' ? 'light' : 'dark');
	}

	private apply(): void {
		const theme = this.resolved;
		document.documentElement.dataset.theme = theme;
		// Keep the status bar matching the app rather than the phone's system setting.
		document.querySelectorAll('meta[name="theme-color"]').forEach((meta) => {
			meta.setAttribute('content', BAR_COLOUR[theme]);
		});
	}
}

export const theme = new ThemeState();
