import { describe, it } from 'vitest';
import { JSONSerializer } from '../../../core';
import { assertRejectsDumboError } from '../../../core/errors/errorAssertions';
import type { D1Client, D1Connection } from './connections';
import { d1Pool } from './pool';
import { d1Transaction } from './transactions';

describe('D1 errors', () => {
  it('reports a pool without a database or connection as an InvalidOperationError', async () => {
    const pool = d1Pool({});

    await assertRejectsDumboError(() => pool.connection(), {
      errorType: 'InvalidOperationError',
      errorCode: 400,
      message: 'D1 database or connection is required',
    });
  });

  it('reports executing before begin() as an InvalidOperationError', async () => {
    const client = {
      withSession: () => Promise.resolve({} as D1Client),
    } as unknown as D1Client;

    const transaction = d1Transaction(
      () => ({}) as D1Connection,
      JSONSerializer.from({}),
    )(Promise.resolve(client), {
      close: () => Promise.resolve(),
      mode: 'session_based',
    });

    await assertRejectsDumboError(
      () => transaction.execute.query({} as never),
      {
        errorType: 'InvalidOperationError',
        errorCode: 400,
        message: 'Transaction has not been started. Call begin() first.',
      },
    );
  });
});
