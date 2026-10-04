import type { Page } from '@playwright/test';
import { type App, getApps, initializeApp } from 'firebase-admin/app';
import { type Auth, getAuth, type TenantAwareAuth } from 'firebase-admin/auth';
import { type Database, getDatabase } from 'firebase-admin/database';
import {
  type DocumentData,
  type Firestore,
  getFirestore,
} from 'firebase-admin/firestore';
import {
  applyEmulatorHosts,
  assertEmulatorOrAllowed,
  type FirebaseService,
  getEmulatorHost,
  getProjectIdFromEnv,
  skipMetadataServerDetection,
} from './env';
import { callFirestore } from './firestore';
import {
  authUserKey,
  authUserKeyPrefix,
  type IdTokenResponse,
  persistedUserFromTokens,
  signInWithCustomToken,
  signInWithPassword,
  writeAuthStorageForApp,
} from './login';
import { callRtdb } from './rtdb';
import type {
  FirestoreBatchOperation,
  FirestoreQueryOptions,
  FirestoreSetOptions,
  LoginOptions,
  LogoutOptions,
  PlaywrightFirebaseConfig,
  RtdbQueryOptions,
} from './types';

const DEFAULT_APP_NAME = 'playwright-firebase';

/**
 * Firebase helpers for Playwright tests. Runs in the test runner (Node), so
 * firebase-admin is called directly; login writes real tokens into the
 * browser page's Firebase Auth persistence.
 */
export class PlaywrightFirebase {
  private readonly config: PlaywrightFirebaseConfig;
  private adminApp?: App;
  private ownsApp = false;
  private readonly checkedServices = new Set<FirebaseService>();

  constructor(config: PlaywrightFirebaseConfig = {}) {
    this.config = config;
    applyEmulatorHosts(config.emulators);
    if (!config.app && !config.appOptions?.credential) {
      skipMetadataServerDetection();
    }
  }

  /**
   * firebase-admin app (initialized on first use)
   */
  get app(): App {
    if (!this.adminApp) {
      this.adminApp = this.config.app || this.initializeAdminApp();
    }
    return this.adminApp;
  }

  /**
   * Project ID of the firebase-admin app
   */
  get projectId(): string {
    const projectId = this.app.options.projectId || getProjectIdFromEnv();
    if (!projectId) {
      throw new Error(
        'playwright-firebase: no project ID found. Pass appOptions.projectId or set GCLOUD_PROJECT.',
      );
    }
    return projectId;
  }

  /**
   * firebase-admin Firestore instance
   */
  get firestore(): Firestore {
    this.checkService('firestore');
    return getFirestore(this.app);
  }

  /**
   * firebase-admin Auth instance
   */
  get auth(): Auth {
    this.checkService('auth');
    return getAuth(this.app);
  }

  /**
   * firebase-admin Realtime Database instance
   */
  get database(): Database {
    this.checkService('database');
    return getDatabase(this.app);
  }

  /**
   * @param tenantId - ID of the tenant
   * @returns Tenant aware firebase-admin Auth instance
   */
  authForTenant(tenantId: string): TenantAwareAuth {
    return this.auth.tenantManager().authForTenant(tenantId);
  }

  /**
   * Get a document's data (null if missing) or a collection's documents (each
   * including its id)
   */
  callFirestore<T = any>(
    action: 'get',
    path: string,
    options?: FirestoreQueryOptions,
  ): Promise<T>;
  /**
   * Set a document
   */
  callFirestore(
    action: 'set',
    path: string,
    data: DocumentData,
    options?: FirestoreSetOptions,
  ): Promise<void>;
  /**
   * Update a document
   */
  callFirestore(
    action: 'update',
    path: string,
    data: DocumentData,
  ): Promise<void>;
  /**
   * Add a document to a collection
   * @returns ID of the new document
   */
  callFirestore(
    action: 'add',
    path: string,
    data: DocumentData,
  ): Promise<string>;
  /**
   * Delete a document, a collection, or the documents matching a query
   * (including their subcollections)
   */
  callFirestore(
    action: 'delete',
    path: string,
    options?: FirestoreQueryOptions,
  ): Promise<void>;
  /**
   * Run writes as batched writes relative to a base path
   */
  callFirestore(
    action: 'batch',
    basePath: string,
    operations: FirestoreBatchOperation[],
    options?: { batchSize?: number },
  ): Promise<void>;
  callFirestore(
    action: Parameters<typeof callFirestore>[1],
    path: string,
    dataOrOptions?: unknown,
    options?: FirestoreSetOptions & { batchSize?: number },
  ): Promise<any> {
    return callFirestore(this.firestore, action, path, dataOrOptions, options);
  }

  /**
   * Get the value at a path
   */
  callRtdb<T = any>(
    action: 'get',
    path: string,
    options?: RtdbQueryOptions,
  ): Promise<T>;
  /**
   * Push a value to a list
   * @returns Key of the new child
   */
  callRtdb(action: 'push', path: string, data: unknown): Promise<string>;
  /**
   * Set or update the value at a path
   */
  callRtdb(
    action: 'set' | 'update',
    path: string,
    data: unknown,
  ): Promise<void>;
  /**
   * Delete the value at a path
   */
  callRtdb(action: 'delete', path: string): Promise<void>;
  callRtdb(
    action: Parameters<typeof callRtdb>[1],
    path: string,
    dataOrOptions?: unknown,
  ): Promise<any> {
    return callRtdb(this.database, action, path, dataOrOptions);
  }

  /**
   * Sign the page's app in as a user. The user is signed in for real (through
   * the Auth emulator when FIREBASE_AUTH_EMULATOR_HOST is set) and written to
   * the app's Firebase Auth persistence, so the app needs no test code.
   * Pass a uid (custom token sign in, user created if missing) or an email
   * and password.
   * @param page - Playwright page
   * @param options - Who to sign in as and where to go afterwards
   * @param baseURL - Base URL of the app (the fixtures pass Playwright's baseURL)
   * @returns UID of the signed in user
   */
  async login(
    page: Page,
    options: LoginOptions = {},
    baseURL?: string,
  ): Promise<string> {
    const apiKey = this.config.apiKey || process.env.FIREBASE_API_KEY;
    if (!apiKey) {
      throw new Error(
        'playwright-firebase: an apiKey (the client app\'s Firebase web API key) is required to login. Pass "apiKey" or set FIREBASE_API_KEY.',
      );
    }
    this.checkService('auth');
    const tokens = await this.signIn(apiKey, options);
    const appName = this.config.clientAppName || '[DEFAULT]';
    const user = await persistedUserFromTokens(apiKey, appName, tokens);
    await writeAuthStorageForApp(
      page,
      {
        persistence: this.config.persistence || 'indexedDB',
        key: authUserKey(apiKey, appName),
        value: user,
      },
      baseURL,
      options.url,
    );
    return user.uid;
  }

  /**
   * Sign the page's app out by clearing its Firebase Auth persistence
   * @param page - Playwright page
   * @param options - Where to go afterwards
   * @param baseURL - Base URL of the app
   */
  async logout(
    page: Page,
    options: LogoutOptions = {},
    baseURL?: string,
  ): Promise<void> {
    await writeAuthStorageForApp(
      page,
      {
        persistence: this.config.persistence || 'indexedDB',
        key: authUserKeyPrefix,
        value: null,
      },
      baseURL,
      options.url,
    );
  }

  /**
   * Delete all documents in the Firestore emulator
   */
  async clearFirestore(): Promise<void> {
    await this.clearEmulator(
      'firestore',
      `/emulator/v1/projects/${this.projectId}/databases/(default)/documents`,
    );
  }

  /**
   * Delete all users in the Auth emulator
   */
  async clearAuth(): Promise<void> {
    await this.clearEmulator(
      'auth',
      `/emulator/v1/projects/${this.projectId}/accounts`,
    );
  }

  /**
   * Delete all data in the Realtime Database emulator
   */
  async clearDatabase(): Promise<void> {
    this.requireEmulator('database');
    await this.database.ref('/').remove();
  }

  /**
   * Delete the firebase-admin app if it was created by this instance
   */
  async cleanup(): Promise<void> {
    if (this.adminApp && this.ownsApp) {
      const { deleteApp } = await import('firebase-admin/app');
      await deleteApp(this.adminApp);
    }
    this.adminApp = undefined;
    this.ownsApp = false;
  }

  private async signIn(
    apiKey: string,
    options: LoginOptions,
  ): Promise<IdTokenResponse> {
    if ('email' in options && options.email) {
      return signInWithPassword(
        apiKey,
        options.email,
        options.password,
        options.tenantId,
      );
    }
    const uidOptions = options as Exclude<LoginOptions, { email: string }>;
    const uid = uidOptions.uid || process.env.TEST_UID;
    if (!uid) {
      throw new Error(
        'playwright-firebase: pass a uid (or email and password) to login, or set TEST_UID.',
      );
    }
    const auth = uidOptions.tenantId
      ? this.authForTenant(uidOptions.tenantId)
      : this.auth;
    const token = await auth.createCustomToken(uid, uidOptions.customClaims);
    return signInWithCustomToken(apiKey, token, uidOptions.tenantId);
  }

  private initializeAdminApp(): App {
    const existing = getApps().find((app) => app.name === DEFAULT_APP_NAME);
    if (existing) {
      return existing;
    }
    const appOptions = { ...this.config.appOptions };
    appOptions.projectId = appOptions.projectId || getProjectIdFromEnv();
    if (!appOptions.projectId) {
      throw new Error(
        'playwright-firebase: no project ID found. Pass appOptions.projectId or set GCLOUD_PROJECT.',
      );
    }
    if (!appOptions.databaseURL) {
      appOptions.databaseURL = `https://${appOptions.projectId}-default-rtdb.firebaseio.com`;
    }
    this.ownsApp = true;
    return initializeApp(appOptions, DEFAULT_APP_NAME);
  }

  private checkService(service: FirebaseService): void {
    if (!this.checkedServices.has(service)) {
      assertEmulatorOrAllowed(service, this.config.protectProduction);
      this.checkedServices.add(service);
    }
  }

  private requireEmulator(service: FirebaseService): string {
    const host = getEmulatorHost(service);
    if (!host) {
      throw new Error(
        `playwright-firebase: clearing ${service} is only supported with the ${service} emulator.`,
      );
    }
    return host;
  }

  private async clearEmulator(
    service: FirebaseService,
    path: string,
  ): Promise<void> {
    const host = this.requireEmulator(service);
    const response = await fetch(`http://${host}${path}`, {
      method: 'DELETE',
    });
    if (!response.ok) {
      throw new Error(
        `playwright-firebase: clearing the ${service} emulator failed with HTTP ${response.status}.`,
      );
    }
  }
}
