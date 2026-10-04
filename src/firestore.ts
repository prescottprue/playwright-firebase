import type * as firestore from 'firebase-admin/firestore';
import type {
  FirestoreBatchOperation,
  FirestoreDoc,
  FirestoreQueryOptions,
  FirestoreSetOptions,
  WhereOptions,
} from './types';

export type FirestoreAction =
  | 'get'
  | 'set'
  | 'add'
  | 'update'
  | 'delete'
  | 'batch';

/**
 * @param slashPath - Slash separated path
 * @returns Path without leading or trailing slashes
 */
function trimSlashes(slashPath: string): string {
  return slashPath.replace(/^\/+|\/+$/g, '');
}

/**
 * Check whether a slash path points to a document (even number of segments)
 * @param slashPath - Path to check
 * @returns Whether the path is a document path
 */
export function isDocPath(slashPath: string): boolean {
  return trimSlashes(slashPath).split('/').length % 2 === 0;
}

/**
 * @param options - Query options
 * @returns Whether any query option is set
 */
function hasQueryOptions(options?: FirestoreQueryOptions): boolean {
  return !!(
    options &&
    (options.where || options.orderBy || options.limit || options.limitToLast)
  );
}

/**
 * Build a collection query from query options
 * @param db - Firestore instance
 * @param collectionPath - Path of the collection
 * @param options - Query options
 * @returns Collection reference or query
 */
export function buildQuery(
  db: firestore.Firestore,
  collectionPath: string,
  options?: FirestoreQueryOptions,
): firestore.Query {
  let query: firestore.Query = db.collection(trimSlashes(collectionPath));
  if (!options) {
    return query;
  }
  if (options.where) {
    const whereClauses = (
      Array.isArray(options.where[0]) ? options.where : [options.where]
    ) as WhereOptions[];
    for (const [field, op, value] of whereClauses) {
      query = query.where(field, op, value);
    }
  }
  if (options.orderBy) {
    query = Array.isArray(options.orderBy)
      ? query.orderBy(...options.orderBy)
      : query.orderBy(options.orderBy);
  }
  if (options.limit) {
    query = query.limit(options.limit);
  }
  if (options.limitToLast) {
    query = query.limitToLast(options.limitToLast);
  }
  return query;
}

/**
 * Get a document (data or null) or a collection/query (array of documents
 * including their ids)
 * @param db - Firestore instance
 * @param path - Document or collection path
 * @param options - Query options (collections only)
 * @returns Document data, null if the document is missing, or list of documents
 */
export async function firestoreGet(
  db: firestore.Firestore,
  path: string,
  options?: FirestoreQueryOptions,
): Promise<firestore.DocumentData | FirestoreDoc[] | null> {
  if (isDocPath(path)) {
    const snap = await db.doc(trimSlashes(path)).get();
    return snap.exists ? (snap.data() as firestore.DocumentData) : null;
  }
  const snap = await buildQuery(db, path, options).get();
  return snap.docs.map((docSnap) => ({ ...docSnap.data(), id: docSnap.id }));
}

/**
 * Delete a document, or every document in a collection/query. Subcollections
 * of deleted documents are deleted too.
 * @param db - Firestore instance
 * @param path - Document or collection path
 * @param options - Query options limiting which documents are deleted
 */
export async function firestoreDelete(
  db: firestore.Firestore,
  path: string,
  options?: FirestoreQueryOptions,
): Promise<void> {
  if (isDocPath(path)) {
    await db.recursiveDelete(db.doc(trimSlashes(path)));
    return;
  }
  if (!hasQueryOptions(options)) {
    await db.recursiveDelete(db.collection(trimSlashes(path)));
    return;
  }
  const snap = await buildQuery(db, path, options).get();
  const writer = db.bulkWriter();
  await Promise.all(
    snap.docs.map((docSnap) => db.recursiveDelete(docSnap.ref, writer)),
  );
  await writer.close();
}

/**
 * Run writes as batched writes, committing in chunks so large seeds do not
 * exceed the per-batch write limit. Every operation is validated before any
 * chunk is committed.
 * @param db - Firestore instance
 * @param basePath - Path prepended to each operation's path
 * @param operations - Writes to run
 * @param batchSize - Number of writes per commit
 */
export async function firestoreBatch(
  db: firestore.Firestore,
  basePath: string,
  operations: FirestoreBatchOperation[],
  batchSize = 500,
): Promise<void> {
  if (!Array.isArray(operations)) {
    throw new Error('An array of operations is required for a batch.');
  }
  const batches: firestore.WriteBatch[] = [];
  operations.forEach((operation, index) => {
    if (index % batchSize === 0) {
      batches.push(db.batch());
    }
    const batch = batches[batches.length - 1];
    const { action, data } = operation;
    const opPath = trimSlashes(
      [basePath, operation.path].filter(Boolean).join('/'),
    );
    if (!opPath) {
      throw new Error(`Batch operation ${index} is missing a path.`);
    }
    if (action === 'delete') {
      batch.delete(db.doc(opPath));
      return;
    }
    if (!['set', 'add', 'update'].includes(action)) {
      throw new Error(
        `Batch operation ${index} has unsupported action "${action}". Use set, add, update or delete.`,
      );
    }
    if (!data) {
      throw new Error(`Batch operation ${index} (${action}) requires data.`);
    }
    if (action === 'add') {
      batch.set(db.collection(opPath).doc(), data);
    } else if (action === 'update') {
      batch.update(db.doc(opPath), data);
    } else {
      batch.set(db.doc(opPath), data, { merge: !!operation.options?.merge });
    }
  });
  // Commit sequentially to avoid overwhelming the backend
  for (const batch of batches) {
    await batch.commit();
  }
}

/**
 * Run a Firestore action at a slash path. Data is passed straight to
 * firebase-admin, so FieldValue, Timestamp and GeoPoint values from
 * firebase-admin/firestore can be used directly.
 * @param db - Firestore instance
 * @param action - Action to run
 * @param path - Document or collection path
 * @param dataOrOptions - Data for writes, query options for get and delete,
 * operations for batch
 * @param options - Set options (set) or batch size (batch)
 * @returns Result of the action: data for get, new document id for add,
 * otherwise undefined
 */
export async function callFirestore(
  db: firestore.Firestore,
  action: FirestoreAction,
  path: string,
  dataOrOptions?: unknown,
  options?: FirestoreSetOptions & { batchSize?: number },
): Promise<unknown> {
  if (action !== 'batch' && !path) {
    throw new Error(`A path is required to run Firestore "${action}".`);
  }
  switch (action) {
    case 'get':
      return firestoreGet(db, path, dataOrOptions as FirestoreQueryOptions);
    case 'delete':
      return firestoreDelete(db, path, dataOrOptions as FirestoreQueryOptions);
    case 'batch':
      return firestoreBatch(
        db,
        path,
        dataOrOptions as FirestoreBatchOperation[],
        options?.batchSize,
      );
  }
  const data = dataOrOptions as firestore.DocumentData | undefined;
  if (!data) {
    throw new Error(`Data is required to run Firestore "${action}".`);
  }
  switch (action) {
    case 'set':
      await db.doc(trimSlashes(path)).set(data, { merge: !!options?.merge });
      return undefined;
    case 'update':
      await db.doc(trimSlashes(path)).update(data);
      return undefined;
    case 'add': {
      const ref = await db.collection(trimSlashes(path)).add(data);
      return ref.id;
    }
    default:
      throw new Error(`Unsupported Firestore action "${action}".`);
  }
}
