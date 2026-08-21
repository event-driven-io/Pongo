import { DumboError } from '@event-driven-io/dumbo';
import type { Document } from 'mongodb';
import assert from 'node:assert';
import { describe, it } from 'vitest';
import type { PongoCollection } from '../core';
import type { Db as ShimDb } from '../shim';
import { Collection } from './mongoCollection';

const notImplementedCollection = () =>
  new Collection<Document>({} as ShimDb, {} as PongoCollection<Document>);

const assertNotImplementedError = (error: unknown): void => {
  if (!DumboError.isInstanceOf(error)) {
    assert.fail(`Expected a DumboError, got: ${String(error)}`);
  }

  assert.equal(error.errorType, 'NotImplementedError');
  assert.equal(error.errorCode, 501);
  assert.equal(error.message, 'Method not implemented.');
};

type SyncMember = {
  name: string;
  invoke: (collection: Collection<Document>) => unknown;
};

type AsyncMember = {
  name: string;
  invoke: (collection: Collection<Document>) => Promise<unknown>;
};

const settersAndSyncMembers: SyncMember[] = [
  {
    name: 'set hint',
    invoke: (collection) => {
      collection.hint = undefined;
    },
  },
  { name: 'listIndexes', invoke: (collection) => collection.listIndexes() },
  { name: 'aggregate', invoke: (collection) => collection.aggregate() },
  { name: 'watch', invoke: (collection) => collection.watch() },
  {
    name: 'initializeUnorderedBulkOp',
    invoke: (collection) => collection.initializeUnorderedBulkOp(),
  },
  {
    name: 'initializeOrderedBulkOp',
    invoke: (collection) => collection.initializeOrderedBulkOp(),
  },
  {
    name: 'listSearchIndexes',
    invoke: (collection) => collection.listSearchIndexes(),
  },
];

const promiseReturningMembers: AsyncMember[] = [
  { name: 'bulkWrite', invoke: (collection) => collection.bulkWrite([]) },
  { name: 'options', invoke: (collection) => collection.options() },
  { name: 'isCapped', invoke: (collection) => collection.isCapped() },
  {
    name: 'createIndex',
    invoke: (collection) => collection.createIndex('name'),
  },
  {
    name: 'createIndexes',
    invoke: (collection) => collection.createIndexes([]),
  },
  { name: 'dropIndex', invoke: (collection) => collection.dropIndex('name') },
  { name: 'dropIndexes', invoke: (collection) => collection.dropIndexes() },
  {
    name: 'indexExists',
    invoke: (collection) => collection.indexExists('name'),
  },
  {
    name: 'indexInformation',
    invoke: (collection) => collection.indexInformation(),
  },
  { name: 'distinct', invoke: (collection) => collection.distinct('_id') },
  { name: 'indexes', invoke: (collection) => collection.indexes() },
  {
    name: 'createSearchIndex',
    invoke: (collection) => collection.createSearchIndex({ definition: {} }),
  },
  {
    name: 'createSearchIndexes',
    invoke: (collection) => collection.createSearchIndexes([]),
  },
  {
    name: 'dropSearchIndex',
    invoke: (collection) => collection.dropSearchIndex('name'),
  },
  {
    name: 'updateSearchIndex',
    invoke: (collection) => collection.updateSearchIndex('name', {}),
  },
];

describe('Mongo Collection shim unsupported members', () => {
  describe('setters and synchronously returning members', () => {
    for (const { name, invoke } of settersAndSyncMembers) {
      it(`${name} throws NotImplementedError`, () => {
        let thrown: unknown = undefined;

        try {
          invoke(notImplementedCollection());
        } catch (error) {
          thrown = error;
        }

        assertNotImplementedError(thrown);
      });
    }
  });

  describe('members declared to return a Promise', () => {
    for (const { name, invoke } of promiseReturningMembers) {
      it(`${name} throws NotImplementedError`, async () => {
        let thrown: unknown = undefined;

        try {
          await invoke(notImplementedCollection());
        } catch (error) {
          thrown = error;
        }

        assertNotImplementedError(thrown);
      });
    }
  });
});
