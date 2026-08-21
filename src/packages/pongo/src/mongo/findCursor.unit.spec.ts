import { DumboError } from '@event-driven-io/dumbo';
import assert from 'node:assert';
import { describe, it } from 'vitest';
import { FindCursor } from './findCursor';

describe('FindCursor', () => {
  it('rejects checking for the next document before documents were fetched', () => {
    const cursor = new FindCursor(Promise.resolve([{ _id: 'a' }]));

    assert.throws(
      () => cursor.hasNext(),
      (error: unknown) => {
        assert.ok(DumboError.isInstanceOf(error));
        assert.strictEqual(error.errorType, 'PongoError');
        assert.strictEqual(error.errorCode, 500);
        assert.strictEqual(error.message, 'Error while fetching documents');
        return true;
      },
    );
  });
});
