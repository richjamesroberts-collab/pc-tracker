# CLAUDE.md

Guidance for Claude Code when working in this repository.

## Project Overview

D&D 5e (2014) **player** tracker: a phone-first web app each player uses at the table for their own character. Sister project to `../5e-combat-tracker` (the DM's tool) but fully standalone: no sync, no backend, each phone keeps its own data.

Tracks: name, portrait, AC, HP (current/max), temp HP, death saves, spell slots (incl. warlock pact slots and Mystic Arcanum), sorcery points with Font of Magic and metamagic, known/prepared spells, concentration.

## Tech Stack

- Svelte 5 (runes) + SvelteKit, `adapter-static` with **hash routing** (`router.type: 'hash'`), so the build is a single `index.html` that works on any static host or subfolder. Hash routing ignores `+page.ts`/`+layout.ts` page options; don't add them.
- TypeScript, Dexie.js over IndexedDB (`pc-tracker` database, `characters` table)
- Vitest for rules and backup tests
- Service worker (`src/service-worker.ts`) caches the app for offline use; web manifest + icons in `static/`
- Theme tokens in `src/app.css` are shared with the combat tracker; all colours come from tokens

## Spell data (licensing)

`src/lib/data/spells.json` is **generated and gitignored**. `npm run spells` builds it from a local 5etools checkout (`../5etools-2014-src`, override with `FIVETOOLS_DIR`) using PHB, XGE and TCE. It contains copyrighted text: never commit it, and only deploy the built app somewhere private (not a public URL).

## Architecture

- `src/lib/rules/` — pure 5e rules (slot tables, HP/temp/death saves, sorcery points, rests). Mutate a `Character` draft in place. Tested in `rules.test.ts`.
- `src/lib/session.svelte.ts` — the open character. All changes go through `session.mutate(label, fn)`, which copies, applies, saves to IndexedDB and offers Undo via the toast. `session.record` saves bookkeeping without an undo step.
- `src/lib/backup/` — backup file format (`{ app, schemaVersion, character }`), validation/migration in `readBackup`, restore links (`?restore=<deflate+base64url>`, no portrait), share-sheet saving.
- Routes: `/` list, `/new`, `/import`, `/c/[id]` (Vitals), `/c/[id]/spells`, `/c/[id]/book`, `/c/[id]/edit`.

Bump `SCHEMA_VERSION` and extend `readBackup` when the `Character` shape changes, so old backups still import.

## Commands

```bash
npm run spells       # Generate spell data from 5etools (needed before first dev/build)
npm run dev          # Dev server on localhost
npm run dev:phone    # Dev server on the LAN, open http://<laptop-ip>:5173 on a phone
npm run build        # Static site in build/
npm run preview      # Serve the build on the LAN
npm run check        # svelte-check
npm test             # Vitest
```
