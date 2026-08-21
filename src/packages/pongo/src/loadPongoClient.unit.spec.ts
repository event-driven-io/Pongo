import { DumboError } from '@event-driven-io/dumbo';
import assert from 'node:assert';
import { describe, it, vi } from 'vitest';
import { loadPongoClient } from './index';

vi.mock('./pg', () => ({ pongoDriver: undefined }));

describe('loadPongoClient', () => {
  it('rejects an unknown driver path', async () => {
    await assert.rejects(
      () => loadPongoClient('unknown' as 'pg'),
      (error: unknown) => {
        assert.ok(DumboError.isInstanceOf(error));
        assert.strictEqual(error.errorType, 'PongoError');
        assert.strictEqual(error.errorCode, 500);
        assert.strictEqual(error.message, 'Unknown path: unknown');
        return true;
      },
    );
  });

  it('rejects a module that does not expose a Pongo driver', async () => {
    await assert.rejects(() => loadPongoClient('pg'), {
      message: 'Failed to load Pongo client for pg',
      errorType: 'PongoError',
      errorCode: 500,
    });
  });
});
