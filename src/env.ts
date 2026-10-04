import type {
  EmulatorHosts,
  ProtectionLevel,
  ProtectProduction,
} from './types';

export type FirebaseService = keyof ProtectProduction;

const emulatorEnvVars: Record<FirebaseService, string> = {
  auth: 'FIREBASE_AUTH_EMULATOR_HOST',
  firestore: 'FIRESTORE_EMULATOR_HOST',
  database: 'FIREBASE_DATABASE_EMULATOR_HOST',
};

/**
 * Copy emulator hosts into the environment variables firebase-admin reads,
 * without overriding variables which are already set.
 * @param emulators - Emulator hosts
 */
export function applyEmulatorHosts(emulators?: EmulatorHosts): void {
  if (!emulators) {
    return;
  }
  for (const service of Object.keys(emulatorEnvVars) as FirebaseService[]) {
    const host = emulators[service];
    const envVar = emulatorEnvVars[service];
    if (host && !process.env[envVar]) {
      process.env[envVar] = host;
    }
  }
}

/**
 * @param service - Firebase service
 * @returns Emulator host for the service from the environment, if set
 */
export function getEmulatorHost(service: FirebaseService): string | undefined {
  return process.env[emulatorEnvVars[service]] || undefined;
}

/**
 * @returns Project ID from common environment variables, if set
 */
export function getProjectIdFromEnv(): string | undefined {
  return (
    process.env.GCLOUD_PROJECT ||
    process.env.GOOGLE_CLOUD_PROJECT ||
    process.env.FIREBASE_PROJECT_ID ||
    undefined
  );
}

/**
 * Throw or warn when a service is used without its emulator configured
 * @param service - Firebase service about to be used
 * @param protectProduction - Protection settings
 */
export function assertEmulatorOrAllowed(
  service: FirebaseService,
  protectProduction?: ProtectProduction,
): void {
  if (getEmulatorHost(service)) {
    return;
  }
  const level: ProtectionLevel = protectProduction?.[service] || 'error';
  if (level === 'none') {
    return;
  }
  const envVar = emulatorEnvVars[service];
  const message = `playwright-firebase: ${envVar} is not set, so ${service} operations would run against a real Firebase project. Set ${envVar} (or the "emulators.${service}" option), or set "protectProduction.${service}" to "warn" or "none" to allow it.`;
  if (level === 'error') {
    throw new Error(message);
  }
  // biome-ignore lint/suspicious/noConsole: Intentional logging
  console.warn(message);
}

/**
 * When Firestore runs against its emulator, firebase-admin still probes the
 * GCE metadata server for credentials, which takes seconds outside Google
 * Cloud. Skip the probe unless the user already configured detection.
 */
export function skipMetadataServerDetection(): void {
  if (getEmulatorHost('firestore') && !process.env.METADATA_SERVER_DETECTION) {
    process.env.METADATA_SERVER_DETECTION = 'none';
  }
}
