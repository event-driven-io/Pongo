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
  PongoReplaceManyResult,
  WithId,
  WithIdAndVersion,
} from '..';
import {
  deepEquals,
  expectedVersionValue,
  mapAsync,
  operationResult,
} from '..';

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

type DocumentHandlerResult = { succeeded: boolean; newVersion?: bigint };

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
    return {
      type: 'delete',
      docId,
      ...(!skipConcurrencyCheck && { _version: existing._version }),
    };

  return {
    type: 'replace',
    existing: existing!,
    result: { ...result, _id: docId } as WithId<T>,
    ...(!skipConcurrencyCheck && { _version: existing!._version }),
  };
}

async function executeStorageChanges<T extends PongoDocument>(
  storage: DocumentCommandHandlerOptions<T>['storage'],
  changes: DocumentChange<T>[],
  operationOptions?: CollectionOperationOptions,
): Promise<{ change: DocumentChange<T>; outcome: DocumentHandlerResult }[]> {
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

  const insertedIds =
    toInsert.length > 0
      ? new Set(
          (await storage.insertMany(toInsert, operationOptions)).insertedIds,
        )
      : new Set<string>();

  const replaceResult =
    toReplace.length > 0
      ? await storage.replaceMany(toReplace, operationOptions)
      : null;

  const deletedIds =
    toDelete.length > 0
      ? (await storage.deleteManyByIds(toDelete, operationOptions)).deletedIds
      : new Set<string>();

  const toOutcome = (change: DocumentChange<T>): DocumentHandlerResult => {
    if (change.type === 'noop') return { succeeded: !change.versionMismatch };
    if (change.type === 'insert')
      return { succeeded: insertedIds.has(change.doc._id), newVersion: 1n };
    if (change.type === 'delete')
      return { succeeded: deletedIds.has(change.docId) };

    const id = change.result._id;
    return {
      succeeded: replaceResult?.modifiedIds.includes(id) ?? false,
      newVersion: replaceResult?.nextExpectedVersions.get(id) ?? 0n,
    };
  };

  return changes.map((change) => ({
    change,
    outcome: toOutcome(change),
  }));
}

function toHandleResult<T extends PongoDocument>(
  deps: DocumentCommandHandlerOptions<T>,
  change: DocumentChange<T>,
  { succeeded, newVersion }: DocumentHandlerResult,
): PongoHandleResult<T> {
  const opMeta = {
    operationName: 'handle',
    collectionName: deps.collectionName,
    serializer: deps.serializer,
    errors: deps.errors,
  };
  const toResult = (
    op: Record<string, unknown>,
    document: T | null,
  ): PongoHandleResult<T> =>
    ({
      ...operationResult(op as OperationResult, opMeta),
      document,
    }) as unknown as PongoHandleResult<T>;

  if (change.type === 'noop')
    return toResult({ successful: succeeded }, change.existing as T | null);

  if (change.type === 'insert')
    return toResult(
      {
        successful: succeeded,
        insertedId: succeeded ? change.doc._id : null,
        nextExpectedVersion: 1n,
      },
      succeeded ? ({ ...change.doc, _version: 1n } as unknown as T) : null,
    );

  if (change.type === 'delete')
    return toResult(
      {
        successful: succeeded,
        deletedCount: succeeded ? 1 : 0,
        matchedCount: 1,
      },
      null,
    );

  return toResult(
    {
      successful: succeeded,
      modifiedCount: succeeded ? 1 : 0,
      matchedCount: 1,
      nextExpectedVersion: newVersion ?? 0n,
    },
    succeeded
      ? ({ ...change.result, _version: newVersion } as unknown as T)
      : (change.existing as T | null),
  );
}

async function handleDocument<T extends PongoDocument>(
  id: string,
  existing: WithIdAndVersion<T> | null,
  handler: DocumentHandler<T>,
  expectedVersion: ExpectedDocumentVersion | undefined,
  skipConcurrencyCheck?: boolean,
): Promise<DocumentChange<T>> {
  if (hasVersionMismatch(existing, expectedVersion))
    return { type: 'noop', existing, versionMismatch: true };

  const result = await handler(existing ? ({ ...existing } as T) : null);

  return toDocumentChange(id, existing, result, skipConcurrencyCheck);
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
  const items = inputs.map((input) =>
    typeof input === 'string' ? { _id: input } : input,
  );

  await storage.ensureCollectionCreated(operationOptions);
  const docs = await storage.fetchByIds(
    items.map((i) => i._id),
    operationOptions,
  );

  const itemsWithDocs = items.map((item, i) => ({
    ...item,
    existing: docs[i] ?? null,
  }));

  const changes = await mapAsync(
    itemsWithDocs,
    ({ _id, existing, expectedVersion }) =>
      handleDocument(
        _id,
        existing,
        handler,
        expectedVersion,
        skipConcurrencyCheck,
      ),
    { parallel },
  );

  const outcomes = await executeStorageChanges(
    storage,
    changes,
    operationOptions,
  );

  return outcomes.map(({ change, outcome }) =>
    toHandleResult(deps, change, outcome),
  );
}
