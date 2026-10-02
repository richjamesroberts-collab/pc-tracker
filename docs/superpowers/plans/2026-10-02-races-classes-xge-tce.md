# Races, Classes and XGE/TCE Content Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Bundle every PHB/XGE/TCE spell, race and class/subclass feature in the app, let players pick race/subrace, and track limited-use features with rest resets.

**Architecture:** A build script turns a local 5etools checkout into three committed JSON files (spells, classes, races). Hand-written TypeScript holds what the JSON can't: subclass keys, race keys, Dragonborn ancestries, and a tested table of limited-use resources. A new Features tab shows counters and the feature text for the character's level.

**Tech Stack:** Svelte 5 runes, SvelteKit (hash routing, adapter-static), TypeScript, Dexie, Vitest, Node script (no deps).

**Spec:** `docs/superpowers/specs/2026-10-02-races-classes-xge-tce-design.md`

## Global Constraints

- Sources: PHB, XGE, TCE, plus exactly these exceptions for keys that already exist: Cleric `Arcana|SCAG`, Paladin `Oathbreaker|DMG`, Warlock `Undead|VRGR`.
- Existing subclass keys in `src/lib/data/classes.ts` never change (backups depend on them).
- Build script fails (exit 1) when counts drop below: 13 classes, 10 races, 477 spells, or when a PHB/XGE/TCE subclass has no key mapping.
- No `SCHEMA_VERSION` bump. New `Character` fields get defaults in `readBackup` and a Dexie upgrade.
- Resource `max` uses only `level`, `proficiencyBonus(level)` and `spellMod`; `max === 0` means hidden.
- All state changes go through `session.mutate(label, fn)`; colours only from tokens in `src/app.css`.
- Feature text is plain paragraphs joined by `\n`, produced by the existing `flatten`/`stripTags`.

## Review Focus

1. A character created before this change (no `raceKey`, no `resourcesUsed`) opens on every tab without errors. Test: Task 3 `readBackup` defaults, Task 4 `resourcesFor` with missing fields.
2. Changing class, subclass or level leaves stale `resourcesUsed` keys; counters must never show negative or more than max left. Test: Task 4 "left is clamped".
3. Level drops below a resource's start level (e.g. Fighter 2 → 1): Action Surge disappears instead of showing 0/0. Test: Task 4 breakpoints at the level below.
4. A restore link from a phone running the old app (no new fields) still restores. Test: Task 3.
5. Features JSON fails to load offline on first open after an update: tab shows retry, counters still work (counters don't depend on the JSON). Test: Task 6 manual step.

---

### Task 1: Build script emits all PHB/XGE/TCE spells; drop SRD-only rule

**Files:**
- Rename: `scripts/build-spells.mjs` → `scripts/build-data.mjs`
- Create: `src/lib/data/spells.json` (generated)
- Delete: `src/lib/data/srd-spells.json`
- Modify: `package.json` (scripts), `.gitignore`, `.github/workflows/deploy.yml`, `src/lib/library.svelte.ts`, `src/routes/packs/+page.svelte`, `src/routes/c/[id]/book/+page.svelte:28`, `src/lib/types.ts:18`, `CLAUDE.md`
- Test: `src/lib/data/data.test.ts`

**Interfaces:**
- Produces: `src/lib/data/spells.json` (`Spell[]`, sorted by level then name, ids `name|source` lowercased), `BUILTIN_SPELLS: Spell[]` exported from `library.svelte.ts` with `pack: 'builtin'`; `library.packName('builtin') === 'Built in'`. Shared helpers in the script (`readJson`, `stripTags`, `flatten`, `fail(msg)`) used by Task 2.

- [ ] **Step 1: Write the failing test** in `src/lib/data/data.test.ts`

```ts
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
```

- [ ] **Step 2: Run** `npx vitest run src/lib/data/data.test.ts`. Expected: FAIL, cannot resolve `./spells.json`.

- [ ] **Step 3: Change the script.** `git mv` to `build-data.mjs`. Drop the SRD branch and the pack writer; write `all` to `src/lib/data/spells.json`. Add `fail(msg)` (prints, `process.exit(1)`) and fail if `all.length < 477`. Header comment says outputs are spells/classes/races JSON, all committed. `package.json`: `"data": "node scripts/build-data.mjs"`, keep `"spells"` pointing at the same script.

- [ ] **Step 4: Switch the app to the bundled file.** `library.svelte.ts`: import `spells.json`, rename `SRD_SPELLS` → `BUILTIN_SPELLS`, pack id `'builtin'`, `packName('builtin')` → `'Built in'`, keep `'srd'` → `'Built in'` too (old runtime value never saved, but harmless). Update the `pack` doc comment in `types.ts`, the `?? 'srd'` fallback in the book page, and the packs page ("N spells · built in", attribution text: SRD 5.1 CC-BY credit stays; add "Also includes PHB, XGE and TCE content"). `git rm src/lib/data/srd-spells.json`.

- [ ] **Step 5: Licensing cleanup.** `.gitignore`: remove the spell-pack comment block and `/src/lib/data/spells.json`; keep `/packs` and `*.spellpack.json` (locally made extras). `deploy.yml`: delete the "Fail if a spell pack slipped into the build" step and update the header comment. `CLAUDE.md`: rewrite the "Spell data (licensing)" section as "Game data": `npm run data` regenerates spells/classes/races JSON from 5etools (PHB/XGE/TCE + the three exceptions), all committed and public by the owner's choice; packs import extra spells; lookup order unchanged with "bundled" instead of "SRD". Update the Commands block.

- [ ] **Step 6: Run** `npm run data && npm test && npm run check`. Expected: script prints `Wrote 477 spells`; all tests PASS; svelte-check 0 errors.

- [ ] **Step 7: Commit** `git add -A && git commit -m "Bundle all PHB/XGE/TCE spells in the app"`

---

### Task 2: Generate classes.json and races.json; add subclasses and race keys

**Files:**
- Modify: `scripts/build-data.mjs`, `src/lib/data/classes.ts`
- Create: `src/lib/data/classes.json`, `src/lib/data/races.json` (generated), `src/lib/data/races.ts`, `src/lib/data/content.ts`
- Test: `src/lib/data/data.test.ts`

**Interfaces:**
- Produces in `content.ts`:
```ts
export interface Feature { name: string; level: number; text: string; optional?: true }
export interface ClassContent { name: string; features: Feature[]; subclasses: Record<string, Feature[]> } // keyed by our subclass key
export interface Trait { name: string; text: string }
export interface RaceContent { key: string; name: string; source: string; traits: Trait[]; subraces: { key: string; name: string; traits: Trait[] }[] }
export interface Content { classes: Record<string, ClassContent>; races: RaceContent[] } // classes keyed by classKey
export function loadContent(): Promise<Content>; // memoised; dynamic import() of both JSON files so they're separate chunks
export interface FeatureGroup { title: string; features: (Feature | (Trait & { level: 0 }))[] }
export function featureGroups(content: Content, c: Pick<Character, 'raceKey' | 'subraceKey' | 'classKey' | 'subclassKey' | 'level'>): FeatureGroup[];
```
- Produces in `races.ts`:
```ts
export interface RaceDef { key: string; name: string; subraces: { key: string; name: string }[] }
export const RACES: RaceDef[]; export const RACE_MAP: Map<string, RaceDef>;
export const DRAGON_ANCESTRY: Record<string, { damage: string; area: string; save: 'DEX' | 'CON' }>;
export function raceLabel(c: Pick<Character, 'raceKey' | 'subraceKey'>): string; // '' when unset
```
- Consumes: `Character.raceKey/subraceKey` from Task 3 (declare the `Pick` now; Task 3 adds the fields; run order is 2 then 3, so add the two optional fields to `types.ts` in this task).

- [ ] **Step 1: Write failing tests** (append to `data.test.ts`)

```ts
import classes from './classes.json';
import races from './races.json';
import { CLASSES } from './classes';
import { RACES, raceLabel } from './races';
import { featureGroups, type Content } from './content';

it('has features for every class and subclass key', () => {
	for (const cls of CLASSES) {
		expect(classes[cls.key]?.features.length, cls.key).toBeGreaterThan(0);
		for (const s of cls.subclasses) expect(classes[cls.key].subclasses[s.key]?.length, `${cls.key}/${s.key}`).toBeGreaterThan(0);
	}
});
it('marks TCE optional class features', () => {
	expect(classes.barbarian.features.find((f) => f.name === 'Primal Knowledge')?.optional).toBe(true);
	expect(classes.barbarian.features.find((f) => f.name === 'Rage')?.optional).toBeUndefined();
});
it('every race and subrace key exists in races.json', () => {
	for (const r of RACES) {
		const data = races.find((x) => x.key === r.key);
		expect(data, r.key).toBeDefined();
		for (const s of r.subraces) expect(data!.subraces.some((x) => x.key === s.key), `${r.key}/${s.key}`).toBe(true);
	}
});
it('labels races', () => {
	expect(raceLabel({ raceKey: 'elf', subraceKey: 'high' })).toBe('High Elf');
	expect(raceLabel({ raceKey: 'dragonborn', subraceKey: 'red' })).toBe('Red Dragonborn');
	expect(raceLabel({ raceKey: 'tiefling' })).toBe('Tiefling');
	expect(raceLabel({})).toBe('');
});
it('groups features up to the character level', () => {
	const g = featureGroups({ classes, races } as Content, { raceKey: 'dwarf', subraceKey: 'hill', classKey: 'fighter', subclassKey: 'champion', level: 3 });
	expect(g.map((x) => x.title)).toEqual(['Dwarf', 'Hill Dwarf', 'Fighter', 'Champion']);
	expect(g[2].features.some((f) => f.name === 'Action Surge')).toBe(true);
	expect(g[2].features.some((f) => f.name === 'Extra Attack')).toBe(false);
});
```

- [ ] **Step 2: Run** `npx vitest run src/lib/data/data.test.ts`. Expected: FAIL on missing modules.

- [ ] **Step 3: Add subclasses to `classes.ts`** (append, keep existing order and keys): barbarian `beast` "Path of the Beast", `wild-magic` "Path of Wild Magic"; bard `whispers` "College of Whispers", `creation` "College of Creation"; cleric `order` "Order Domain", `peace` "Peace Domain", `twilight` "Twilight Domain"; druid `stars` "Circle of Stars", `wildfire` "Circle of Wildfire"; fighter `psi-warrior` "Psi Warrior", `rune-knight` "Rune Knight"; monk `mercy` "Way of Mercy"; ranger `fey-wanderer` "Fey Wanderer", `swarmkeeper` "Swarmkeeper"; sorcerer `aberrant-mind` "Aberrant Mind", `clockwork-soul` "Clockwork Soul"; warlock `genie` "The Genie"; wizard `scribes` "Order of Scribes". Add the same `whispers` entry to the spec's list.

- [ ] **Step 4: Add `races.ts`.** Keys and names: `dragonborn` (subraces = ancestries `black blue brass bronze copper gold green red silver white`, names capitalised), `dwarf` (`hill` Hill, `mountain` Mountain), `elf` (`high` High, `wood` Wood, `drow` Drow), `gnome` (`forest` Forest, `rock` Rock), `half-elf`, `half-orc`, `halfling` (`lightfoot` Lightfoot, `stout` Stout), `human` (`variant` Variant), `tiefling`, `custom-lineage` "Custom Lineage". `DRAGON_ANCESTRY` from PHB p.34: black acid / blue lightning / brass fire / bronze lightning / copper acid = `5 by 30 ft. line`, DEX; gold fire / red fire = `15 ft. cone`, DEX; green poison / silver cold / white cold = `15 ft. cone`, CON. `raceLabel` = `${sub.name} ${race.name}`, or race name alone.

- [ ] **Step 5: Extend the build script.**
  - `SUBCLASS_KEYS`: `{ [ClassName]: { ['shortName|source']: key | key[] } }` covering every row printed by `node -e` over `data/class/*.json` for PHB/XGE/TCE plus the three exceptions. `Barbarian['Totem Warrior|PHB'] = ['totem-bear','totem-eagle','totem-wolf']`; `Sorcerer['Wild|PHB'] = 'wild-magic'`; `Wizard['War|XGE'] = 'war-magic'`; `Bard['Eloquence|TCE'] = 'eloquence'`; the rest follow `classes.ts`. Ignore other sources (Battlerager, Spirits…). `fail()` on a PHB/XGE/TCE subclass not in the table, and on a table entry missing from the data.
  - Class features: from each class file's `class` entry with source PHB (artificer: TCE), walk `classFeatures` (strings `Name|Class|ClassSource|Level[|Source]` or `{ classFeature }`), look up the `classFeature` record by name+level+source, `optional: true` when it has `isClassFeatureVariant`. Subclass features: `subclassFeature` records by `subclassShortName`+`subclassSource`. Teach `flatten` to inline `refClassFeature` / `refSubclassFeature` entries as `Name. text` (look up the referenced record; ids are `Name|Class|ClassSource|SubclassShort|SubclassSource|Level[|Source]`) and `refOptionalfeature` as `• Name`. Keep every subclass feature, including the intro one at the subclass's first level; the UI collapses rows.
  - Races: from `races.json` take PHB races + TCE Custom Lineage; traits = named entries of `entries` flattened. Subraces: PHB `subrace` rows with a `name`, key = lowercased first word (`Hill` → `hill`, `Variant` → `variant`); Dragonborn subraces generated from the ancestry list with one trait "Draconic Ancestry" describing damage, area and save.
  - Write `classes.json` (`Record<classKey, ClassContent>`) and `races.json` (`RaceContent[]`); `fail()` if fewer than 13 classes or 10 races.

- [ ] **Step 6: Implement `content.ts`.** `loadContent` caches one promise of `Promise.all([import('./classes.json'), import('./races.json')])`, clears the cache on rejection so retry works. `featureGroups` returns, in order and skipping empty groups: race traits (title = race name, `level: 0`), subrace traits (title = `raceLabel`), class features with `level <= c.level` (title = class name), subclass features likewise (title = subclass name from `CLASS_MAP`).

- [ ] **Step 7: Run** `npm run data && npm test && npm run check`. Expected: script prints class/race counts; all PASS.

- [ ] **Step 8: Commit** `git add -A && git commit -m "Generate class, subclass and race content from 5etools"`

---

### Task 3: Character fields, Dexie upgrade, backups

**Files:**
- Modify: `src/lib/types.ts`, `src/lib/character.ts`, `src/lib/db.ts`, `src/lib/backup/backup.ts`
- Test: `src/lib/backup/backup.test.ts`

**Interfaces:**
- Produces on `Character`: `raceKey?: string; subraceKey?: string; resourcesUsed: Record<string, number>; customResources: CustomResource[]`, and `export interface CustomResource { id: string; name: string; max: number; reset: 'short' | 'long'; used: number }` in `types.ts`.

- [ ] **Step 1: Write failing tests**

```ts
it('fills new fields when importing an old backup', () => {
	const c = readBackup({ app: APP_ID, schemaVersion: 1, character: { id: 'a', name: 'Old', classKey: 'fighter' } });
	expect(c.resourcesUsed).toEqual({});
	expect(c.customResources).toEqual([]);
	expect(c.raceKey).toBeUndefined();
});
it('keeps race, counters and custom counters, dropping junk', () => {
	const c = readBackup({ app: APP_ID, schemaVersion: 1, character: {
		id: 'a', name: 'X', classKey: 'barbarian', raceKey: 'half-orc', subraceKey: 5,
		resourcesUsed: { rage: 2, bad: 'x' },
		customResources: [{ id: 'c1', name: 'Luck', max: 3, reset: 'long', used: 1 }, { name: 'no id' }, { id: 'c2', name: 'Bad', max: 2, reset: 'weekly', used: 0 }]
	} });
	expect(c.raceKey).toBe('half-orc');
	expect(c.subraceKey).toBeUndefined();
	expect(c.resourcesUsed).toEqual({ rage: 2 });
	expect(c.customResources).toEqual([{ id: 'c1', name: 'Luck', max: 3, reset: 'long', used: 1 }]);
});
it('restore links carry race and counters', async () => {
	const c = { ...newCharacter(), name: 'R', raceKey: 'elf', subraceKey: 'drow', resourcesUsed: { 'faerie-fire': 1 } };
	const back = await decodeRestoreCode(await encodeRestoreCode(c));
	expect([back.raceKey, back.subraceKey, back.resourcesUsed]).toEqual(['elf', 'drow', { 'faerie-fire': 1 }]);
});
```

- [ ] **Step 2: Run** `npx vitest run src/lib/backup`. Expected: FAIL (fields undefined / type errors).

- [ ] **Step 3: Implement.** Fields in `types.ts`; `newCharacter()` sets `resourcesUsed: {}`, `customResources: []`. `readBackup`: `raceKey`/`subraceKey` only when strings; `resourcesUsed` keeps string keys with finite non-negative number values; `customResources` keeps items with string `id`, non-empty string `name`, `reset` of `'short' | 'long'`, `max` clamped to ≥ 1, `used` clamped to `0..max`. Dexie `version(3)` with no store change and an upgrade setting `resourcesUsed ??= {}` and `customResources ??= []`.

- [ ] **Step 4: Run** `npm test && npm run check`. Expected: PASS.

- [ ] **Step 5: Commit** `git commit -am "Add race and resource fields to characters and backups"`

---

### Task 4: Limited-use resource rules

**Files:**
- Create: `src/lib/rules/features.ts`
- Modify: `src/lib/rules/resources.ts` (`shortRest`, `longRest`)
- Test: `src/lib/rules/rules.test.ts`

**Interfaces:**
- Produces:
```ts
export interface ResourceDef {
	key: string; name: string;
	owner: { kind: 'class' | 'subclass' | 'race' | 'subrace'; key: string };
	max(c: Character): number;            // 0 = hidden
	reset(c: Character): 'short' | 'long';
	die?(c: Character): string;
	pool?: true;                          // spent in amounts, shown as a number (Lay on Hands)
}
export const RESOURCES: ResourceDef[];
export function proficiencyBonus(level: number): number;
export function resourcesFor(c: Character): ResourceDef[];  // owner matches and max > 0
export function resourceLeft(c: Character, def: ResourceDef): number; // clamp(max - used, 0, max)
export function spendResource(c: Character, key: string, n?: number): boolean; // default 1; false if not enough
export function restoreResource(c: Character, key: string, n?: number): void;
export function resetResources(c: Character, kind: 'short' | 'long'): void; // long resets everything
export function spendCustom(c: Character, id: string): boolean;
export function restoreCustom(c: Character, id: string): void;
```
- Owner matching: `class` ↔ `c.classKey`, `subclass` ↔ `c.subclassKey` (and the class must match the subclass's parent: store owner key as `'<classKey>/<subclassKey>'` for subclasses), `race` ↔ `c.raceKey`, `subrace` ↔ `c.subraceKey` with key `'<raceKey>/<subraceKey>'`.

Resource table (keys exact; text from Task 2's `classes.json` wins: fix a row if the text disagrees and note it in the commit):

| key | owner | max | reset | die |
|---|---|---|---|---|
| `rage` | class barbarian | 2@1, 3@3, 4@6, 5@12, 6@17, 0@20 | long | |
| `bardic-inspiration` | class bard | max(1, spellMod) | long, short from 5 | d6, d8@5, d10@10, d12@15 |
| `channel-divinity` | class cleric | 1@2, 2@6, 3@18 | short | |
| `wild-shape` | class druid | 2 from 2, 0@20 | short | |
| `second-wind` | class fighter | 1 | short | |
| `action-surge` | class fighter | 1@2, 2@17 | short | |
| `indomitable` | class fighter | 1@9, 2@13, 3@17 | long | |
| `ki` | class monk | level from 2 | short | |
| `divine-sense` | class paladin | max(1, 1 + spellMod) | long | |
| `lay-on-hands` | class paladin | 5 × level, `pool` | long | |
| `paladin-channel-divinity` | class paladin | 1 from 3 | short | |
| `arcane-recovery` | class wizard | 1 | long | |
| `flash-of-genius` | class artificer | max(1, spellMod) from 7 | long | |
| `superiority-dice` | fighter/battle-master | 4@3, 5@7, 6@15 | short | d8, d10@10, d12@18 |
| `arcane-shot` | fighter/arcane-archer | 2 from 3 | short | |
| `giants-might` | fighter/rune-knight | prof from 3 | long | |
| `psionic-energy` | fighter/psi-warrior | 2 × prof from 3 | long | d6, d8@5, d10@11, d12@17 |
| `soulknife-psionic-energy` | rogue/soulknife | 2 × prof from 3 | long | d6, d8@5, d10@11, d12@17 |
| `bolstering-magic` | barbarian/wild-magic | prof from 3 | long | |
| `tides-of-chaos` | sorcerer/wild-magic | 1 | long | |
| `favored-by-the-gods` | sorcerer/divine-soul | 1 | short | |
| `portent` | wizard/divination | 2 from 2, 3@14 | long | |
| `warding-flare` | cleric/light | max(1, spellMod) | long | |
| `wrath-of-the-storm` | cleric/tempest | max(1, spellMod) | long | |
| `war-priest` | cleric/war | max(1, spellMod) | long | |
| `emboldening-bond` | cleric/peace | prof | long | |
| `starry-guiding-bolt` | druid/stars | prof from 2 | long | |
| `fey-reinforcements` | ranger/fey-wanderer | 1 from 11 | long | |
| `misty-wanderer` | ranger/fey-wanderer | max(1, spellMod) from 15 | long | |
| `writhing-tide` | ranger/swarmkeeper | prof from 7 | long | |
| `restore-balance` | sorcerer/clockwork-soul | prof | long | |
| `bottled-respite` | warlock/genie | 1 | long | |
| `breath-weapon` | race dragonborn | 1 | short | 2d6, 3d6@6, 4d6@11, 5d6@16 |
| `relentless-endurance` | race half-orc | 1 | long | |
| `hellish-rebuke` | race tiefling | 1 from 3 | long | |
| `infernal-darkness` | race tiefling | 1 from 5 | long | |
| `faerie-fire` | subrace elf/drow | 1 from 3 | long | |
| `drow-darkness` | subrace elf/drow | 1 from 5 | long | |

- [ ] **Step 1: Write failing tests** (new `describe('limited-use features')`, using the existing `pc()` helper)

```ts
const max = (c: Character, key: string) => resourcesFor(c).find((r) => r.key === key)?.max(c) ?? 0;
it('proficiency bonus', () => expect([1, 4, 5, 9, 13, 17, 20].map(proficiencyBonus)).toEqual([2, 2, 3, 4, 5, 6, 6]));
it('rage breakpoints', () => expect([1, 2, 3, 6, 12, 17, 20].map((level) => max(pc({ classKey: 'barbarian', level }), 'rage'))).toEqual([2, 2, 3, 4, 5, 6, 0]));
it('action surge hidden before 2', () => {
	expect(resourcesFor(pc({ classKey: 'fighter', level: 1 })).map((r) => r.key)).toEqual(['second-wind']);
	expect(max(pc({ classKey: 'fighter', level: 17 }), 'action-surge')).toBe(2);
});
it('ki equals level from 2', () => expect([1, 2, 11].map((level) => max(pc({ classKey: 'monk', level }), 'ki'))).toEqual([0, 2, 11]));
it('bardic inspiration die and reset', () => {
	const b4 = pc({ classKey: 'bard', level: 4, spellMod: 3 }); const b5 = pc({ classKey: 'bard', level: 5, spellMod: 0 });
	const def = RESOURCES.find((r) => r.key === 'bardic-inspiration')!;
	expect([def.max(b4), def.reset(b4), def.die!(b4)]).toEqual([3, 'long', 'd6']);
	expect([def.max(b5), def.reset(b5), def.die!(b5)]).toEqual([1, 'short', 'd8']);
});
it('subclass resources need the matching class', () => {
	expect(max(pc({ classKey: 'fighter', subclassKey: 'battle-master', level: 7 }), 'superiority-dice')).toBe(5);
	expect(max(pc({ classKey: 'sorcerer', subclassKey: 'shadow', level: 7 }), 'superiority-dice')).toBe(0);
});
it('race and subrace resources', () => {
	expect(resourcesFor(pc({ raceKey: 'elf', subraceKey: 'drow', level: 5 })).map((r) => r.key)).toEqual(expect.arrayContaining(['faerie-fire', 'drow-darkness']));
	expect(max(pc({ raceKey: 'tiefling', level: 2 }), 'hellish-rebuke')).toBe(0);
});
it('left is clamped when used exceeds a lowered max', () => {
	const c = pc({ classKey: 'monk', level: 3, resourcesUsed: { ki: 9 } });
	expect(resourceLeft(c, RESOURCES.find((r) => r.key === 'ki')!)).toBe(0);
});
it('spend and pool spend', () => {
	const p = pc({ classKey: 'paladin', level: 4 });
	expect(spendResource(p, 'lay-on-hands', 15)).toBe(true);
	expect(spendResource(p, 'lay-on-hands', 6)).toBe(false);
	expect(p.resourcesUsed['lay-on-hands']).toBe(15);
});
it('short rest resets short resources and custom; long resets all', () => {
	const c = pc({ classKey: 'fighter', level: 9, resourcesUsed: { 'action-surge': 1, indomitable: 1, stale: 3 },
		customResources: [{ id: 'a', name: 'A', max: 2, reset: 'short', used: 2 }, { id: 'b', name: 'B', max: 1, reset: 'long', used: 1 }] });
	shortRest(c);
	expect(c.resourcesUsed).toEqual({ indomitable: 1, stale: 3 });
	expect(c.customResources.map((r) => r.used)).toEqual([0, 1]);
	longRest(c);
	expect(c.resourcesUsed).toEqual({});
	expect(c.customResources.map((r) => r.used)).toEqual([0, 0]);
});
```

- [ ] **Step 2: Run** `npx vitest run src/lib/rules`. Expected: FAIL (module missing).

- [ ] **Step 3: Implement `features.ts`** per the Interfaces and table. Use a small `byLevel(level, [[1, 2], [3, 3], ...])` helper for breakpoint rows. Short rest removes `resourcesUsed` keys whose def (from `resourcesFor(c)`) resets on short; unknown keys stay until a long rest. `shortRest`/`longRest` in `resources.ts` call `resetResources`.

- [ ] **Step 4: Check every row against the text** with `node -e` greps over `src/lib/data/classes.json` / `races.json` (e.g. "Superiority Dice", "Psionic Power", "Misty Wanderer"); fix rows and tests where the text disagrees.

- [ ] **Step 5: Run** `npm test && npm run check`. Expected: PASS.

- [ ] **Step 6: Commit** `git add -A && git commit -m "Track limited-use class, subclass and racial features"`

---

### Task 5: Race pickers, new subclasses in the form, labels

**Files:**
- Modify: `src/lib/components/CharacterForm.svelte`, `src/routes/c/[id]/+page.svelte:68`, `src/routes/+page.svelte:42`

**Interfaces:**
- Consumes: `RACES`, `RACE_MAP`, `raceLabel` (Task 2); `Character.raceKey/subraceKey` (Task 3).

- [ ] **Step 1: Form.** Below the name field add a `.two` row: Race `<select>` (blank "Choose…" option, then `RACES`) and Subrace `<select>` rendered only when the chosen race has subraces (label "Ancestry" for Dragonborn). `onRaceChange` clears `subraceKey`. Subclass list already reads `cls.subclasses`, so the Task 2 additions appear without changes.

- [ ] **Step 2: Labels.** Vitals header line: `[raceLabel(c), subclass, `${cls.name} ${c.level}`]` joined by ` · `, skipping empties (gives "High Elf · Bladesinging · Wizard 5"). Character list meta: prefix `raceLabel(c)` when set.

- [ ] **Step 3: Run** `npm run check && npm test`. Expected: PASS. Then `npm run dev`, create a Mountain Dwarf Fighter, confirm the subrace select shows for Dwarf, hides for Tiefling, and switching race clears the subrace.

- [ ] **Step 4: Commit** `git commit -am "Pick race and subrace for a character"`

---

### Task 6: Features tab

**Files:**
- Create: `src/routes/c/[id]/features/+page.svelte`, `src/lib/components/CounterSheet.svelte`
- Modify: `src/lib/components/TabBar.svelte`

**Interfaces:**
- Consumes: `resourcesFor`, `resourceLeft`, `spendResource`, `restoreResource`, `spendCustom`, `restoreCustom`, `shortRest`, `longRest` (Task 4); `loadContent`, `featureGroups` (Task 2); `Pips`, `Sheet`, `session.mutate`, `session.character` (existing; follow how `spells/+page.svelte` reads the character and labels mutations).

- [ ] **Step 1: Tab bar.** Add a 4th tab "Features" (`/c/[id]/features`, icon path `M4 6h16M4 12h16M4 18h10`), grid becomes `repeat(4, …)`. Check the labels still fit at 320px wide.

- [ ] **Step 2: Counters section.** For each def from `resourcesFor(c)`: name, `die` if any, reset ("Short rest"/"Long rest"), and `Pips` of left/max. Tapping a filled pip runs `session.mutate(`${name} used`, (d) => spendResource(d, key))`; tapping an empty one restores. Pool defs (`lay-on-hands`) show `left / max` with −1, −5, +1 buttons. Then the custom counters, same row style, plus an "Add counter" button. Short rest / Long rest buttons at the bottom, same labels as the Spells page.

- [ ] **Step 3: `CounterSheet.svelte`.** Props `{ open: boolean; counter?: CustomResource; onsave(r: CustomResource): void; ondelete?(): void; onclose(): void }`. Fields: name (required), max (1–99), reset (Short/Long segmented). New counters get `crypto.randomUUID()` and `used: 0`; saving with a lower max clamps `used`. Page wires save/delete through `session.mutate`.

- [ ] **Step 4: Features section.** `loadContent()` in an `$effect`; while pending show "Loading features…"; on reject show "Couldn't load features" + Retry button (calls `loadContent` again). Render `featureGroups(content, c)` as headed groups; each feature is a `<details>` row (summary = name + "Lv N" for class/subclass features; optional ones get an "Optional" tag and `opacity` via a token-based muted colour); body = `text` split on `\n` into `<p>`s, styled like `SpellDetails`. No race set: card "Pick a race in Edit" linking to `/c/[id]/edit`.

- [ ] **Step 5: Run** `npm run check && npm test && npm run build`. Expected: PASS; `build/` contains separate chunks for classes/races JSON (`ls build/_app/immutable/**` shows them).

- [ ] **Step 6: Manual check on phone** (`npm run dev:phone`):
  - Tiefling Warlock 5: Hellish Rebuke and Darkness counters show; pact slots unchanged on the Spells tab.
  - Mountain Dwarf Battle Master 7: 5 superiority dice d8, Second Wind, Action Surge. Spend a die, Undo from the toast, short rest restores dice, long rest restores Indomitable (at 9).
  - Paladin 4: Lay on Hands −5 twice shows 10 / 20.
  - Add a custom counter "Luck 3 / long", spend, long rest.
  - Airplane mode after one load: Features tab still renders. With the JSON chunk deleted from the SW cache (devtools), Retry appears and counters still work.

- [ ] **Step 7: Commit** `git add -A && git commit -m "Add Features tab with counters and feature text"`
