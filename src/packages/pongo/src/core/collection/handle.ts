import type { JSONSerializer } from '@event-driven-io/dumbo';
import type {
  BatchHandleOptions,
  CollectionOperationOptions,
  DocumentHandler,
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
  WithIdAndVersion,
  WithoutId,
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
      return handleBatch(deps, id, handler, options);
    }
    return handleSingle(deps, id, handler, options);
  };
  return fn as ReturnType<typeof DocumentCommandHandler<T>>;
}

type DocumentOp<T extends PongoDocument> =
  | { type: 'noop'; existing: WithIdAndVersion<T> | null }
  | { type: 'insert'; docId: string; newDoc: WithoutId<T> }
  | {
      type: 'replace';
      docId: string;
      existing: WithIdAndVersion<T>;
      result: WithoutId<T>;
      _version?: bigint;
    }
  | { type: 'delete'; docId: string; _version?: bigint };

function classifyOp<T extends PongoDocument>(
  docId: string,
  existing: WithIdAndVersion<T> | null,
  result: T | null,
  skipConcurrencyCheck?: boolean,
): DocumentOp<T> {
  if (deepEquals(existing as T | null, result))
    return { type: 'noop', existing };

  if (!existing && result)
    return {
      type: 'insert',
      docId,
      newDoc: { ...result, _id: docId } as WithoutId<T>,
    };

  if (existing && !result)
    return skipConcurrencyCheck
      ? { type: 'delete', docId }
      : { type: 'delete', docId, _version: existing._version };

  // existing && result
  return skipConcurrencyCheck
    ? {
        type: 'replace',
        docId,
        existing: existing!,
        result: result as WithoutId<T>,
      }
    : {
        type: 'replace',
        docId,
        existing: existing!,
        result: result as WithoutId<T>,
        _version: existing!._version,
      };
}

function checkVersionConstraint<T extends PongoDocument>(
  existing: WithIdAndVersion<T> | null,
  options?: HandleOptions,
): 'ok' | 'skip' {
  const { expectedVersion: version } = options ?? {};
  const expectedVersion = expectedVersionValue(version);

  if (
    (existing == null && version === 'DOCUMENT_EXISTS') ||
    (existing == null && expectedVersion != null) ||
    (existing != null && version === 'DOCUMENT_DOES_NOT_EXIST') ||
    (existing != null &&
      expectedVersion !== null &&
      existing._version !== expectedVersion)
  ) {
    return 'skip';
  }
  return 'ok';
}

function buildHandleResult<T extends PongoDocument>(
  deps: DocumentCommandHandlerOptions<T>,
  op:
    | { type: 'noop'; document: T | null }
    | {
        type: 'insert';
        succeeded: boolean;
        docId: string;
        newDoc: WithoutId<T>;
      }
    | {
        type: 'replace';
        succeeded: boolean;
        docId: string;
        existing: WithIdAndVersion<T> | null;
        result: WithoutId<T>;
        newVersion: bigint;
      }
    | { type: 'delete'; succeeded: boolean },
): PongoHandleResult<T> {
  const { collectionName, serializer, errors } = deps;
  const opMeta = {
    operationName: 'handle',
    collectionName,
    serializer,
    errors,
  };

  if (op.type === 'noop') {
    return {
      ...operationResult<OperationResult>({ successful: false }, opMeta),
      document: op.document,
    } as unknown as PongoHandleResult<T>;
  }

  if (op.type === 'insert') {
    return {
      ...operationResult<PongoInsertOneResult>(
        {
          successful: op.succeeded,
          insertedId: op.succeeded ? op.docId : null,
          nextExpectedVersion: 1n,
        },
        opMeta,
      ),
      document: op.succeeded
        ? ({ ...op.newDoc, _id: op.docId, _version: 1n } as unknown as T)
        : null,
    } as unknown as PongoHandleResult<T>;
  }

  if (op.type === 'delete') {
    return {
      ...operationResult<PongoDeleteResult>(
        {
          successful: op.succeeded,
          deletedCount: op.succeeded ? 1 : 0,
          matchedCount: 1,
        },
        opMeta,
      ),
      document: null,
    } as unknown as PongoHandleResult<T>;
  }

  return {
    ...operationResult<PongoUpdateResult>(
      {
        successful: op.succeeded,
        modifiedCount: op.succeeded ? 1 : 0,
        matchedCount: 1,
        nextExpectedVersion: op.newVersion,
      },
      opMeta,
    ),
    document: op.succeeded
      ? ({ ...op.result, _version: op.newVersion } as unknown as T)
      : (op.existing as T | null),
  } as unknown as PongoHandleResult<T>;
}

async function handleSingle<T extends PongoDocument>(
  deps: DocumentCommandHandlerOptions<T>,
  id: string,
  handler: DocumentHandler<T>,
  options?: HandleOptions & BatchHandleOptions,
): Promise<PongoHandleResult<T>> {
  const { storage } = deps;
  const {
    skipConcurrencyCheck,
    parallel: _parallel,
    ...operationOptions
  } = options ?? {};

  await storage.ensureCollectionCreated(operationOptions);

  const [existing = null] = await storage.fetchByIds([id], operationOptions);

  if (checkVersionConstraint(existing, options) === 'skip') {
    return buildHandleResult(deps, {
      type: 'noop',
      document: existing as T | null,
    });
  }

  const result = await handler(
    existing !== null ? ({ ...existing } as T) : null,
  );

  const op = classifyOp(id, existing, result, skipConcurrencyCheck);

  if (op.type === 'noop') {
    return buildHandleResult(deps, {
      type: 'noop',
      document: existing as T | null,
    });
  }

  if (op.type === 'insert') {
    const insertResult = await storage.insertMany(
      [{ _id: id, ...op.newDoc } as OptionalUnlessRequiredIdAndVersion<T>],
      operationOptions,
    );
    const succeeded = new Set(insertResult.insertedIds).has(id);
    return buildHandleResult(deps, {
      type: 'insert',
      succeeded,
      docId: id,
      newDoc: op.newDoc,
    });
  }

  if (op.type === 'delete') {
    const toDelete =
      op._version !== undefined
        ? { _id: id, _version: op._version }
        : { _id: id };
    const deleteResult = await storage.deleteManyByIds(
      [toDelete],
      operationOptions,
    );
    return buildHandleResult(deps, {
      type: 'delete',
      succeeded: deleteResult.deletedIds.has(id),
    });
  }

  // replace
  const { _version: _, ...cleanResult } = op.result as Record<string, unknown>;
  const toReplace =
    op._version !== undefined
      ? { ...cleanResult, _id: id, _version: op._version }
      : { ...cleanResult, _id: id };
  const replaceResult = await storage.replaceMany(
    [toReplace as WithIdAndVersion<T>],
    operationOptions,
  );
  const succeeded = replaceResult.modifiedIds.includes(id);
  const newVersion = replaceResult.nextExpectedVersions.get(id) ?? 0n;
  return buildHandleResult(deps, {
    type: 'replace',
    succeeded,
    docId: id,
    existing,
    result: op.result,
    newVersion,
  });
}

async function handleBatch<T extends PongoDocument>(
  deps: DocumentCommandHandlerOptions<T>,
  ids: string[],
  handler: DocumentHandler<T>,
  options?: HandleOptions & BatchHandleOptions,
): Promise<PongoHandleResult<T>[]> {
  if (ids.length === 0) return [];

  const { storage } = deps;
  const { skipConcurrencyCheck, parallel, ...operationOptions } = options ?? {};

  await storage.ensureCollectionCreated(operationOptions);

  const docs = await storage.fetchByIds(ids, operationOptions);

  let handlerResults: (T | null)[];
  if (parallel) {
    handlerResults = await Promise.all(
      docs.map((doc) =>
        Promise.resolve(handler(doc !== null ? ({ ...doc } as T) : null)),
      ),
    );
  } else {
    handlerResults = [];
    for (const doc of docs) {
      handlerResults.push(
        await handler(doc !== null ? ({ ...doc } as T) : null),
      );
    }
  }

  const ops = ids.map((docId, i) =>
    classifyOp(
      docId,
      docs[i] ?? null,
      handlerResults[i]!,
      skipConcurrencyCheck,
    ),
  );

  const toInsert = ops.flatMap((op) =>
    op.type === 'insert'
      ? [
          {
            _id: op.docId,
            ...op.newDoc,
          } as OptionalUnlessRequiredIdAndVersion<T>,
        ]
      : [],
  );

  const toReplace = ops.flatMap((op): Array<WithIdAndVersion<T>> => {
    if (op.type !== 'replace') return [];
    const { _version: _, ...cleanResult } = op.result as Record<
      string,
      unknown
    >;
    const base = { ...cleanResult, _id: op.docId };
    return [
      (op._version !== undefined
        ? { ...base, _version: op._version }
        : base) as WithIdAndVersion<T>,
    ];
  });

  const toDelete = ops.flatMap((op) =>
    op.type === 'delete'
      ? [
          op._version !== undefined
            ? { _id: op.docId, _version: op._version }
            : { _id: op.docId },
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

  return ids.map((docId, i) => {
    const op = ops[i]!;

    if (op.type === 'noop') {
      return buildHandleResult(deps, {
        type: 'noop',
        document: op.existing as T | null,
      });
    }

    if (op.type === 'insert') {
      return buildHandleResult(deps, {
        type: 'insert',
        succeeded: insertedIds.has(docId),
        docId,
        newDoc: op.newDoc,
      });
    }

    if (op.type === 'delete') {
      return buildHandleResult(deps, {
        type: 'delete',
        succeeded: deletedIds.has(docId),
      });
    }

    const succeeded = replaceResult?.modifiedIds.includes(docId) ?? false;
    const newVersion = replaceResult?.nextExpectedVersions.get(docId) ?? 0n;
    return buildHandleResult(deps, {
      type: 'replace',
      succeeded,
      docId,
      existing: op.existing,
      result: op.result,
      newVersion,
    });
  });
}
