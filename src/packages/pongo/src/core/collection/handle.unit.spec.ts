import { jsonSerializer } from '@event-driven-io/dumbo';
import { describe, expect, it, vi } from 'vitest';
import type {
  PongoDocument,
  PongoInsertManyResult,
  PongoReplaceManyResult,
  WithIdAndVersion,
} from '..';
import {
  DocumentCommandHandler,
  type DocumentCommandHandlerOptions,
} from './handle';

type TestDoc = PongoDocument & { name: string };

const doc = (
  id: string,
  name: string,
  version = 1n,
): WithIdAndVersion<TestDoc> => ({
  _id: id,
  name,
  _version: version,
});

const noop = () => {};

const insertResult = (ids: string[]): PongoInsertManyResult => ({
  successful: ids.length > 0,
  acknowledged: true,
  assertSuccessful: noop,
  insertedIds: ids,
  insertedCount: ids.length,
});

const replaceResult = (
  ids: string[],
  versions?: Map<string, bigint>,
): PongoReplaceManyResult => ({
  successful: ids.length > 0,
  acknowledged: true,
  assertSuccessful: noop,
  modifiedIds: ids,
  modifiedCount: ids.length,
  matchedCount: ids.length,
  conflictIds: [],
  nextExpectedVersions: versions ?? new Map(ids.map((id) => [id, 2n])),
});

const deleteResult = (ids: string[]) => ({
  successful: ids.length > 0,
  acknowledged: true,
  assertSuccessful: noop,
  deletedCount: ids.length,
  matchedCount: ids.length,
  deletedIds: new Set(ids),
});

function makeDeps(
  overrides: Partial<DocumentCommandHandlerOptions<TestDoc>['storage']> = {},
): DocumentCommandHandlerOptions<TestDoc> {
  return {
    collectionName: 'test',
    serializer: jsonSerializer(),
    storage: {
      ensureCollectionCreated: vi.fn().mockResolvedValue(undefined),
      fetchByIds: vi.fn().mockResolvedValue([]),
      insertMany: vi.fn().mockResolvedValue(insertResult([])),
      replaceMany: vi.fn().mockResolvedValue(replaceResult([])),
      deleteManyByIds: vi.fn().mockResolvedValue(deleteResult([])),
      ...overrides,
    },
  };
}

describe('handle — single document', () => {
  it('inserts a new document when none exists', async () => {
    const deps = makeDeps({
      fetchByIds: vi.fn().mockResolvedValue([null]),
      insertMany: vi.fn().mockResolvedValue(insertResult(['id-1'])),
    });
    const handle = DocumentCommandHandler(deps);

    const result = await handle('id-1', () => ({ name: 'Alice' }));

    expect(deps.storage.insertMany).toHaveBeenCalledWith(
      [expect.objectContaining({ _id: 'id-1', name: 'Alice' })],
      expect.anything(),
    );
    expect(result.successful).toBe(true);
    expect((result.document as TestDoc).name).toBe('Alice');
  });

  it('updates an existing document', async () => {
    const deps = makeDeps({
      fetchByIds: vi.fn().mockResolvedValue([doc('id-1', 'Alice')]),
      replaceMany: vi.fn().mockResolvedValue(replaceResult(['id-1'])),
    });
    const handle = DocumentCommandHandler(deps);

    const result = await handle('id-1', (d) => ({ ...d!, name: 'Bob' }));

    expect(deps.storage.replaceMany).toHaveBeenCalledWith(
      [expect.objectContaining({ _id: 'id-1', name: 'Bob' })],
      expect.anything(),
    );
    expect(result.successful).toBe(true);
    expect((result.document as TestDoc).name).toBe('Bob');
  });

  it('deletes a document when handler returns null', async () => {
    const deps = makeDeps({
      fetchByIds: vi.fn().mockResolvedValue([doc('id-1', 'Alice')]),
      deleteManyByIds: vi.fn().mockResolvedValue(deleteResult(['id-1'])),
    });
    const handle = DocumentCommandHandler(deps);

    const result = await handle('id-1', () => null);

    expect(deps.storage.deleteManyByIds).toHaveBeenCalledWith(
      [expect.objectContaining({ _id: 'id-1' })],
      expect.anything(),
    );
    expect(result.successful).toBe(true);
    expect(result.document).toBeNull();
  });

  it('succeeds without writing when handler returns document unchanged', async () => {
    const existing = doc('id-1', 'Alice');
    const deps = makeDeps({
      fetchByIds: vi.fn().mockResolvedValue([existing]),
    });
    const handle = DocumentCommandHandler(deps);

    const result = await handle('id-1', (d) => d);

    expect(deps.storage.insertMany).not.toHaveBeenCalled();
    expect(deps.storage.replaceMany).not.toHaveBeenCalled();
    expect(deps.storage.deleteManyByIds).not.toHaveBeenCalled();
    expect(result.successful).toBe(true);
  });

  it('gives handler null when document does not exist', async () => {
    const deps = makeDeps({ fetchByIds: vi.fn().mockResolvedValue([null]) });
    const handle = DocumentCommandHandler(deps);
    const handler = vi.fn().mockReturnValue(null);

    await handle('id-1', handler);

    expect(handler).toHaveBeenCalledWith(null);
  });

  it('gives handler a copy of the document, not the original reference', async () => {
    const original = doc('id-1', 'Alice');
    const deps = makeDeps({
      fetchByIds: vi.fn().mockResolvedValue([original]),
    });
    const handle = DocumentCommandHandler(deps);
    let received: TestDoc | null = null;

    await handle('id-1', (d) => {
      received = d;
      return d;
    });

    expect(received).not.toBe(original);
    expect(received).toEqual(original);
  });

  it('works with an async handler', async () => {
    const deps = makeDeps({
      fetchByIds: vi.fn().mockResolvedValue([null]),
      insertMany: vi.fn().mockResolvedValue(insertResult(['id-1'])),
    });
    const handle = DocumentCommandHandler(deps);

    const result = await handle('id-1', () =>
      Promise.resolve({ name: 'Async' }),
    );

    expect(result.successful).toBe(true);
  });
});

describe('handle — single document version checking', () => {
  it('does not handle when document is expected to exist but is missing', async () => {
    const deps = makeDeps({ fetchByIds: vi.fn().mockResolvedValue([null]) });
    const handle = DocumentCommandHandler(deps);

    const result = await handle(
      { _id: 'id-1', expectedVersion: 'DOCUMENT_EXISTS' },
      () => ({ name: 'X' }),
    );

    expect(deps.storage.insertMany).not.toHaveBeenCalled();
    expect(result.successful).toBe(false);
  });

  it('does not handle when expected version is set but document does not exist', async () => {
    const deps = makeDeps({ fetchByIds: vi.fn().mockResolvedValue([null]) });
    const handle = DocumentCommandHandler(deps);

    const result = await handle({ _id: 'id-1', expectedVersion: 1n }, () => ({
      name: 'X',
    }));

    expect(deps.storage.insertMany).not.toHaveBeenCalled();
    expect(result.successful).toBe(false);
  });

  it('does not handle when document is expected not to exist but already does', async () => {
    const deps = makeDeps({
      fetchByIds: vi.fn().mockResolvedValue([doc('id-1', 'Alice')]),
    });
    const handle = DocumentCommandHandler(deps);

    const result = await handle(
      { _id: 'id-1', expectedVersion: 'DOCUMENT_DOES_NOT_EXIST' },
      (d) => ({ ...d!, name: 'X' }),
    );

    expect(deps.storage.replaceMany).not.toHaveBeenCalled();
    expect(result.successful).toBe(false);
  });

  it('does not handle when expected version does not match', async () => {
    const deps = makeDeps({
      fetchByIds: vi.fn().mockResolvedValue([doc('id-1', 'Alice', 1n)]),
    });
    const handle = DocumentCommandHandler(deps);

    const result = await handle(
      { _id: 'id-1', expectedVersion: 333n },
      (d) => ({ ...d!, name: 'X' }),
    );

    expect(deps.storage.replaceMany).not.toHaveBeenCalled();
    expect(result.successful).toBe(false);
  });

  it('does not handle when version mismatches even if the handler would return the same document', async () => {
    const existing = doc('id-1', 'Alice', 1n);
    const deps = makeDeps({
      fetchByIds: vi.fn().mockResolvedValue([existing]),
    });
    const handle = DocumentCommandHandler(deps);

    const result = await handle(
      { _id: 'id-1', expectedVersion: 99n },
      (d) => d,
    );

    expect(deps.storage.replaceMany).not.toHaveBeenCalled();
    expect(result.successful).toBe(false);
  });

  it('updates when expected version matches', async () => {
    const deps = makeDeps({
      fetchByIds: vi.fn().mockResolvedValue([doc('id-1', 'Alice', 5n)]),
      replaceMany: vi.fn().mockResolvedValue(replaceResult(['id-1'])),
    });
    const handle = DocumentCommandHandler(deps);

    const result = await handle({ _id: 'id-1', expectedVersion: 5n }, (d) => ({
      ...d!,
      name: 'Bob',
    }));

    expect(deps.storage.replaceMany).toHaveBeenCalledWith(
      [expect.objectContaining({ _id: 'id-1', _version: 5n })],
      expect.anything(),
    );
    expect(result.successful).toBe(true);
  });

  it('deletes when expected version matches and handler returns null', async () => {
    const deps = makeDeps({
      fetchByIds: vi.fn().mockResolvedValue([doc('id-1', 'Alice', 5n)]),
      deleteManyByIds: vi.fn().mockResolvedValue(deleteResult(['id-1'])),
    });
    const handle = DocumentCommandHandler(deps);

    const result = await handle(
      { _id: 'id-1', expectedVersion: 5n },
      () => null,
    );

    expect(deps.storage.deleteManyByIds).toHaveBeenCalledWith(
      [expect.objectContaining({ _id: 'id-1', _version: 5n })],
      expect.anything(),
    );
    expect(result.successful).toBe(true);
    expect(result.document).toBeNull();
  });
});

describe('handle — batch operations', () => {
  it('handles a mix of new and existing documents', async () => {
    const deps = makeDeps({
      fetchByIds: vi.fn().mockResolvedValue([doc('id-1', 'Alice'), null]),
      insertMany: vi.fn().mockResolvedValue(insertResult(['id-2'])),
      replaceMany: vi.fn().mockResolvedValue(replaceResult(['id-1'])),
    });
    const handle = DocumentCommandHandler(deps);

    const results = await handle(['id-1', 'id-2'], (d) =>
      d ? { ...d, name: 'Updated' } : { name: 'New' },
    );

    expect(results).toHaveLength(2);
    expect(results[0]!.successful).toBe(true);
    expect(results[1]!.successful).toBe(true);
  });

  it('batches all inserts into a single storage call', async () => {
    const deps = makeDeps({
      fetchByIds: vi.fn().mockResolvedValue([null, null, null]),
      insertMany: vi
        .fn()
        .mockResolvedValue(insertResult(['id-1', 'id-2', 'id-3'])),
    });
    const handle = DocumentCommandHandler(deps);

    await handle(['id-1', 'id-2', 'id-3'], () => ({ name: 'Batch' }));

    expect(deps.storage.insertMany).toHaveBeenCalledTimes(1);
    expect(deps.storage.insertMany).toHaveBeenCalledWith(
      expect.arrayContaining([
        expect.objectContaining({ _id: 'id-1' }),
        expect.objectContaining({ _id: 'id-2' }),
        expect.objectContaining({ _id: 'id-3' }),
      ]),
      expect.anything(),
    );
  });

  it('batches all deletes into a single storage call', async () => {
    const deps = makeDeps({
      fetchByIds: vi
        .fn()
        .mockResolvedValue([doc('id-1', 'A'), doc('id-2', 'B')]),
      deleteManyByIds: vi
        .fn()
        .mockResolvedValue(deleteResult(['id-1', 'id-2'])),
    });
    const handle = DocumentCommandHandler(deps);

    const results = await handle(['id-1', 'id-2'], () => null);

    expect(deps.storage.deleteManyByIds).toHaveBeenCalledTimes(1);
    expect(results.every((r) => r.successful)).toBe(true);
  });

  it('batches inserts, updates, and deletes in a single round trip', async () => {
    const deps = makeDeps({
      fetchByIds: vi
        .fn()
        .mockResolvedValue([
          null,
          doc('id-existing', 'Replace me'),
          doc('id-delete', 'Delete me'),
        ]),
      insertMany: vi.fn().mockResolvedValue(insertResult(['id-new'])),
      replaceMany: vi.fn().mockResolvedValue(replaceResult(['id-existing'])),
      deleteManyByIds: vi.fn().mockResolvedValue(deleteResult(['id-delete'])),
    });
    const handle = DocumentCommandHandler(deps);

    const results = await handle(
      ['id-new', 'id-existing', 'id-delete'],
      (doc) => {
        if (doc === null) return { name: 'New' };
        if (doc.name === 'Delete me') return null;
        return { ...doc, name: 'Replaced' };
      },
    );

    expect(deps.storage.insertMany).toHaveBeenCalledTimes(1);
    expect(deps.storage.replaceMany).toHaveBeenCalledTimes(1);
    expect(deps.storage.deleteManyByIds).toHaveBeenCalledTimes(1);
    expect(results[0]!.successful).toBe(true);
    expect(results[1]!.successful).toBe(true);
    expect(results[2]!.successful).toBe(true);
  });

  it('succeeds without writing when all documents are unchanged', async () => {
    const existing = doc('id-1', 'Alice');
    const deps = makeDeps({
      fetchByIds: vi.fn().mockResolvedValue([existing]),
    });
    const handle = DocumentCommandHandler(deps);

    const results = await handle(['id-1'], (d) => d);

    expect(deps.storage.insertMany).not.toHaveBeenCalled();
    expect(deps.storage.replaceMany).not.toHaveBeenCalled();
    expect(deps.storage.deleteManyByIds).not.toHaveBeenCalled();
    expect(results[0]!.successful).toBe(true);
  });

  it('preserves input order in results', async () => {
    const deps = makeDeps({
      fetchByIds: vi
        .fn()
        .mockResolvedValue([
          doc('id-c', 'C'),
          doc('id-a', 'A'),
          doc('id-b', 'B'),
        ]),
      replaceMany: vi.fn().mockResolvedValue(
        replaceResult(
          ['id-c', 'id-a', 'id-b'],
          new Map([
            ['id-c', 2n],
            ['id-a', 2n],
            ['id-b', 2n],
          ]),
        ),
      ),
    });
    const handle = DocumentCommandHandler(deps);

    const results = await handle(['id-c', 'id-a', 'id-b'], (d) => ({
      ...d!,
      name: d!.name + '!',
    }));

    expect((results[0]!.document as TestDoc).name).toBe('C!');
    expect((results[1]!.document as TestDoc).name).toBe('A!');
    expect((results[2]!.document as TestDoc).name).toBe('B!');
  });
});

describe('handle — batch concurrency', () => {
  it('does not update when storage rejects due to version conflict', async () => {
    const deps = makeDeps({
      fetchByIds: vi.fn().mockResolvedValue([doc('id-1', 'Alice', 1n)]),
      replaceMany: vi.fn().mockResolvedValue(replaceResult([])),
    });
    const handle = DocumentCommandHandler(deps);

    const result = await handle(['id-1'], (d) => ({ ...d!, name: 'Bob' }));

    expect(deps.storage.replaceMany).toHaveBeenCalledWith(
      [expect.objectContaining({ _version: 1n })],
      expect.anything(),
    );
    expect(result[0]!.successful).toBe(false);
  });

  it('skips version check in storage when no version is provided', async () => {
    const deps = makeDeps({
      fetchByIds: vi.fn().mockResolvedValue([doc('id-1', 'Alice', 5n)]),
      replaceMany: vi.fn().mockResolvedValue(replaceResult(['id-1'])),
    });
    const handle = DocumentCommandHandler(deps);

    await handle([{ _id: 'id-1' }], (d) => ({ ...d!, name: 'Forced' }));

    expect(deps.storage.replaceMany).toHaveBeenCalledWith(
      [{ _id: 'id-1', name: 'Forced', _version: 5n }],
      expect.anything(),
    );
  });
});

describe('handle — parallel option', () => {
  it('invokes all handlers concurrently when parallel is true', async () => {
    const callOrder: string[] = [];
    const handler = vi.fn((d: TestDoc | null) => {
      callOrder.push('handler:' + (d?.name ?? 'null'));
      return d;
    });

    const deps = makeDeps({
      fetchByIds: vi
        .fn()
        .mockResolvedValue([doc('id-1', 'A'), doc('id-2', 'B')]),
    });

    const handle = DocumentCommandHandler(deps);
    await handle(['id-1', 'id-2'], handler, { parallel: true });

    expect(handler).toHaveBeenCalledTimes(2);
  });

  it('invokes handlers sequentially by default', async () => {
    let activeCount = 0;
    let maxConcurrent = 0;

    const deps = makeDeps({
      fetchByIds: vi
        .fn()
        .mockResolvedValue([doc('id-1', 'A'), doc('id-2', 'B')]),
    });
    const handle = DocumentCommandHandler(deps);

    await handle(['id-1', 'id-2'], async (d) => {
      activeCount++;
      maxConcurrent = Math.max(maxConcurrent, activeCount);
      await Promise.resolve();
      activeCount--;
      return d;
    });

    expect(maxConcurrent).toBe(1);
  });

  it('runs handlers concurrently when parallel is true', async () => {
    let activeCount = 0;
    let maxConcurrent = 0;

    const deps = makeDeps({
      fetchByIds: vi
        .fn()
        .mockResolvedValue([doc('id-1', 'A'), doc('id-2', 'B')]),
    });
    const handle = DocumentCommandHandler(deps);

    await handle(
      ['id-1', 'id-2'],
      async (d) => {
        activeCount++;
        maxConcurrent = Math.max(maxConcurrent, activeCount);
        await Promise.resolve();
        activeCount--;
        return d;
      },
      { parallel: true },
    );

    expect(maxConcurrent).toBe(2);
  });
});

describe('handle — concurrent write conflicts', () => {
  describe('insert', () => {
    it('fails when another process already inserted the document', async () => {
      const deps = makeDeps({
        fetchByIds: vi.fn().mockResolvedValue([null]),
        insertMany: vi.fn().mockResolvedValue(insertResult([])),
      });
      const handle = DocumentCommandHandler(deps);

      const result = await handle('id-1', () => ({ name: 'X' }));

      expect(result.successful).toBe(false);
      expect(result.document).toBeNull();
    });

    it('marks only the conflicting inserts as failed in a batch', async () => {
      const deps = makeDeps({
        fetchByIds: vi.fn().mockResolvedValue([null, null]),
        insertMany: vi.fn().mockResolvedValue(insertResult(['id-1'])),
      });
      const handle = DocumentCommandHandler(deps);

      const results = await handle(['id-1', 'id-2'], () => ({ name: 'X' }));

      expect(results[0]!.successful).toBe(true);
      expect(results[1]!.successful).toBe(false);
    });
  });

  describe('replace', () => {
    it('fails when storage rejects the update due to concurrent modification', async () => {
      const deps = makeDeps({
        fetchByIds: vi.fn().mockResolvedValue([doc('id-1', 'Alice')]),
        replaceMany: vi.fn().mockResolvedValue(replaceResult([])),
      });
      const handle = DocumentCommandHandler(deps);

      const result = await handle('id-1', (d) => ({ ...d!, name: 'Bob' }));

      expect(result.successful).toBe(false);
      expect((result.document as TestDoc).name).toBe('Alice');
    });

    it('marks only the conflicting updates as failed in a batch', async () => {
      const deps = makeDeps({
        fetchByIds: vi
          .fn()
          .mockResolvedValue([doc('id-1', 'Alice'), doc('id-2', 'Bob')]),
        replaceMany: vi.fn().mockResolvedValue(replaceResult(['id-1'])),
      });
      const handle = DocumentCommandHandler(deps);

      const results = await handle(['id-1', 'id-2'], (d) => ({
        ...d!,
        name: 'Updated',
      }));

      expect(results[0]!.successful).toBe(true);
      expect(results[1]!.successful).toBe(false);
      expect((results[1]!.document as TestDoc).name).toBe('Bob');
    });
  });

  describe('delete', () => {
    it('fails when storage rejects the delete due to concurrent modification', async () => {
      const deps = makeDeps({
        fetchByIds: vi.fn().mockResolvedValue([doc('id-1', 'Alice')]),
        deleteManyByIds: vi.fn().mockResolvedValue(deleteResult([])),
      });
      const handle = DocumentCommandHandler(deps);

      const result = await handle('id-1', () => null);

      expect(result.successful).toBe(false);
    });

    it('marks only the conflicting deletes as failed in a batch', async () => {
      const deps = makeDeps({
        fetchByIds: vi
          .fn()
          .mockResolvedValue([doc('id-1', 'Alice'), doc('id-2', 'Bob')]),
        deleteManyByIds: vi.fn().mockResolvedValue(deleteResult(['id-1'])),
      });
      const handle = DocumentCommandHandler(deps);

      const results = await handle(['id-1', 'id-2'], () => null);

      expect(results[0]!.successful).toBe(true);
      expect(results[1]!.successful).toBe(false);
    });
  });
});

describe('handle — edge cases', () => {
  it('returns empty result for empty input', async () => {
    const deps = makeDeps();
    const handle = DocumentCommandHandler(deps);

    const results = await handle([], () => ({ name: 'X' }));

    expect(results).toEqual([]);
    expect(deps.storage.fetchByIds).not.toHaveBeenCalled();
  });

  it('always returns an array when called with array input', async () => {
    const deps = makeDeps({
      fetchByIds: vi.fn().mockResolvedValue([null]),
      insertMany: vi.fn().mockResolvedValue(insertResult(['id-1'])),
    });
    const handle = DocumentCommandHandler(deps);

    const results = await handle(['id-1'], () => ({ name: 'X' }));

    expect(Array.isArray(results)).toBe(true);
    expect(results).toHaveLength(1);
  });
});
