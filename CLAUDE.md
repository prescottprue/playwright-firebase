# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

`playwright-firebase` is an npm library of Playwright fixtures and helpers for testing Firebase apps — the Playwright counterpart to `../cypress-firebase`. `firebase-admin` and `@playwright/test` are peer dependencies. npm workspaces: the root is the library, `examples/*` are example apps.

## Commands

```bash
npm run build          # tsc -> lib/ (examples import the built lib/, so rebuild before running them)
npm test               # unit tests (vitest) inside auth/firestore/database emulators
npm run test:base      # unit tests without starting emulators (expects `npm run emulators`)
npm run check          # biome lint + format check (biome check --write to fix)
npm run example:test   # build, then run examples/basic Playwright suite inside emulators
```

Single unit test file: `npx firebase emulators:exec --only auth,firestore,database --project demo-test "npx vitest run test/firestore.spec.ts"`.

Emulator ports are non-default (Auth 9199, Firestore 8180, Database 9100) in both `firebase.json` files and `test/setup.ts` — keep them in sync. `demo-` project IDs are used so emulators need no login.

## Architecture

Unlike cypress-firebase there is no browser/Node task split: Playwright tests run in Node, so helpers call firebase-admin (modular API, v12+) directly and data passes through unconverted.

- `src/PlaywrightFirebase.ts`: main class. Lazily initializes a firebase-admin app named `playwright-firebase` (or uses `config.app`). Service getters (`firestore`, `auth`, `database`) run the production-protection check once per service on first use.
- `src/fixtures.ts`: `firebaseFixtures(config)` / `withFirebase(base, config)` / exported `test`. `firebase` is worker scoped; `login`/`logout` are test scoped and bound to `page` + `baseURL`. `firebaseConfig` is a worker option settable via `use` in playwright.config.
- `src/login.ts`: signs in via Identity Toolkit REST (emulator when `FIREBASE_AUTH_EMULATOR_HOST` is set), looks the account up, builds the object the Firebase JS SDK persists (`UserImpl#toJSON` shape) and writes it to IndexedDB (`firebaseLocalStorageDb` / `firebaseLocalStorage`, key `firebase:authUser:<apiKey>:<appName>`) or localStorage. If the page isn't on the app's origin, it routes a blank bootstrap page at that origin to write from. `writeAuthStorage` runs in the browser via `page.evaluate`, so it must stay self-contained. If the SDK's persistence format changes, this is what breaks.
- `src/firestore.ts`, `src/rtdb.ts`: slash-path action dispatchers (`callFirestore`, `callRtdb`).
- `src/env.ts`: emulator env vars, production protection (default `'error'`), and setting `METADATA_SERVER_DETECTION=none` when the Firestore emulator is used (otherwise firebase-admin spends ~3s probing GCE metadata).

Public API is only what `src/index.ts` exports.

## Conventions

- Biome for lint + format (single quotes, spaces). `console` is a lint error; intentional logging uses `// biome-ignore lint/suspicious/noConsole: Intentional logging`. `examples/` is excluded from Biome (the example uses Vite's oxlint).
- Example e2e tests run fully parallel against shared emulators, so scope data per test (e.g. UID from `testInfo.testId`) instead of clearing whole emulators.
