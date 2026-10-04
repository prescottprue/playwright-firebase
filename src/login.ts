import type { Page } from '@playwright/test';
import { getEmulatorHost } from './env';
import type { AuthPersistence } from './types';

/**
 * Prefix of the key the Firebase JS SDK persists the current user under
 * ("firebase:authUser:<apiKey>:<appName>")
 */
const AUTH_USER_KEY_PREFIX = 'firebase:authUser:';

/**
 * Tokens returned by the Identity Toolkit sign in endpoints
 */
export interface IdTokenResponse {
  idToken: string;
  refreshToken: string;
  expiresIn: string;
  localId: string;
}

/**
 * User as returned by the Identity Toolkit accounts:lookup endpoint
 */
interface AccountInfo {
  localId: string;
  email?: string;
  emailVerified?: boolean;
  displayName?: string;
  photoUrl?: string;
  phoneNumber?: string;
  tenantId?: string;
  createdAt?: string;
  lastLoginAt?: string;
  providerUserInfo?: {
    providerId: string;
    rawId?: string;
    federatedId?: string;
    email?: string;
    displayName?: string;
    photoUrl?: string;
    phoneNumber?: string;
  }[];
}

/**
 * User in the shape the Firebase JS SDK persists it (UserImpl#toJSON)
 */
export interface PersistedUser {
  uid: string;
  email?: string;
  emailVerified: boolean;
  displayName?: string;
  isAnonymous: boolean;
  photoURL?: string;
  phoneNumber?: string;
  tenantId?: string;
  providerData: {
    providerId: string;
    uid: string;
    displayName: string | null;
    email: string | null;
    phoneNumber: string | null;
    photoURL: string | null;
  }[];
  stsTokenManager: {
    refreshToken: string;
    accessToken: string;
    expirationTime: number;
  };
  createdAt?: string;
  lastLoginAt?: string;
  apiKey: string;
  appName: string;
}

/**
 * @returns Base URL of the Identity Toolkit API, pointed at the Auth emulator
 * when FIREBASE_AUTH_EMULATOR_HOST is set
 */
function identityToolkitBaseUrl(): string {
  const emulatorHost = getEmulatorHost('auth');
  return emulatorHost
    ? `http://${emulatorHost}/identitytoolkit.googleapis.com/v1`
    : 'https://identitytoolkit.googleapis.com/v1';
}

/**
 * Call an Identity Toolkit endpoint
 * @param endpoint - Endpoint such as "accounts:signInWithCustomToken"
 * @param apiKey - Web API key
 * @param body - Request body
 * @returns Parsed response
 */
async function callIdentityToolkit<T>(
  endpoint: string,
  apiKey: string,
  body: Record<string, unknown>,
): Promise<T> {
  const response = await fetch(
    `${identityToolkitBaseUrl()}/${endpoint}?key=${encodeURIComponent(apiKey)}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    },
  );
  const json: any = await response.json().catch(() => ({}));
  if (!response.ok) {
    const code: string = json?.error?.message || `HTTP ${response.status}`;
    const hint = code.startsWith('INVALID_CUSTOM_TOKEN')
      ? ' The custom token was likely created by firebase-admin pointed at a different Auth instance than the one signing in (check FIREBASE_AUTH_EMULATOR_HOST is set for the test runner).'
      : '';
    throw new Error(
      `playwright-firebase: ${endpoint} failed with "${code}".${hint}`,
    );
  }
  return json as T;
}

/**
 * Exchange a custom token for ID and refresh tokens
 * @param apiKey - Web API key
 * @param token - Custom token
 * @param tenantId - Optional tenant
 * @returns Tokens
 */
export function signInWithCustomToken(
  apiKey: string,
  token: string,
  tenantId?: string,
): Promise<IdTokenResponse> {
  return callIdentityToolkit('accounts:signInWithCustomToken', apiKey, {
    token,
    tenantId,
    returnSecureToken: true,
  });
}

/**
 * Sign in with email and password to get ID and refresh tokens
 * @param apiKey - Web API key
 * @param email - Email of the user
 * @param password - Password of the user
 * @param tenantId - Optional tenant
 * @returns Tokens
 */
export function signInWithPassword(
  apiKey: string,
  email: string,
  password: string,
  tenantId?: string,
): Promise<IdTokenResponse> {
  return callIdentityToolkit('accounts:signInWithPassword', apiKey, {
    email,
    password,
    tenantId,
    returnSecureToken: true,
  });
}

/**
 * Build the user object the Firebase JS SDK persists from sign in tokens and
 * account info
 * @param tokens - Tokens from sign in
 * @param account - Account info from accounts:lookup
 * @param apiKey - Web API key of the client app
 * @param appName - Name of the client app
 * @param now - Current time in ms (used for token expiration)
 * @returns Persisted user
 */
export function buildPersistedUser(
  tokens: IdTokenResponse,
  account: AccountInfo,
  apiKey: string,
  appName: string,
  now = Date.now(),
): PersistedUser {
  return {
    uid: account.localId,
    email: account.email,
    emailVerified: !!account.emailVerified,
    displayName: account.displayName,
    isAnonymous: false,
    photoURL: account.photoUrl,
    phoneNumber: account.phoneNumber,
    tenantId: account.tenantId,
    providerData: (account.providerUserInfo || []).map((info) => ({
      providerId: info.providerId,
      uid: info.rawId || info.federatedId || '',
      displayName: info.displayName ?? null,
      email: info.email ?? null,
      phoneNumber: info.phoneNumber ?? null,
      photoURL: info.photoUrl ?? null,
    })),
    stsTokenManager: {
      refreshToken: tokens.refreshToken,
      accessToken: tokens.idToken,
      expirationTime: now + Number(tokens.expiresIn) * 1000,
    },
    createdAt: account.createdAt,
    lastLoginAt: account.lastLoginAt,
    apiKey,
    appName,
  };
}

/**
 * Look up the signed in account and build the persisted user
 * @param apiKey - Web API key of the client app
 * @param appName - Name of the client app
 * @param tokens - Tokens from sign in
 * @returns Persisted user
 */
export async function persistedUserFromTokens(
  apiKey: string,
  appName: string,
  tokens: IdTokenResponse,
): Promise<PersistedUser> {
  const { users } = await callIdentityToolkit<{ users?: AccountInfo[] }>(
    'accounts:lookup',
    apiKey,
    { idToken: tokens.idToken },
  );
  if (!users?.[0]) {
    throw new Error(
      `playwright-firebase: user "${tokens.localId}" not found after sign in.`,
    );
  }
  return buildPersistedUser(tokens, users[0], apiKey, appName);
}

/**
 * @param apiKey - Web API key of the client app
 * @param appName - Name of the client app
 * @returns Key the Firebase JS SDK persists the current user under
 */
export function authUserKey(apiKey: string, appName: string): string {
  return `${AUTH_USER_KEY_PREFIX}${apiKey}:${appName}`;
}

interface StorageWrite {
  persistence: AuthPersistence;
  /**
   * Key to write. When value is null, every key starting with this is removed.
   */
  key: string;
  value: PersistedUser | null;
}

/**
 * Write (or clear) the persisted user in the page's storage. Runs in the
 * browser, so it must not reference anything outside its own body.
 * @param write - What to write
 */
async function writeAuthStorage(write: StorageWrite): Promise<void> {
  const { persistence, key, value } = write;
  if (persistence === 'localStorage') {
    if (value) {
      window.localStorage.setItem(key, JSON.stringify(value));
      return;
    }
    for (const storedKey of Object.keys(window.localStorage)) {
      if (storedKey.startsWith(key)) {
        window.localStorage.removeItem(storedKey);
      }
    }
    return;
  }
  // Same database, version and store the Firebase JS SDK uses
  const storeName = 'firebaseLocalStorage';
  const db = await new Promise<IDBDatabase>((resolve, reject) => {
    const request = window.indexedDB.open('firebaseLocalStorageDb', 1);
    request.onupgradeneeded = () => {
      request.result.createObjectStore(storeName, { keyPath: 'fbase_key' });
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
  try {
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(storeName, 'readwrite');
      const store = tx.objectStore(storeName);
      if (value) {
        store.put({ fbase_key: key, value });
      } else {
        const keysRequest = store.getAllKeys();
        keysRequest.onsuccess = () => {
          for (const storedKey of keysRequest.result) {
            if (String(storedKey).startsWith(key)) {
              store.delete(storedKey);
            }
          }
        };
      }
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } finally {
    db.close();
  }
}

/**
 * @param page - Playwright page
 * @param baseURL - Base URL of the app under test
 * @returns Origin of the app under test
 */
function appOrigin(page: Page, baseURL?: string): string {
  if (baseURL) {
    return new URL(baseURL).origin;
  }
  const current = page.url();
  if (/^https?:/.test(current)) {
    return new URL(current).origin;
  }
  throw new Error(
    'playwright-firebase: set "use.baseURL" in your Playwright config (or open the app before logging in) so auth state can be written for the app\'s origin.',
  );
}

/**
 * Write auth storage for the app's origin. Storage is per origin, so when
 * the page is not already on the app, a blank page is served at the app's
 * origin (without loading the app) to write it from.
 * @param page - Playwright page
 * @param write - What to write
 * @param baseURL - Base URL of the app under test
 * @param url - URL to open afterwards
 */
export async function writeAuthStorageForApp(
  page: Page,
  write: StorageWrite,
  baseURL?: string,
  url?: string,
): Promise<void> {
  const origin = appOrigin(page, baseURL);
  const current = page.url();
  const onApp = /^https?:/.test(current) && new URL(current).origin === origin;

  if (onApp) {
    await page.evaluate(writeAuthStorage, write);
    if (url) {
      await page.goto(url);
    } else {
      await page.reload();
    }
    return;
  }

  const bootstrapUrl = `${origin}/__playwright_firebase__`;
  await page.route(bootstrapUrl, (route) =>
    route.fulfill({
      contentType: 'text/html',
      body: '<!doctype html><title>playwright-firebase</title>',
    }),
  );
  try {
    await page.goto(bootstrapUrl);
    await page.evaluate(writeAuthStorage, write);
  } finally {
    await page.unroute(bootstrapUrl);
  }
  await page.goto(url || 'about:blank');
}

export const authUserKeyPrefix = AUTH_USER_KEY_PREFIX;
