import type { Action } from 'svelte/action';

export interface SwipeOptions {
	/** Called when the row is let go after being dragged far enough left. */
	onswipe: () => void;
}

/** How far a drag goes before it counts as a swipe or a scroll. */
const SLOP = 8;

/**
 * Swipe right to left. The row follows the finger; let go past the threshold (a third of the row, at most 120 px)
 * and `onswipe` runs, then it slides back. Vertical drags are left to the page to scroll. The row gets `swiping`
 * while it moves and `armed` while it's past the threshold, so whatever sits behind it can show what letting go does.
 */
export const swipeLeft: Action<HTMLElement, SwipeOptions> = (node, initial) => {
	let options = initial;
	let start: { x: number; y: number; id: number } | null = null;
	let dragging = false;
	let dx = 0;

	node.style.touchAction = 'pan-y';

	const threshold = () => Math.min(120, node.offsetWidth / 3);

	function set(x: number) {
		dx = x;
		node.style.transform = x ? `translateX(${x}px)` : '';
		const armed = -x >= threshold();
		if (armed && !node.classList.contains('armed')) navigator.vibrate?.(10);
		node.classList.toggle('armed', armed);
	}

	function reset() {
		start = null;
		dragging = false;
		node.classList.remove('swiping');
		set(0);
	}

	function down(e: PointerEvent) {
		node.removeEventListener('click', swallow, { capture: true });
		if (!e.isPrimary || e.button !== 0) return;
		start = { x: e.clientX, y: e.clientY, id: e.pointerId };
	}

	function move(e: PointerEvent) {
		if (!start || e.pointerId !== start.id) return;
		const x = e.clientX - start.x;
		const y = e.clientY - start.y;
		if (!dragging) {
			if (Math.abs(x) < SLOP && Math.abs(y) < SLOP) return;
			if (x >= 0 || Math.abs(y) >= Math.abs(x)) {
				start = null;
				return;
			}
			dragging = true;
			node.setPointerCapture(e.pointerId);
			node.classList.add('swiping');
		}
		e.preventDefault();
		set(Math.max(-node.offsetWidth, Math.min(0, x)));
	}

	function up(e: PointerEvent) {
		if (!start || e.pointerId !== start.id) return;
		const swiped = dragging && -dx >= threshold();
		// The click that may end a drag isn't a tap on whatever is under the finger. Touch drags often end without
		// one, so it's dropped at the next press rather than left to eat a real tap.
		if (dragging) node.addEventListener('click', swallow, { capture: true, once: true });
		reset();
		if (swiped) options.onswipe();
	}

	function swallow(e: MouseEvent) {
		e.stopPropagation();
		e.preventDefault();
	}

	node.addEventListener('pointerdown', down);
	node.addEventListener('pointermove', move);
	node.addEventListener('pointerup', up);
	node.addEventListener('pointercancel', reset);

	return {
		update(next) {
			options = next;
		},
		destroy() {
			node.removeEventListener('pointerdown', down);
			node.removeEventListener('pointermove', move);
			node.removeEventListener('pointerup', up);
			node.removeEventListener('pointercancel', reset);
			node.removeEventListener('click', swallow, { capture: true });
		}
	};
};
