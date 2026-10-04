import {
  test as baseTest,
  type Fixtures,
  type PlaywrightTestArgs,
  type PlaywrightTestOptions,
  type PlaywrightWorkerArgs,
  type PlaywrightWorkerOptions,
  type TestType,
} from '@playwright/test';
import { PlaywrightFirebase } from './PlaywrightFirebase';
import type {
  LoginOptions,
  LogoutOptions,
  PlaywrightFirebaseConfig,
} from './types';

export interface FirebaseTestFixtures {
  /**
   * Sign the page's app in (see PlaywrightFirebase#login)
   * @returns UID of the signed in user
   */
  login: (options?: LoginOptions) => Promise<string>;
  /**
   * Sign the page's app out (see PlaywrightFirebase#logout)
   */
  logout: (options?: LogoutOptions) => Promise<void>;
}

export interface FirebaseWorkerFixtures {
  /**
   * Config for playwright-firebase. Can be set with `use: { firebaseConfig }`
   * in playwright.config or test.use().
   */
  firebaseConfig: PlaywrightFirebaseConfig;
  /**
   * Firebase helpers shared by every test in the worker (also available in
   * beforeAll/afterAll hooks)
   */
  firebase: PlaywrightFirebase;
}

/**
 * Firebase fixtures, for use with test.extend() when composing your own test
 * @param config - Default playwright-firebase config
 * @returns Fixtures defining firebaseConfig, firebase, login and logout
 */
export function firebaseFixtures(
  config: PlaywrightFirebaseConfig = {},
): Fixtures<
  FirebaseTestFixtures,
  FirebaseWorkerFixtures,
  PlaywrightTestArgs & PlaywrightTestOptions,
  PlaywrightWorkerArgs & PlaywrightWorkerOptions
> {
  return {
    firebaseConfig: [config, { scope: 'worker', option: true }],
    firebase: [
      async ({ firebaseConfig }, use) => {
        const firebase = new PlaywrightFirebase(firebaseConfig);
        await use(firebase);
        await firebase.cleanup();
      },
      { scope: 'worker' },
    ],
    login: async ({ page, baseURL, firebase }, use) => {
      await use((options) => firebase.login(page, options, baseURL));
    },
    logout: async ({ page, baseURL, firebase }, use) => {
      await use((options) => firebase.logout(page, options, baseURL));
    },
  };
}

/**
 * Extend a Playwright test with Firebase fixtures: "firebase" (worker
 * scoped helpers), "login" and "logout" (bound to the test's page).
 * @param base - Test to extend (usually test from @playwright/test)
 * @param config - Default playwright-firebase config
 * @returns Extended test
 */
export function withFirebase<
  T extends PlaywrightTestArgs & PlaywrightTestOptions,
  W extends PlaywrightWorkerArgs & PlaywrightWorkerOptions,
>(
  base: TestType<T, W>,
  config: PlaywrightFirebaseConfig = {},
): TestType<T & FirebaseTestFixtures, W & FirebaseWorkerFixtures> {
  // Fixtures only depend on Playwright's built-in fixtures, which T and W
  // always include
  return base.extend<FirebaseTestFixtures, FirebaseWorkerFixtures>(
    firebaseFixtures(config) as Fixtures<
      FirebaseTestFixtures,
      FirebaseWorkerFixtures,
      T,
      W
    >,
  );
}

/**
 * Playwright test with Firebase fixtures. Configure it with
 * `use: { firebaseConfig: { ... } }` in playwright.config.
 */
export const test = withFirebase(baseTest);
