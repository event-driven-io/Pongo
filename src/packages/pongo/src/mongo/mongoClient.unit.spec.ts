import { DumboError } from '@event-driven-io/dumbo';
import assert from 'node:assert';
import { describe, it } from 'vitest';
import { MongoClient } from './mongoClient';

describe('MongoClient', () => {
  it('rejects a connection string without a registered Pongo driver', () => {
    assert.throws(
      () => new MongoClient('postgresql://localhost:5432/postgres'),
      (error: unknown) => {
        assert.ok(DumboError.isInstanceOf(error));
        assert.strictEqual(error.errorType, 'PongoError');
        assert.strictEqual(error.errorCode, 500);
        assert.match(error.message, /No database driver registered for/);
        return true;
      },
    );
  });
});
