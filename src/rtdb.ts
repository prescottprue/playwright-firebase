import type * as database from 'firebase-admin/database';
import type { RtdbQueryOptions } from './types';

export type RtdbAction = 'get' | 'set' | 'update' | 'push' | 'delete';

const queryMethods = [
  'orderByChild',
  'orderByKey',
  'orderByValue',
  'equalTo',
  'startAt',
  'startAfter',
  'endAt',
  'endBefore',
  'limitToFirst',
  'limitToLast',
] as const;

const noArgMethods = new Set(['orderByKey', 'orderByValue']);

/**
 * Apply query options to a reference
 * @param ref - Base reference
 * @param options - Query options
 * @returns Reference or query
 */
export function applyRtdbQuery(
  ref: database.Reference,
  options?: RtdbQueryOptions,
): database.Query {
  let query: database.Query = ref;
  if (!options) {
    return query;
  }
  for (const method of queryMethods) {
    const value = options[method];
    if (value === undefined || value === false) {
      continue;
    }
    query = noArgMethods.has(method)
      ? (query as any)[method]()
      : (query as any)[method](value);
  }
  return query;
}

/**
 * Run a Realtime Database action at a path
 * @param db - Database instance
 * @param action - Action to run
 * @param path - Path in the database ("/" for the root)
 * @param dataOrOptions - Data for writes, query options for get
 * @returns Value for get, new key for push, otherwise undefined
 */
export async function callRtdb(
  db: database.Database,
  action: RtdbAction,
  path: string,
  dataOrOptions?: unknown,
): Promise<unknown> {
  if (!path) {
    throw new Error(
      `A path is required to run RTDB "${action}". Use "/" for the root.`,
    );
  }
  const ref = db.ref(path);
  switch (action) {
    case 'get': {
      const snap = await applyRtdbQuery(
        ref,
        dataOrOptions as RtdbQueryOptions,
      ).once('value');
      return snap.val();
    }
    case 'set':
      await ref.set(dataOrOptions);
      return undefined;
    case 'update':
      await ref.update(dataOrOptions as object);
      return undefined;
    case 'push': {
      const pushRef = ref.push();
      await pushRef.set(dataOrOptions);
      return pushRef.key;
    }
    case 'delete':
      await ref.remove();
      return undefined;
    default:
      throw new Error(`Unsupported RTDB action "${action}".`);
  }
}
