# playwright-firebase

Utilities and fixtures to help test Firebase projects with [Playwright](https://playwright.dev). A Playwright counterpart to [cypress-firebase](https://github.com/prescottprue/cypress-firebase).

- **`login` / `logout`**: sign the app under test in as any user, with no test-only code in your app
- **`firebase.callFirestore`**: seed, read and clean up Firestore
- **`firebase.callRtdb`**: seed, read and clean up the Realtime Database
- **`firebase.auth`**: the full firebase-admin Auth API (create users, set custom claims, and so on)
- **`clearFirestore` / `clearDatabase` / `clearAuth`**: reset the emulators
- **Production protection**: refuses to touch a service unless its emulator is configured (opt out per service)

## How it works

Playwright tests run in Node, so unlike cypress-firebase there is no browser/Node split: helpers call [firebase-admin](https://firebase.google.com/docs/admin/setup) directly.

`login` signs a user in for real (a custom token minted by firebase-admin, or an email and password) through the Auth emulator's REST API, then writes the resulting user and tokens into the page's Firebase Auth persistence (IndexedDB by default), in the same shape the Firebase JS SDK stores them. When the app loads, Firebase Auth restores that user as if they had signed in themselves. Tokens are real, so security rules apply and token refresh works.

## Install

```bash
npm i -D playwright-firebase firebase-admin @playwright/test
```

`firebase-admin` (v12+) and `@playwright/test` (v1.40+) are peer dependencies.

## Setup

Configure the fixtures in `playwright.config.ts`:

```ts
import { defineConfig } from '@playwright/test';
import type { FirebaseWorkerFixtures } from 'playwright-firebase';

export default defineConfig<{}, FirebaseWorkerFixtures>({
  use: {
    baseURL: 'http://localhost:5173',
    firebaseConfig: {
      // The web API key from your app's Firebase config (any value works with emulators)
      apiKey: 'demo-api-key',
      appOptions: { projectId: 'demo-my-project' },
      emulators: {
        auth: '127.0.0.1:9099',
        firestore: '127.0.0.1:8080',
        database: '127.0.0.1:9000',
      },
    },
  },
});
```

Then import `test` and `expect` from `playwright-firebase`:

```ts
import { expect, test } from 'playwright-firebase';

test('shows my projects', async ({ page, firebase, login }) => {
  await firebase.callFirestore('set', 'projects/1', { name: 'Alpha', createdBy: 'user-1' });
  await login({ uid: 'user-1', url: '/' });
  await expect(page.getByRole('listitem')).toHaveText(['Alpha']);
});
```

Your app must connect to the same emulators (`connectAuthEmulator`, `connectFirestoreEmulator`, `connectDatabaseEmulator`) when it runs under test. Run the tests inside the emulators with:

```bash
firebase emulators:exec --only auth,firestore,database "playwright test"
```

### Composing with your own fixtures

```ts
import { test as base } from '@playwright/test';
import { withFirebase } from 'playwright-firebase';

export const test = withFirebase(base, { apiKey: 'demo-api-key' });
```

`firebaseFixtures(config)` returns the raw fixtures object if you prefer `base.extend(...)` or `mergeTests`.

## Fixtures

| Fixture | Scope | Description |
| --- | --- | --- |
| `firebase` | worker | `PlaywrightFirebase` instance (also usable in `beforeAll`/`afterAll`) |
| `login(options?)` | test | Signs the test's page in. Resolves with the UID |
| `logout(options?)` | test | Signs the test's page out |
| `firebaseConfig` | worker option | Config passed to `PlaywrightFirebase` |

### `login(options?)`

```ts
await login({ uid: 'user-1' });                                  // custom token (user created if missing)
await login({ uid: 'admin-1', customClaims: { role: 'admin' } }); // with custom claims
await login({ email: 'pat@example.com', password: 'secret123' }); // existing email/password user
await login({ uid: 'user-1', tenantId: 'tenant-a' });             // multi-tenancy
await login({ uid: 'user-1', url: '/dashboard' });                // open a page afterwards
```

`uid` defaults to the `TEST_UID` env variable. Auth state is stored per origin, so:

- If the page is already on the app, the user is written and the page reloads (or opens `url`).
- Otherwise the user is written from a blank page served at `baseURL`'s origin (the app is not loaded), then the page opens `url`, or `about:blank` so you can `page.goto()` yourself.

`logout(options?)` clears the persisted user the same way and accepts the same `url` option.

### Reusing login across tests

Because `login` writes to IndexedDB, it works with Playwright's [authentication setup](https://playwright.dev/docs/auth) pattern:

```ts
setup('authenticate', async ({ page, login }) => {
  await login({ uid: 'user-1', url: '/' });
  await page.context().storageState({ path: 'playwright/.auth/user.json', indexedDB: true });
});
```

## `PlaywrightFirebase`

The `firebase` fixture is an instance of `PlaywrightFirebase`, which you can also create yourself (for example in global setup):

```ts
import { PlaywrightFirebase } from 'playwright-firebase';

const firebase = new PlaywrightFirebase({ appOptions: { projectId: 'demo-my-project' } });
```

### `callFirestore(action, path, dataOrOptions?, options?)`

Data goes straight to firebase-admin, so `FieldValue`, `Timestamp` and `GeoPoint` from `firebase-admin/firestore` work directly.

```ts
await firebase.callFirestore('set', 'projects/1', { name: 'Alpha' });
await firebase.callFirestore('set', 'projects/1', { status: 'done' }, { merge: true });
await firebase.callFirestore('update', 'projects/1', { count: FieldValue.increment(1) });
const id = await firebase.callFirestore('add', 'projects', { name: 'Beta' });

const project = await firebase.callFirestore('get', 'projects/1'); // data or null
const mine = await firebase.callFirestore('get', 'projects', {       // [{ id, ...data }]
  where: ['createdBy', '==', 'user-1'], // or a list of where clauses
  orderBy: ['name', 'desc'],
  limit: 10,
});

await firebase.callFirestore('delete', 'projects/1');   // document and its subcollections
await firebase.callFirestore('delete', 'projects');     // whole collection
await firebase.callFirestore('delete', 'projects', { where: ['createdBy', '==', 'user-1'] });

await firebase.callFirestore('batch', 'projects', [     // batched writes, chunked by 500
  { action: 'set', path: 'a', data: { name: 'A' } },
  { action: 'add', data: { name: 'B' } },
  { action: 'update', path: 'a', data: { done: true } },
  { action: 'delete', path: 'old' },
]);
```

### `callRtdb(action, path, dataOrOptions?)`

```ts
await firebase.callRtdb('set', 'announcement', { message: 'Hi' });
await firebase.callRtdb('update', 'announcement', { message: 'Hello' });
const key = await firebase.callRtdb('push', 'messages', { text: 'Hi' });
const top = await firebase.callRtdb('get', 'scores', { orderByValue: true, limitToLast: 3 });
await firebase.callRtdb('delete', 'messages');
```

Query options: `orderByChild`, `orderByKey`, `orderByValue`, `equalTo`, `startAt`, `startAfter`, `endAt`, `endBefore`, `limitToFirst`, `limitToLast`.

### Admin services

`firebase.app`, `firebase.firestore`, `firebase.database`, `firebase.auth` and `firebase.authForTenant(tenantId)` return the firebase-admin instances, so anything else is one call away:

```ts
await firebase.auth.createUser({ email: 'pat@example.com', password: 'secret123' });
await firebase.auth.setCustomUserClaims('user-1', { role: 'admin' });
```

### Resetting emulators

```ts
await firebase.clearFirestore(); // all documents
await firebase.clearDatabase();  // all RTDB data
await firebase.clearAuth();      // all users
```

These clear the whole project, so with parallel workers prefer data scoped to each test (for example a UID built from `testInfo.testId`) and targeted cleanup.

## Config

| Option | Default | Description |
| --- | --- | --- |
| `apiKey` | `FIREBASE_API_KEY` env | Web API key of the app under test (needed by `login`) |
| `app` | | Existing firebase-admin `App` to use |
| `appOptions` | | Options for the firebase-admin app the library creates. `projectId` defaults to `GCLOUD_PROJECT` / `GOOGLE_CLOUD_PROJECT` / `FIREBASE_PROJECT_ID`; `databaseURL` defaults to `https://<projectId>-default-rtdb.firebaseio.com` |
| `emulators` | | `{ auth, firestore, database }` hosts. Copied into `FIREBASE_AUTH_EMULATOR_HOST`, `FIRESTORE_EMULATOR_HOST` and `FIREBASE_DATABASE_EMULATOR_HOST` unless already set (`firebase emulators:exec` sets them) |
| `protectProduction` | `'error'` for each service | `{ auth, firestore, database }`: `'error'`, `'warn'` or `'none'` when a service is used without its emulator. Checked the first time each service is used |
| `persistence` | `'indexedDB'` | Where the app persists auth: `'indexedDB'` (the `getAuth()` default) or `'localStorage'` (`browserLocalPersistence`) |
| `clientAppName` | `'[DEFAULT]'` | Name of the Firebase app in the page, if not the default app |

## Example

[`examples/basic`](examples/basic) is a Vite + React app using Auth, Firestore and the Realtime Database, with a Playwright suite that exercises every helper:

```bash
npm install
npm run example:test
```

## Development

```bash
npm run build    # tsc -> lib/
npm test         # unit tests inside the auth, firestore and database emulators
npm run check    # biome lint + format check
```

Java is required for the Firestore and Realtime Database emulators.

## License

MIT
