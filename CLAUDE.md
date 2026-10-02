# CLAUDE.md

Guidance for Claude Code when working in this repository.

## Project Overview

D&D 5e (2014) **player** tracker: a phone-first web app each player uses at the table for their own character. Sister project to `../5e-combat-tracker` (the DM's tool) but fully standalone: no sync, no backend, each phone keeps its own data.

Tracks: name, portrait, AC, HP (current/max), temp HP, death saves, spell slots (incl. warlock pact slots and Mystic Arcanum), sorcery points with Font of Magic and metamagic, known/prepared spells, concentration.

## Tech Stack

- Svelte 5 (runes) + SvelteKit, `adapter-static` with **hash routing** (`router.type: 'hash'`), so the build is a single `index.html` that works on any static host. Hash routing ignores `+page.ts`/`+layout.ts` page options; don't add them. For a subfolder host set `BASE_PATH` at build time (the GitHub Pages workflow does this).
- TypeScript, Dexie.js over IndexedDB (`pc-tracker` database, `characters` table)
- Vitest for rules and backup tests
- Service worker (`src/service-worker.ts`) caches the app for offline use; web manifest + icons in `static/`
- Theme tokens in `src/app.css` are shared with the combat tracker; all colours come from tokens

## Game data

`npm run data` (alias `npm run spells`) regenerates the bundled JSON in `src/lib/data/` from a local 5etools checkout (`../5etools-2014-src`, override with `FIVETOOLS_DIR`): `spells.json` (all PHB/XGE/TCE spells), with classes and races JSON to come from the same script. The output is committed and shipped publicly, by the owner's choice.

Spell packs (`.spellpack.json`, stored in the `spellPacks` table) are for extra spells players import on their own phone. Characters keep a `spellCache` copy of pack spells they use, so backups restore on phones without the pack. Lookup order: installed library (bundled spells, overridden by packs with the same id) → custom spells → cache.

## Architecture

- `src/lib/rules/` — pure 5e rules (slot tables, HP/temp/death saves, sorcery points, rests). Mutate a `Character` draft in place. Tested in `rules.test.ts`.
- `src/lib/session.svelte.ts` — the open character. All changes go through `session.mutate(label, fn)`, which copies, applies, saves to IndexedDB and offers Undo via the toast. `session.record` saves bookkeeping without an undo step.
- `src/lib/library.svelte.ts` — spell library (SRD + installed packs), spell lookup for a character, spell copies.
- `src/lib/backup/` — backup file format (`{ app, schemaVersion, character }`), validation/migration in `readBackup`, restore links (`?restore=<deflate+base64url>`, no portrait or spell copies), spell pack files (`packs.ts`), share-sheet saving.
- Routes: `/` list, `/new`, `/import` (backups and spell packs), `/packs`, `/c/[id]` (Vitals), `/c/[id]/spells`, `/c/[id]/book`, `/c/[id]/edit`.

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
