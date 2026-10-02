import { describe, expect, it } from 'vitest';
import spells from './spells.json';

describe('bundled spells', () => {
	it('has every PHB/XGE/TCE spell', () => {
		expect(spells.length).toBeGreaterThanOrEqual(477);
		const sources = new Set(spells.map((s) => s.source));
		expect([...sources].sort()).toEqual(['PHB', 'TCE', 'XGE']);
	});
	it('keeps PHB ids so existing characters still resolve', () => {
		expect(spells.find((s) => s.id === "bigby's hand|phb")?.name).toBe("Bigby's Hand");
		expect(spells.some((s) => s.id === 'toll the dead|xge')).toBe(true);
	});
});
