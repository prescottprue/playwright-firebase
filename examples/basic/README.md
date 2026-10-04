# playwright-firebase basic example

A Vite + React app (created with `npm create vite@latest -- --template react`) using Firebase Auth, Firestore and the Realtime Database, tested with Playwright and `playwright-firebase`.

The app lets a signed in user list and create their projects (Firestore, protected by [security rules](firestore.rules)) and shows an announcement from the Realtime Database. It has no test-only code: `login` works by writing the signed in user into Firebase Auth's own persistence.

## Run the tests

From the repository root (builds the library first):

```bash
npm install
npm run example:test
```

Or from this directory, after `npm run build` in the root:

```bash
npm run test:e2e
```

`test:e2e` starts the emulators with `firebase emulators:exec` and runs `playwright test`, which starts Vite in `test` mode (`.env.test` points the app at the emulators).

For interactive development, run the emulators and Playwright's UI separately:

```bash
npm run emulators
npm run test:e2e:ui
```

The project ID starts with `demo-`, so the emulators never need a login and nothing can reach a real Firebase project. Emulator ports (Auth 9199, Firestore 8180, Database 9100, UI 4000) are set in [`firebase.json`](firebase.json).

## Tests

- [`e2e/auth.spec.ts`](e2e/auth.spec.ts): `login` by UID or email/password, before the app loads and while it is open, UI sign in with a user created by firebase-admin, and `logout`
- [`e2e/data.spec.ts`](e2e/data.spec.ts): seeding Firestore with a batch, asserting UI writes with `callFirestore('get')`, and live Realtime Database updates with `callRtdb`
