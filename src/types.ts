import type { App, AppOptions } from 'firebase-admin/app';
import type * as firestore from 'firebase-admin/firestore';

/**
 * How to react when a Firebase service is used without its emulator
 * configured: "none" allows it silently, "warn" logs a warning and "error"
 * throws before the service is touched.
 */
export type ProtectionLevel = 'none' | 'warn' | 'error';

/**
 * Per-service production protection. Each service is checked the first time
 * it is used, so services your tests never touch never cause an error.
 */
export interface ProtectProduction {
  auth?: ProtectionLevel;
  firestore?: ProtectionLevel;
  database?: ProtectionLevel;
}

/**
 * Emulator hosts ("host:port"). Each value is copied into the environment
 * variable firebase-admin reads (FIREBASE_AUTH_EMULATOR_HOST,
 * FIRESTORE_EMULATOR_HOST, FIREBASE_DATABASE_EMULATOR_HOST) unless that
 * variable is already set.
 */
export interface EmulatorHosts {
  auth?: string;
  firestore?: string;
  database?: string;
}

/**
 * Where the Firebase JS SDK in the app under test persists the signed in
 * user. "indexedDB" is the default for getAuth(); use "localStorage" if the
 * app uses browserLocalPersistence.
 */
export type AuthPersistence = 'indexedDB' | 'localStorage';

export interface PlaywrightFirebaseConfig {
  /**
   * Existing firebase-admin App to use. When omitted, an app named
   * "playwright-firebase" is initialized from appOptions and the environment.
   */
  app?: App;
  /**
   * Options used to initialize the firebase-admin app (ignored when app is
   * passed). projectId defaults to GCLOUD_PROJECT / GOOGLE_CLOUD_PROJECT /
   * FIREBASE_PROJECT_ID.
   */
  appOptions?: AppOptions;
  /**
   * Web API key of the app under test (the apiKey in its Firebase config).
   * Required for login. Defaults to the FIREBASE_API_KEY env variable.
   */
  apiKey?: string;
  /**
   * Name of the client Firebase app in the page. Defaults to "[DEFAULT]".
   */
  clientAppName?: string;
  /**
   * Auth persistence used by the app under test. Defaults to "indexedDB".
   */
  persistence?: AuthPersistence;
  /**
   * Emulator hosts to use.
   */
  emulators?: EmulatorHosts;
  /**
   * Production protection per service. Defaults to "error" for every
   * service, so tests never write to a real project by accident.
   */
  protectProduction?: ProtectProduction;
}

export type WhereOptions = [string, firestore.WhereFilterOp, unknown];

export interface FirestoreQueryOptions {
  /**
   * Where clause or list of where clauses
   */
  where?: WhereOptions | WhereOptions[];
  /**
   * Field to order by, or [field, direction]
   */
  orderBy?: string | [string, firestore.OrderByDirection];
  limit?: number;
  limitToLast?: number;
}

export interface FirestoreSetOptions {
  merge?: boolean;
}

/**
 * Document returned from a Firestore get, including its id
 */
export type FirestoreDoc<T = firestore.DocumentData> = T & { id: string };

/**
 * A single write within a callFirestore "batch" action
 */
export interface FirestoreBatchOperation {
  action: 'set' | 'add' | 'update' | 'delete';
  /**
   * Path relative to the batch's base path. Document path for set, update
   * and delete; collection path for add (defaults to the base path).
   */
  path?: string;
  /**
   * Data to write (required for set, add and update)
   */
  data?: firestore.DocumentData;
  options?: FirestoreSetOptions;
}

export interface RtdbQueryOptions {
  orderByChild?: string;
  orderByKey?: boolean;
  orderByValue?: boolean;
  equalTo?: number | string | boolean | null;
  startAt?: number | string | boolean | null;
  startAfter?: number | string | boolean | null;
  endAt?: number | string | boolean | null;
  endBefore?: number | string | boolean | null;
  limitToFirst?: number;
  limitToLast?: number;
}

export interface LoginWithUidOptions {
  /**
   * UID of the user to sign in as. Defaults to the TEST_UID env variable.
   * The user is created by the Auth emulator if it does not exist.
   */
  uid?: string;
  /**
   * Custom claims to include in the custom token
   */
  customClaims?: Record<string, unknown>;
  tenantId?: string;
}

export interface LoginWithPasswordOptions {
  email: string;
  password: string;
  tenantId?: string;
}

export type LoginOptions = (LoginWithUidOptions | LoginWithPasswordOptions) & {
  /**
   * URL to open once the user is persisted (resolved against baseURL). When
   * omitted, a page already on the app is reloaded so it picks up the user;
   * otherwise the page is left on about:blank, ready for page.goto().
   */
  url?: string;
};

export interface LogoutOptions {
  /**
   * URL to open once the user is cleared. When omitted, a page already on
   * the app is reloaded.
   */
  url?: string;
}
