# CLAUDE.md

Guidance for Claude Code when working in this repository.

## Project Overview

D&D 5e (2014) **player** tracker: a phone-first web app each player uses at the table for their own character. Sister project to `../5e-combat-tracker` (the DM's tool) but fully standalone: no sync, no backend, each phone keeps its own data.

Tracks: name, portrait, XP (next-level progress and level up with hit points, or milestone levelling), base ability scores (racial increases, Primal Champion and attuned magic items applied on top), AC (worked out from worn armor, DEX, Unarmored Defense and item bonuses, or entered), HP (current/max, raised by items that change CON), temp HP, death saves, spell slots (incl. warlock pact slots and Mystic Arcanum), sorcery points with Font of Magic and metamagic, known/prepared spells, concentration, race/subrace, weapon proficiencies, fighting styles, senses (darkvision etc. from race and class, plus the player's own), attacks with equipped weapons, limited-use class/subclass/racial feature counters (plus custom counters), feature text, and an inventory: coins (with change-making when spending), magic items (attunement, charges with dawn recharge) and mundane gear (equipment packs unpack into their contents), plus custom items and carried weight.

## Tech Stack

- Svelte 5 (runes) + SvelteKit, `adapter-static` with **hash routing** (`router.type: 'hash'`), so the build is a single `index.html` that works on any static host. Hash routing ignores `+page.ts`/`+layout.ts` page options; don't add them. For a subfolder host set `BASE_PATH` at build time (the GitHub Pages workflow does this).
- TypeScript, Dexie.js over IndexedDB (`pc-tracker` database, `characters` table)
- Vitest for rules and backup tests
- Service worker (`src/service-worker.ts`) caches the app for offline use; web manifest + icons in `static/`
- Theme tokens in `src/app.css` are shared with the combat tracker; all colours come from tokens

## Game data

`npm run data` (alias `npm run spells`) regenerates the bundled JSON in `src/lib/data/` from a local 5etools checkout (`../5etools-2014-src`, override with `FIVETOOLS_DIR`): `spells.json` (all PHB/XGE/TCE spells), `classes.json` (class and subclass features, keyed by our class and subclass keys), `races.json` (PHB races and Custom Lineage) `items.json` (DMG/XGE/TCE magic items, plus generic variants like +1 Weapon and Flame Tongue) and `gear.json` (PHB weapons, armor, tools, adventuring gear and packs; DMG poisons, gems and art objects; bundles like Arrows (20) fold into a default quantity on the single item) and `race-abilities.json` (racial ability score increases, bundled with the app shell). Magic items carry `effects` (ability scores set or raised, AC, spell attack/DC, weapon attack/damage) and armor carries `armor` (type and base AC). Weapons (gear, and magic weapons of a set kind) carry `weapon` (base PHB weapon, category, damage, properties, range); generic magic weapons (+1 Weapon) get one when the player picks the base weapon in the item sheet. Subclasses are PHB/XGE/TCE plus three older ones that already had keys: Cleric Arcana (SCAG), Paladin Oathbreaker (DMG), Warlock Undead (VRGR). The script fails if counts drop or a PHB/XGE/TCE subclass has no key in its `SUBCLASS_KEYS` table. The output is committed and shipped publicly, by the owner's choice.

Spell packs (`.spellpack.json`, stored in the `spellPacks` table) are for extra spells players import on their own phone. Characters keep a `spellCache` copy of pack spells they use, so backups restore on phones without the pack. Lookup order: installed library (bundled spells, overridden by packs with the same id) → custom spells → cache.

## Architecture

- `src/lib/rules/` — pure 5e rules (slot tables, HP/temp/death saves, sorcery points, rests, item attunement/charges/dawn, coins).
- `src/lib/rules/stats.ts` — worked-out numbers. The player enters base values (`abilities`, `hpBase`, `acAuto`/`acBase`/`acAdjust`, optional `initiativeOverride`/`spellModOverride`); `recompute` sets `ac`, `hpMax`, `spellMod` and `initiativeModifier` from them and runs after every `session.mutate`/`record`, on load and on import. Never set those four directly. Item effects are copied onto inventory entries so this stays synchronous; entries from before effects existed are filled in from the bundled data by the character layout (`fillItemDetails`), keeping the AC and max HP shown unchanged. Fields added to bundled items later (weapon stats) are filled once per `ITEM_DATA_VERSION` by `fillItemData`; bump it and extend that function when items gain new copied fields. Mutate a `Character` draft in place. Tested in `rules.test.ts`.
- `src/lib/rules/attacks.ts` — attacks with equipped weapons plus an unarmed strike (ability choice incl. finesse, Martial Arts, Hex Warrior, Battle Ready; proficiency; magic bonuses; fighting styles), Extra Attack counts, and table notes (Sneak Attack, Rage, smites, critical range, off-hand). Worked out in the view, not stored. `proficiency.ts` (class/subclass/race weapon proficiencies plus `weaponProficiencies`), `senses.ts` (race/class senses plus `senses`), `xp.ts` (XP table, hit points per level, `levelUp`). The Defense fighting style is applied in `stats.ts` AC.
- `src/lib/session.svelte.ts` — the open character. All changes go through `session.mutate(label, fn)`, which copies, applies, saves to IndexedDB and offers Undo via the toast. `session.record` saves bookkeeping without an undo step.
- `src/lib/library.svelte.ts` — spell library (bundled spells + installed packs), spell lookup for a character, spell copies.
- `src/lib/data/` — `classes.ts` (class/subclass keys, saves), `races.ts` (race/subrace keys, dragon ancestry, `raceLabel`), `content.ts` (`loadContent`, `loadItems` and `loadGear` lazy-load the generated JSON; `featureGroups`; `inventoryItem`, `gearInventoryItem`, `unpack`), plus the generated `spells.json`, `classes.json`, `races.json`, `items.json`, `gear.json`.
- Inventory items (`kind: 'magic' | 'gear'`) copy name, type, rarity, attunement, weight and charges from the bundled item when added (so restore links and lists work without loading the JSON); only the description and stats are looked up by `ref` in `items.json` or `gear.json`.
- `src/lib/backup/` — backup file format (`{ app, schemaVersion, character }`), validation/migration in `readBackup`, restore links (`?restore=<deflate+base64url>`, no portrait or spell copies), spell pack files (`packs.ts`), share-sheet saving, and back-up reminders (`reminder.svelte.ts`: Vitals reminds when the player comes back, after 15+ minutes away or a fresh open, to a character left with changes not backed up; browsers can't prompt as the app closes).
- Routes: `/` list, `/new`, `/import` (backups and spell packs), `/packs`, `/c/[id]` (Vitals), `/c/[id]/spells`, `/c/[id]/features`, `/c/[id]/inventory`, `/c/[id]/book`, `/c/[id]/edit`.

When the `Character` shape changes, give new fields defaults in `readBackup` (and a Dexie upgrade) so old backups still import. Bump `SCHEMA_VERSION` only for changes older apps can't read.

## Deploy

`.github/workflows/deploy.yml` tests, builds and publishes to GitHub Pages on every push to `main`.

## Commands

```bash
npm run data         # Regenerate bundled game data from 5etools (alias: npm run spells)
npm run dev          # Dev server on localhost
npm run dev:phone    # Dev server on the LAN, open http://<laptop-ip>:5173 on a phone
npm run build        # Static site in build/
npm run preview      # Serve the build on the LAN
npm run check        # svelte-check
npm test             # Vitest
```
