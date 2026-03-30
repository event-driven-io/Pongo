import type { JSONSerializer } from '@event-driven-io/dumbo';
import type {
  BatchHandleOptions,
  CollectionOperationOptions,
  DocumentHandler,
  ExpectedDocumentVersion,
  HandleOptions,
  OperationResult,
  OptionalUnlessRequiredIdAndVersion,
  PongoDeleteResult,
  PongoDocument,
  PongoHandleResult,
  PongoInsertManyResult,
  PongoInsertOneResult,
  PongoReplaceManyResult,
  PongoUpdateResult,
  WithId,
  WithIdAndVersion,
} from '..';
import { deepEquals, expectedVersionValue, operationResult } from '..';

export type DocumentCommandHandlerOptions<T extends PongoDocument> = {
  collectionName: string;
  serializer: JSONSerializer;
  errors?: { throwOnOperationFailures?: boolean } | undefined;
  storage: {
    ensureCollectionCreated: (
      options?: CollectionOperationOptions,
    ) => Promise<unknown>;
    fetchByIds: (
      ids: string[],
      options?: CollectionOperationOptions,
    ) => Promise<(WithIdAndVersion<T> | null)[]>;
    insertMany: (
      docs: OptionalUnlessRequiredIdAndVersion<T>[],
      options?: CollectionOperationOptions,
    ) => Promise<PongoInsertManyResult>;
    replaceMany: (
      docs: Array<WithIdAndVersion<T>>,
      options?: CollectionOperationOptions,
    ) => Promise<PongoReplaceManyResult>;
    deleteManyByIds: (
      ids: Array<{ _id: string; _version?: bigint }>,
      options?: CollectionOperationOptions,
    ) => Promise<PongoDeleteResult & { deletedIds: Set<string> }>;
  };
};

export function DocumentCommandHandler<T extends PongoDocument>(
  deps: DocumentCommandHandlerOptions<T>,
): {
  (
    id: string,
    handler: DocumentHandler<T>,
    options?: HandleOptions & BatchHandleOptions,
  ): Promise<PongoHandleResult<T>>;
  (
    ids: string[],
    handler: DocumentHandler<T>,
    options?: HandleOptions & BatchHandleOptions,
  ): Promise<PongoHandleResult<T>[]>;
} {
  const fn = async (
    id: string | string[],
    handler: DocumentHandler<T>,
    options?: HandleOptions & BatchHandleOptions,
  ): Promise<PongoHandleResult<T> | PongoHandleResult<T>[]> => {
    if (Array.isArray(id)) {
      return handleDocuments(deps, id, handler, options);
    }
    const { expectedVersion, ...batchOptions } = options ?? {};
    const input: DocumentInput[] = expectedVersion
      ? [{ _id: id, expectedVersion }]
      : [id];
    const [result] = await handleDocuments(deps, input, handler, batchOptions);
    return result!;
  };
  return fn as ReturnType<typeof DocumentCommandHandler<T>>;
}

type DocumentInput =
  | string
  | { _id: string; expectedVersion?: ExpectedDocumentVersion };

type DocumentChange<T extends PongoDocument> =
  | {
      type: 'noop';
      existing: WithIdAndVersion<T> | null;
      versionMismatch?: boolean;
    }
  | { type: 'insert'; doc: WithId<T> }
  | {
      type: 'replace';
      existing: WithIdAndVersion<T>;
      result: WithId<T>;
      _version?: bigint;
    }
  | { type: 'delete'; docId: string; _version?: bigint };

type StorageResults = {
  insertedIds: Set<string>;
  replaceResult: PongoReplaceManyResult | null;
  deletedIds: Set<string>;
};

function normalizeInput(input: DocumentInput): {
  _id: string;
  expectedVersion?: ExpectedDocumentVersion;
} {
  return typeof input === 'string' ? { _id: input } : input;
}

function hasVersionMismatch<T extends PongoDocument>(
  existing: WithIdAndVersion<T> | null,
  version?: ExpectedDocumentVersion,
): boolean {
  const expected = expectedVersionValue(version);
  return (
    (existing == null && version === 'DOCUMENT_EXISTS') ||
    (existing == null && expected != null) ||
    (existing != null && version === 'DOCUMENT_DOES_NOT_EXIST') ||
    (existing != null && expected !== null && existing._version !== expected)
  );
}

function toDocumentChange<T extends PongoDocument>(
  docId: string,
  existing: WithIdAndVersion<T> | null,
  result: T | null,
  skipConcurrencyCheck?: boolean,
): DocumentChange<T> {
  if (deepEquals(existing as T | null, result))
    return { type: 'noop', existing };

  if (!existing && result)
    return {
      type: 'insert',
      doc: { ...result, _id: docId } as WithId<T>,
    };

  if (existing && !result)
    return skipConcurrencyCheck
      ? { type: 'delete', docId }
      : { type: 'delete', docId, _version: existing._version };

  return skipConcurrencyCheck
    ? {
        type: 'replace',
        existing: existing!,
        result: { ...result, _id: docId } as WithId<T>,
      }
    : {
        type: 'replace',
        existing: existing!,
        result: { ...result, _id: docId } as WithId<T>,
        _version: existing!._version,
      };
}

async function executeStorageChanges<T extends PongoDocument>(
  storage: DocumentCommandHandlerOptions<T>['storage'],
  changes: DocumentChange<T>[],
  operationOptions?: CollectionOperationOptions,
): Promise<StorageResults> {
  const toInsert = changes.flatMap((c) =>
    c.type === 'insert' ? [c.doc as OptionalUnlessRequiredIdAndVersion<T>] : [],
  );

  const toReplace = changes.flatMap((c): Array<WithIdAndVersion<T>> => {
    if (c.type !== 'replace') return [];
    const { _version: _, ...cleanResult } = c.result as Record<string, unknown>;
    return [
      (c._version !== undefined
        ? { ...cleanResult, _version: c._version }
        : cleanResult) as WithIdAndVersion<T>,
    ];
  });

  const toDelete = changes.flatMap((c) =>
    c.type === 'delete'
      ? [
          c._version !== undefined
            ? { _id: c.docId, _version: c._version }
            : { _id: c.docId },
        ]
      : [],
  );

  let insertedIds = new Set<string>();
  let replaceResult: PongoReplaceManyResult | null = null;
  let deletedIds = new Set<string>();

  if (toInsert.length > 0) {
    const result = await storage.insertMany(toInsert, operationOptions);
    insertedIds = new Set(result.insertedIds);
  }

  if (toReplace.length > 0) {
    replaceResult = await storage.replaceMany(toReplace, operationOptions);
  }

  if (toDelete.length > 0) {
    const result = await storage.deleteManyByIds(toDelete, operationOptions);
    deletedIds = result.deletedIds;
  }

  return { insertedIds, replaceResult, deletedIds };
}

function toHandleResult<T extends PongoDocument>(
  deps: DocumentCommandHandlerOptions<T>,
  change: DocumentChange<T>,
  results: StorageResults,
): PongoHandleResult<T> {
  const { collectionName, serializer, errors } = deps;
  const opMeta = {
    operationName: 'handle',
    collectionName,
    serializer,
    errors,
  };

  if (change.type === 'noop') {
    return {
      ...operationResult<OperationResult>(
        { successful: !change.versionMismatch },
        opMeta,
      ),
      document: change.existing as T | null,
    } as unknown as PongoHandleResult<T>;
  }

  if (change.type === 'insert') {
    const succeeded = results.insertedIds.has(change.doc._id);
    return {
      ...operationResult<PongoInsertOneResult>(
        {
          successful: succeeded,
          insertedId: succeeded ? change.doc._id : null,
          nextExpectedVersion: 1n,
        },
        opMeta,
      ),
      document: succeeded
        ? ({ ...change.doc, _version: 1n } as unknown as T)
        : null,
    } as unknown as PongoHandleResult<T>;
  }

  if (change.type === 'delete') {
    const succeeded = results.deletedIds.has(change.docId);
    return {
      ...operationResult<PongoDeleteResult>(
        {
          successful: succeeded,
          deletedCount: succeeded ? 1 : 0,
          matchedCount: 1,
        },
        opMeta,
      ),
      document: null,
    } as unknown as PongoHandleResult<T>;
  }

  const succeeded =
    results.replaceResult?.modifiedIds.includes(change.result._id) ?? false;
  const newVersion =
    results.replaceResult?.nextExpectedVersions.get(change.result._id) ?? 0n;
  return {
    ...operationResult<PongoUpdateResult>(
      {
        successful: succeeded,
        modifiedCount: succeeded ? 1 : 0,
        matchedCount: 1,
        nextExpectedVersion: newVersion,
      },
      opMeta,
    ),
    document: succeeded
      ? ({ ...change.result, _version: newVersion } as unknown as T)
      : (change.existing as T | null),
  } as unknown as PongoHandleResult<T>;
}

async function handleDocuments<T extends PongoDocument>(
  deps: DocumentCommandHandlerOptions<T>,
  inputs: DocumentInput[],
  handler: DocumentHandler<T>,
  options?: BatchHandleOptions,
): Promise<PongoHandleResult<T>[]> {
  if (inputs.length === 0) return [];

  const { storage } = deps;
  const { skipConcurrencyCheck, parallel, ...operationOptions } = options ?? {};

  const items = inputs.map(normalizeInput);
  const ids = items.map((i) => i._id);

  await storage.ensureCollectionCreated(operationOptions);
  const docs = await storage.fetchByIds(ids, operationOptions);

  const prepareDoc = (doc: WithIdAndVersion<T> | null): T | null =>
    doc !== null ? ({ ...doc } as T) : null;

  const versionMismatches = new Set<number>();
  let handlerResults: (T | null)[];

  if (parallel) {
    handlerResults = await Promise.all(
      items.map((item, i) => {
        const existing = docs[i] ?? null;
        if (hasVersionMismatch(existing, item.expectedVersion)) {
          versionMismatches.add(i);
          return Promise.resolve(existing as T | null);
        }
        return Promise.resolve(handler(prepareDoc(existing)));
      }),
    );
  } else {
    handlerResults = [];
    for (let i = 0; i < items.length; i++) {
      const existing = docs[i] ?? null;
      if (hasVersionMismatch(existing, items[i]!.expectedVersion)) {
        versionMismatches.add(i);
        handlerResults.push(existing as T | null);
      } else {
        handlerResults.push(await handler(prepareDoc(existing)));
      }
    }
  }

  const changes = ids.map((id, i) => {
    const change = toDocumentChange(
      id,
      docs[i] ?? null,
      handlerResults[i]!,
      skipConcurrencyCheck,
    );
    if (change.type === 'noop' && versionMismatches.has(i))
      return { ...change, versionMismatch: true };
    return change;
  });

  const storageResults = await executeStorageChanges(
    storage,
    changes,
    operationOptions,
  );

  return changes.map((change) => toHandleResult(deps, change, storageResults));
}
