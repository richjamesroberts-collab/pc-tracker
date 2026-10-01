import type { Character } from '$lib/types';

export interface DamageResult {
	/** Damage soaked by temp HP. */
	absorbed: number;
	/** CON save DC to keep concentration, when concentrating. */
	concentrationDC?: number;
	droppedToZero: boolean;
	/** Remaining damage at 0 HP met or beat max HP (PHB p.197). */
	instantDeath: boolean;
}

export function isDown(c: Character): boolean {
	return c.hpCurrent <= 0;
}

export function isDead(c: Character): boolean {
	return c.hpCurrent <= 0 && c.deathSaves.failures >= 3;
}

export function applyDamage(c: Character, amount: number, opts: { critical?: boolean } = {}): DamageResult {
	const dmg = Math.max(0, Math.floor(amount));
	const result: DamageResult = { absorbed: 0, droppedToZero: false, instantDeath: false };
	if (dmg === 0) return result;

	const wasDown = isDown(c);
	result.absorbed = Math.min(c.tempHp, dmg);
	c.tempHp -= result.absorbed;
	const remaining = dmg - result.absorbed;

	if (c.concentration && !wasDown) result.concentrationDC = Math.max(10, Math.floor(dmg / 2));

	if (wasDown) {
		// Damage at 0 HP is a failed death save (two on a crit), or death if it's massive.
		if (remaining >= c.hpMax) result.instantDeath = true;
		else if (remaining > 0) c.deathSaves.failures = Math.min(3, c.deathSaves.failures + (opts.critical ? 2 : 1));
		c.stable = false;
	} else if (remaining >= c.hpCurrent) {
		const overflow = remaining - c.hpCurrent;
		c.hpCurrent = 0;
		result.droppedToZero = true;
		result.instantDeath = overflow >= c.hpMax;
		c.deathSaves = { successes: 0, failures: 0 };
		c.stable = false;
		// Unconscious creatures can't concentrate.
		c.concentration = undefined;
		result.concentrationDC = undefined;
	} else {
		c.hpCurrent -= remaining;
	}

	if (result.instantDeath) c.deathSaves.failures = 3;
	return result;
}

export function applyHealing(c: Character, amount: number): void {
	const heal = Math.max(0, Math.floor(amount));
	if (heal === 0) return;
	if (isDown(c)) {
		c.deathSaves = { successes: 0, failures: 0 };
		c.stable = false;
	}
	c.hpCurrent = Math.min(c.hpMax, Math.max(0, c.hpCurrent) + heal);
}

/** Temp HP doesn't stack: keep whichever is higher (PHB p.198). Returns false if the new value was lower. */
export function applyTempHp(c: Character, amount: number): boolean {
	const temp = Math.max(0, Math.floor(amount));
	if (temp <= c.tempHp) return false;
	c.tempHp = temp;
	return true;
}

export type DeathSaveRoll = 'success' | 'failure' | 'nat20' | 'nat1';

export function rollDeathSave(c: Character, roll: DeathSaveRoll): void {
	if (!isDown(c) || isDead(c)) return;
	switch (roll) {
		case 'nat20':
			c.hpCurrent = 1;
			c.deathSaves = { successes: 0, failures: 0 };
			c.stable = false;
			return;
		case 'success':
			c.deathSaves.successes = Math.min(3, c.deathSaves.successes + 1);
			break;
		case 'failure':
			c.deathSaves.failures = Math.min(3, c.deathSaves.failures + 1);
			break;
		case 'nat1':
			c.deathSaves.failures = Math.min(3, c.deathSaves.failures + 2);
			break;
	}
	if (c.deathSaves.successes >= 3) c.stable = true;
}

export function stabilise(c: Character): void {
	if (!isDown(c)) return;
	c.stable = true;
	c.deathSaves = { successes: 0, failures: 0 };
}
