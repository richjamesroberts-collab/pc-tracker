# Races, classes, subclasses and XGE/TCE content — design

Date: 2026-10-02

## Goal

Players can pick their race, subrace, class and subclass from the full PHB, XGE and TCE options. The app shows the features they have at their level and tracks limited-use features (Rage, Ki, Channel Divinity, Breath Weapon...) with short- and long-rest resets. Every PHB/XGE/TCE spell is available without importing a pack, as on linklord.github.io/spellbook.

## Decisions (from brainstorming)

- **Depth:** pickers, feature text, and counters for limited-use features.
- **Licensing:** the user chose to **bundle all PHB/XGE/TCE content publicly**. This replaces the SRD-only rule. Spell pack import stays for content from other sources.
- **Counters:** hand-curated, tested rules (not parsed from text), plus player-defined custom counters.
- **Scope of races:** the PHB's 9 races and their subraces, plus TCE Custom Lineage. XGE adds no races. Other books (VGM, MPMM, SCAG) are out of scope.

## Data

`scripts/build-spells.mjs` becomes `scripts/build-data.mjs` (`npm run data`; keep `npm run spells` as an alias). It reads `../5etools-2014-src` (`FIVETOOLS_DIR` override), sources PHB, XGE and TCE, and writes these committed files:

- `src/lib/data/spells.json`: all 477 spells (replaces `srd-spells.json`), same `Spell` shape.
- `src/lib/data/classes.json`: per class, features by level `{ name, level, text, optional? }`, and per subclass (keyed by **our** subclass key) features by level. `optional` marks TCE optional class features.
- `src/lib/data/races.json`: races `{ key, name, source, traits: {name, text}[], subraces: {key, name, traits}[] }`. Dragonborn draconic ancestries are subraces (`dragonborn-red`...). Variant Human is a subrace of Human.

Subclass mapping: an explicit table in the build script maps 5etools `className|shortName|source` to our existing keys (`totem-bear/eagle/wolf` all map to Totem Warrior). The script **fails** if any PHB/XGE/TCE subclass lacks a mapping, or if counts drop below: 13 classes, 10 races, 477 spells.

Feature text reuses the existing `flatten`/`stripTags`. Text is plain paragraphs, same as spells.

Loading: `classes.json` and `races.json` are loaded with dynamic `import()` from the Features and Edit routes. The service worker precaches the chunks for offline use. Spells keep their current loading path in `library.svelte.ts`, now from `spells.json`, with packs still overriding by id.

## classes.ts

Keeps the hand data (saves, weakSaves). Adds the missing TCE subclasses with new keys:

- Barbarian: `beast`, `wild-magic`
- Bard: `creation`
- Cleric: `order`, `peace`, `twilight`
- Druid: `stars`, `wildfire`
- Fighter: `psi-warrior`, `rune-knight`
- Monk: `mercy`
- Ranger: `fey-wanderer`, `swarmkeeper`
- Sorcerer: `aberrant-mind`, `clockwork-soul`
- Warlock: `genie`
- Wizard: `scribes`

Existing keys never change. A new `src/lib/data/races.ts` exports race and subrace keys and names, so pickers work before the JSON loads.

## Character model

New fields on `Character`:

```ts
raceKey?: string;
subraceKey?: string;
/** Uses spent per resource key since its last reset. */
resourcesUsed: Record<string, number>;
customResources: CustomResource[];

interface CustomResource { id: string; name: string; max: number; reset: 'short' | 'long'; used: number }
```

- Dexie: new version whose upgrade sets `resourcesUsed = {}` and `customResources = []`.
- `readBackup` applies the same defaults. No `SCHEMA_VERSION` bump.
- Restore links include the new fields.

## Rules: `src/lib/rules/features.ts`

```ts
interface ResourceDef {
	key: string;            // e.g. 'rage', 'channel-divinity', 'breath-weapon'
	name: string;
	owner: { kind: 'class' | 'subclass' | 'race' | 'subrace'; key: string };
	max(c: Character): number;          // 0 = hidden
	reset(c: Character): 'short' | 'long';  // may depend on level (Bardic Inspiration short from 5)
	die?(c: Character): string;         // 'd8', 'd6'...
}
export function resourcesFor(c: Character): ResourceDef[];
export function proficiencyBonus(level: number): number;
```

`max` uses only level, proficiency bonus and `spellMod`. Rests: `shortRest` resets short resources and short custom counters. `longRest` resets everything. Unknown keys in `resourcesUsed` are ignored.

Initial resource list:

| Owner | Resource | Max | Reset |
|---|---|---|---|
| Barbarian | Rage | 2/3/4/5/6 at 1/3/6/12/17, unlimited at 20 (hidden) | long |
| Bard | Bardic Inspiration (d6→d12) | max(1, spellMod) | long; short from 5 |
| Cleric | Channel Divinity | 1/2/3 at 2/6/18 | short |
| Druid | Wild Shape | 2 from level 2 (unlimited at 20) | short |
| Fighter | Second Wind | 1 | short |
| Fighter | Action Surge | 1 at 2, 2 at 17 | short |
| Fighter | Indomitable | 1/2/3 at 9/13/17 | long |
| Monk | Ki | level (from 2) | short |
| Paladin | Divine Sense | 1 + spellMod | long |
| Paladin | Lay on Hands (pool) | 5 × level | long |
| Paladin | Channel Divinity | 1 from 3 | short |
| Sorcerer | (existing sorcery points, unchanged) | | |
| Warlock | (existing pact slots/arcanum, unchanged) | | |
| Wizard | Arcane Recovery | 1 | long |
| Artificer | Flash of Genius | max(1, spellMod) from 7 | long |
| Battle Master | Superiority Dice (d8/d10/d12) | 4/5/6 at 3/7/15 | short |
| Arcane Archer | Arcane Shot | 2 | short |
| Rune Knight | Giant's Might | prof | long |
| Psi Warrior | Psionic Energy dice | 2 × prof | long |
| Soulknife | Psionic Energy dice | 2 × prof | long |
| Wild Magic barb | Bolstering Magic | prof | long |
| Wild Magic sorc | Tides of Chaos | 1 | long |
| Divination | Portent | 2, 3 at 14 | long |
| Peace | Emboldening Bond | prof | long |
| Stars | Guiding Bolt free casts (Starry Form spends Wild Shape) | prof | long |
| Fey Wanderer | Misty Step free casts (from 7) | prof | long |
| Swarmkeeper | Writhing Tide (from 7) | prof | long |
| Clockwork Soul | Restore Balance | prof | long |
| Genie | Bottled Respite | 1 | long |
| Dragonborn | Breath Weapon (2d6→5d6) | 1 | short |
| Half-Orc | Relentless Endurance | 1 | long |
| Tiefling | Hellish Rebuke (from 3), Darkness (from 5) | 1 each | long |
| Drow | Faerie Fire (from 3), Darkness (from 5) | 1 each | long |

Features that spend another resource (Twilight Sanctuary → Channel Divinity, Wildfire Spirit → Wild Shape) get no counter of their own. Every row is checked against the 5etools feature text while implementing. Where the text disagrees with this table, the text wins and the table is fixed in the plan.

## UI

- **Features tab** (`/c/[id]/features`, 4th tab in `TabBar`):
  - Counters with `Pips`. Tap spends one through `session.mutate`, with Undo. Lay on Hands is a number pool with −/+ steps.
  - "Add counter" sheet for custom counters (name, max, reset). Edit and delete them in the same sheet.
  - Feature list grouped Race → Subrace → Class → Subclass, levels ≤ the character's level. Rows are collapsed and expand to show text. Optional TCE features are dimmed and labelled "Optional".
  - With no race set: a prompt linking to Edit.
- **Short/long rest** actions run the new resets as well as the existing ones.
- **Edit form**: Race select, plus a Subrace select only when the race has subraces. Changing race clears the subrace. Subclass list includes the new subclasses.
- **Vitals header**: "High Elf · Wizard 5 (Bladesinging)".

## Licensing changes (user decision)

The user accepted the risk knowingly: publishing non-SRD WotC text could draw a DMCA takedown of the repo or Pages site. The alternatives (private pack, or public names and numbers with pack-only prose) were considered and declined.

- Remove `/src/lib/data/spells.json` and the pack lines from `.gitignore`. Keep `/packs` ignored only for locally generated extras, or drop it.
- Remove the deploy guard "Fail if a spell pack slipped into the build".
- Update `CLAUDE.md` (Spell data section) and the Spell packs page text: built-in content is now PHB/XGE/TCE. Keep the SRD CC-BY attribution.

## Errors

- Build script: hard failure on missing subclass mapping or low counts.
- Runtime: missing feature data for a key shows the name only. Missing resource defs show nothing. A failed `classes.json` import shows "Couldn't load features" with a retry.

## Testing

- `rules.test.ts`: max/reset/die for every resource at its breakpoint levels; prof bonus at 1/5/9/13/17; short vs long rest resets, including custom counters.
- `backup.test.ts`: an old backup without the new fields imports with defaults; a round trip keeps race and counters; a restore link carries the new fields.
- `data.test.ts`: every `CLASSES` subclass key has features in `classes.json`; every `ResourceDef.owner` key exists; every race key in `races.ts` exists in `races.json`; spells.json has 477 spells.
- Manual on phone (`npm run dev:phone`): Tiefling Warlock 5 and Mountain Dwarf Battle Master 7. Spend counters, short rest, long rest, Undo, offline reload.

## Out of scope

Ability scores, feats, multiclassing, auto-adding racial cantrips, books beyond PHB/XGE/TCE.
