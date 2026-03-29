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
  it('calls insertMany when doc does not exist and handler returns new doc', async () => {
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

  it('calls replaceMany when doc exists and handler returns modified doc', async () => {
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

  it('calls deleteManyByIds when doc exists and handler returns null', async () => {
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

  it('calls no storage write when handler returns same doc (noop)', async () => {
    const existing = doc('id-1', 'Alice');
    const deps = makeDeps({
      fetchByIds: vi.fn().mockResolvedValue([existing]),
    });
    const handle = DocumentCommandHandler(deps);

    const result = await handle('id-1', (d) => d);

    expect(deps.storage.insertMany).not.toHaveBeenCalled();
    expect(deps.storage.replaceMany).not.toHaveBeenCalled();
    expect(deps.storage.deleteManyByIds).not.toHaveBeenCalled();
    expect(result.successful).toBe(false);
  });

  it('passes null to handler when doc does not exist', async () => {
    const deps = makeDeps({ fetchByIds: vi.fn().mockResolvedValue([null]) });
    const handle = DocumentCommandHandler(deps);
    const handler = vi.fn().mockReturnValue(null);

    await handle('id-1', handler);

    expect(handler).toHaveBeenCalledWith(null);
  });

  it('passes a copy to the handler, not the original reference', async () => {
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

  it('handles an async handler', async () => {
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
  it('skips when DOCUMENT_EXISTS but doc is missing', async () => {
    const deps = makeDeps({ fetchByIds: vi.fn().mockResolvedValue([null]) });
    const handle = DocumentCommandHandler(deps);

    const result = await handle('id-1', () => ({ name: 'X' }), {
      expectedVersion: 'DOCUMENT_EXISTS',
    });

    expect(deps.storage.insertMany).not.toHaveBeenCalled();
    expect(result.successful).toBe(false);
  });

  it('skips when numeric version given but doc is missing', async () => {
    const deps = makeDeps({ fetchByIds: vi.fn().mockResolvedValue([null]) });
    const handle = DocumentCommandHandler(deps);

    const result = await handle('id-1', () => ({ name: 'X' }), {
      expectedVersion: 1n,
    });

    expect(deps.storage.insertMany).not.toHaveBeenCalled();
    expect(result.successful).toBe(false);
  });

  it('skips when DOCUMENT_DOES_NOT_EXIST but doc exists', async () => {
    const deps = makeDeps({
      fetchByIds: vi.fn().mockResolvedValue([doc('id-1', 'Alice')]),
    });
    const handle = DocumentCommandHandler(deps);

    const result = await handle('id-1', (d) => ({ ...d!, name: 'X' }), {
      expectedVersion: 'DOCUMENT_DOES_NOT_EXIST',
    });

    expect(deps.storage.replaceMany).not.toHaveBeenCalled();
    expect(result.successful).toBe(false);
  });

  it('skips when version does not match', async () => {
    const deps = makeDeps({
      fetchByIds: vi.fn().mockResolvedValue([doc('id-1', 'Alice', 1n)]),
    });
    const handle = DocumentCommandHandler(deps);

    const result = await handle('id-1', (d) => ({ ...d!, name: 'X' }), {
      expectedVersion: 333n,
    });

    expect(deps.storage.replaceMany).not.toHaveBeenCalled();
    expect(result.successful).toBe(false);
  });

  it('replaces when version matches', async () => {
    const deps = makeDeps({
      fetchByIds: vi.fn().mockResolvedValue([doc('id-1', 'Alice', 5n)]),
      replaceMany: vi.fn().mockResolvedValue(replaceResult(['id-1'])),
    });
    const handle = DocumentCommandHandler(deps);

    const result = await handle('id-1', (d) => ({ ...d!, name: 'Bob' }), {
      expectedVersion: 5n,
    });

    expect(deps.storage.replaceMany).toHaveBeenCalledWith(
      [expect.objectContaining({ _id: 'id-1', _version: 5n })],
      expect.anything(),
    );
    expect(result.successful).toBe(true);
  });

  it('deletes when version matches and handler returns null', async () => {
    const deps = makeDeps({
      fetchByIds: vi.fn().mockResolvedValue([doc('id-1', 'Alice', 5n)]),
      deleteManyByIds: vi.fn().mockResolvedValue(deleteResult(['id-1'])),
    });
    const handle = DocumentCommandHandler(deps);

    const result = await handle('id-1', () => null, { expectedVersion: 5n });

    expect(deps.storage.deleteManyByIds).toHaveBeenCalledWith(
      [expect.objectContaining({ _id: 'id-1', _version: 5n })],
      expect.anything(),
    );
    expect(result.successful).toBe(true);
    expect(result.document).toBeNull();
  });
});

describe('handle — batch operations', () => {
  it('handles mixed existing and non-existing docs', async () => {
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

  it('calls insertMany once for all new docs', async () => {
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

  it('calls deleteManyByIds once for all docs to delete', async () => {
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

  it('handles mixed insert + replace + delete in one call', async () => {
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

  it('calls no write operations for noop docs', async () => {
    const existing = doc('id-1', 'Alice');
    const deps = makeDeps({
      fetchByIds: vi.fn().mockResolvedValue([existing]),
    });
    const handle = DocumentCommandHandler(deps);

    await handle(['id-1'], (d) => d);

    expect(deps.storage.insertMany).not.toHaveBeenCalled();
    expect(deps.storage.replaceMany).not.toHaveBeenCalled();
    expect(deps.storage.deleteManyByIds).not.toHaveBeenCalled();
  });

  it('returns results in input ID order', async () => {
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
  it('does not call replaceMany when version conflicts', async () => {
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

  it('omits _version from replaceMany call when skipConcurrencyCheck: true', async () => {
    const deps = makeDeps({
      fetchByIds: vi.fn().mockResolvedValue([doc('id-1', 'Alice', 5n)]),
      replaceMany: vi.fn().mockResolvedValue(replaceResult(['id-1'])),
    });
    const handle = DocumentCommandHandler(deps);

    await handle(['id-1'], (d) => ({ ...d!, name: 'Forced' }), {
      skipConcurrencyCheck: true,
    });

    expect(deps.storage.replaceMany).toHaveBeenCalledWith(
      [{ _id: 'id-1', name: 'Forced' }],
      expect.anything(),
    );
  });
});

describe('handle — parallel option', () => {
  it('calls all handlers before any storage write when parallel: true', async () => {
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

  it('calls handlers sequentially by default', async () => {
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

  it('allows concurrent handlers when parallel: true', async () => {
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
    it('returns unsuccessful when another process inserts the same document first (single)', async () => {
      const deps = makeDeps({
        fetchByIds: vi.fn().mockResolvedValue([null]),
        insertMany: vi.fn().mockResolvedValue(insertResult([])),
      });
      const handle = DocumentCommandHandler(deps);

      const result = await handle('id-1', () => ({ name: 'X' }));

      expect(result.successful).toBe(false);
      expect(result.document).toBeNull();
    });

    it('marks only the conflicting inserts as unsuccessful (batch)', async () => {
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
    it('returns unsuccessful when storage rejects the write due to concurrent modification (single)', async () => {
      const deps = makeDeps({
        fetchByIds: vi.fn().mockResolvedValue([doc('id-1', 'Alice')]),
        replaceMany: vi.fn().mockResolvedValue(replaceResult([])),
      });
      const handle = DocumentCommandHandler(deps);

      const result = await handle('id-1', (d) => ({ ...d!, name: 'Bob' }));

      expect(result.successful).toBe(false);
      expect((result.document as TestDoc).name).toBe('Alice');
    });

    it('marks only the conflicting replaces as unsuccessful (batch)', async () => {
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
    it('returns unsuccessful when storage rejects the delete due to concurrent modification (single)', async () => {
      const deps = makeDeps({
        fetchByIds: vi.fn().mockResolvedValue([doc('id-1', 'Alice')]),
        deleteManyByIds: vi.fn().mockResolvedValue(deleteResult([])),
      });
      const handle = DocumentCommandHandler(deps);

      const result = await handle('id-1', () => null);

      expect(result.successful).toBe(false);
    });

    it('marks only the conflicting deletes as unsuccessful (batch)', async () => {
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
  it('returns empty array for empty ID array', async () => {
    const deps = makeDeps();
    const handle = DocumentCommandHandler(deps);

    const results = await handle([], () => ({ name: 'X' }));

    expect(results).toEqual([]);
    expect(deps.storage.fetchByIds).not.toHaveBeenCalled();
  });

  it('returns single-element array (not unwrapped) for single-element array', async () => {
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
