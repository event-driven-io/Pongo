import assert from 'assert';
import { describe, it } from 'vitest';
import {
  InvalidOperationError,
  JSONSerializer,
  type AnyConnection,
} from '../../../../core';
import type { PgClient } from './connection';
import { pgTransaction, type PgTransactionOptions } from './transaction';

const fakePgClient = (shownStatementTimeout = '5s') => {
  const calls: string[] = [];

  const client = {
    query: (text: string) => {
      calls.push(text);
      return Promise.resolve(
        text.includes("current_setting('statement_timeout')")
          ? [
              { rowCount: null, rows: [] },
              {
                rowCount: 1,
                rows: [{ statement_timeout: shownStatementTimeout }],
              },
            ]
          : { rowCount: null, rows: [] },
      );
    },
  };

  return { client: client as unknown as PgClient, calls };
};

const transactionFor = (client: PgClient, options: PgTransactionOptions) =>
  pgTransaction(
    () => ({}) as AnyConnection,
    JSONSerializer,
  )({
    client: Promise.resolve(client),
    options,
    onTransactionFinished: () => {},
  });

describe('pg transaction', () => {
  describe('without statementTimeoutMS', () => {
    it('begins and commits with plain BEGIN and COMMIT', async () => {
      const { client, calls } = fakePgClient();
      const transaction = transactionFor(client, {});

      await transaction.begin();
      await transaction.commit();

      assert.deepStrictEqual(calls, ['BEGIN', 'COMMIT']);
    });

    it('rolls back with plain ROLLBACK', async () => {
      const { client, calls } = fakePgClient();
      const transaction = transactionFor(client, {});

      await transaction.begin();
      await transaction.rollback();

      assert.deepStrictEqual(calls, ['BEGIN', 'ROLLBACK']);
    });

    it('begins with the isolation level and READ ONLY', async () => {
      const { client, calls } = fakePgClient();
      const transaction = transactionFor(client, {
        isolationLevel: 'SERIALIZABLE',
        readonly: true,
      });

      await transaction.begin();
      await transaction.commit();

      assert.deepStrictEqual(calls, [
        'BEGIN ISOLATION LEVEL SERIALIZABLE READ ONLY',
        'COMMIT',
      ]);
    });
  });

  describe('with statementTimeoutMS', () => {
    it('sets a local statement timeout on begin and restores the previous one on commit', async () => {
      const { client, calls } = fakePgClient();
      const transaction = transactionFor(client, { statementTimeoutMS: 50 });

      await transaction.begin();
      await transaction.commit();

      assert.deepStrictEqual(calls, [
        "BEGIN; SELECT current_setting('statement_timeout') AS statement_timeout, set_config('statement_timeout', '50', true)",
        "COMMIT; SELECT set_config('statement_timeout', '5s', false)",
      ]);
    });

    it('rolls back with plain ROLLBACK', async () => {
      const { client, calls } = fakePgClient();
      const transaction = transactionFor(client, { statementTimeoutMS: 50 });

      await transaction.begin();
      await transaction.rollback();

      assert.deepStrictEqual(calls, [
        "BEGIN; SELECT current_setting('statement_timeout') AS statement_timeout, set_config('statement_timeout', '50', true)",
        'ROLLBACK',
      ]);
    });

    it('begins with the isolation level and READ ONLY before setting the timeout', async () => {
      const { client, calls } = fakePgClient();
      const transaction = transactionFor(client, {
        isolationLevel: 'SERIALIZABLE',
        readonly: true,
        statementTimeoutMS: 50,
      });

      await transaction.begin();

      assert.deepStrictEqual(calls, [
        "BEGIN ISOLATION LEVEL SERIALIZABLE READ ONLY; SELECT current_setting('statement_timeout') AS statement_timeout, set_config('statement_timeout', '50', true)",
      ]);
    });

    it('doubles single quotes in the restored statement timeout', async () => {
      const { client, calls } = fakePgClient("5s'x");
      const transaction = transactionFor(client, { statementTimeoutMS: 50 });

      await transaction.begin();
      await transaction.commit();

      assert.strictEqual(
        calls[1],
        "COMMIT; SELECT set_config('statement_timeout', '5s''x', false)",
      );
    });

    it.each([-1, 1.5, 2147483648])(
      'rejects statementTimeoutMS %s on begin without sending anything',
      async (statementTimeoutMS) => {
        const { client, calls } = fakePgClient();
        const transaction = transactionFor(client, { statementTimeoutMS });

        await assert.rejects(() => transaction.begin(), InvalidOperationError);

        assert.deepStrictEqual(calls, []);
      },
    );
  });
});
