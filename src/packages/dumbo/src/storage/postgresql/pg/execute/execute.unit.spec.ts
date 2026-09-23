import assert from 'assert';
import { describe, it } from 'vitest';
import {
  BatchCommandNoChangesError,
  InvalidOperationError,
  JSONSerializer,
  QueryCanceledError,
  SQL,
  sqlExecutor,
} from '../../../../core';
import type { PgClientOrPoolClient } from '../connections';
import { pgSQLExecutor } from './execute';

type RecordedCall = { text: string; params?: unknown[] };

const respondAsPostgres = (text: string) =>
  text.startsWith("SELECT current_setting('statement_timeout')")
    ? { rowCount: 1, rows: [{ statement_timeout: '5s' }] }
    : { rowCount: 0, rows: [] };

const fakePgClient = (
  respond: (text: string) => unknown = respondAsPostgres,
) => {
  const calls: RecordedCall[] = [];

  const client = {
    query: (text: string, params?: unknown[]) => {
      calls.push(params ? { text, params } : { text });
      return new Promise((resolve) => resolve(respond(text)));
    },
  };

  return { client: client as unknown as PgClientOrPoolClient, calls };
};

const executorFor = (client: PgClientOrPoolClient) =>
  sqlExecutor(pgSQLExecutor({ serializer: JSONSerializer }), {
    connect: () => Promise.resolve(client),
  });

describe('pg SQL executor', () => {
  describe('without timeoutMs', () => {
    it('query sends only its statement', async () => {
      const { client, calls } = fakePgClient();

      await executorFor(client).query(SQL`SELECT 1`);

      assert.deepStrictEqual(calls, [{ text: 'SELECT 1' }]);
    });

    it('batchQuery sends only its statements', async () => {
      const { client, calls } = fakePgClient();

      await executorFor(client).batchQuery([SQL`SELECT 1`, SQL`SELECT 2`]);

      assert.deepStrictEqual(calls, [
        { text: 'SELECT 1' },
        { text: 'SELECT 2' },
      ]);
    });

    it('command sends only its statement', async () => {
      const { client, calls } = fakePgClient();

      await executorFor(client).command(SQL`DELETE FROM users`);

      assert.deepStrictEqual(calls, [{ text: 'DELETE FROM users' }]);
    });

    it('batchCommand sends only its statements', async () => {
      const { client, calls } = fakePgClient();

      await executorFor(client).batchCommand([
        SQL`DELETE FROM users`,
        SQL`DELETE FROM roles`,
      ]);

      assert.deepStrictEqual(calls, [
        { text: 'DELETE FROM users' },
        { text: 'DELETE FROM roles' },
      ]);
    });
  });

  describe('with multiple statements in one SQL', () => {
    const respondWithResultPerStatement = () => [
      { rowCount: null, rows: [] },
      { rowCount: 1, rows: [{ value: 1 }] },
    ];

    it('query returns the rows of the last statement', async () => {
      const { client } = fakePgClient(respondWithResultPerStatement);

      const result = await executorFor(client).query(
        SQL`BEGIN; SELECT 1 AS value`,
      );

      assert.deepStrictEqual(result, { rowCount: 1, rows: [{ value: 1 }] });
    });

    it('command returns the rows of the last statement', async () => {
      const { client } = fakePgClient(respondWithResultPerStatement);

      const result = await executorFor(client).command(
        SQL`BEGIN; SELECT 1 AS value`,
      );

      assert.deepStrictEqual(result, { rowCount: 1, rows: [{ value: 1 }] });
    });

    it('batchCommand with assertChanges fails when the last statement changes no rows', async () => {
      const { client } = fakePgClient(() => [
        { rowCount: 1, rows: [] },
        { rowCount: 0, rows: [] },
      ]);

      await assert.rejects(
        () =>
          executorFor(client).batchCommand(
            [SQL`DELETE FROM users; DELETE FROM roles`],
            { assertChanges: true },
          ),
        BatchCommandNoChangesError,
      );
    });

    it('batchCommand with assertChanges succeeds when the last statement changes rows', async () => {
      const { client } = fakePgClient(() => [
        { rowCount: 0, rows: [] },
        { rowCount: 1, rows: [] },
      ]);

      const [result] = await executorFor(client).batchCommand(
        [SQL`DELETE FROM users; DELETE FROM roles`],
        { assertChanges: true },
      );

      assert.strictEqual(result!.rowCount, 1);
    });
  });

  describe('with timeoutMs', () => {
    const setStatementTimeout = {
      text: "SELECT current_setting('statement_timeout') AS statement_timeout, set_config('statement_timeout', '50', false)",
    };
    const restoreStatementTimeout = {
      text: "SELECT set_config('statement_timeout', '5s', false)",
    };

    it('query sets the timeout, runs its statement, then restores the previous timeout', async () => {
      const { client, calls } = fakePgClient();

      await executorFor(client).query(SQL`SELECT 1`, { timeoutMs: 50 });

      assert.deepStrictEqual(calls, [
        setStatementTimeout,
        { text: 'SELECT 1' },
        restoreStatementTimeout,
      ]);
    });

    it('batchQuery sets the timeout, runs its statements, then restores the previous timeout', async () => {
      const { client, calls } = fakePgClient();

      await executorFor(client).batchQuery([SQL`SELECT 1`, SQL`SELECT 2`], {
        timeoutMs: 50,
      });

      assert.deepStrictEqual(calls, [
        setStatementTimeout,
        { text: 'SELECT 1' },
        { text: 'SELECT 2' },
        restoreStatementTimeout,
      ]);
    });

    it('command sets the timeout, runs its statement, then restores the previous timeout', async () => {
      const { client, calls } = fakePgClient();

      await executorFor(client).command(SQL`DELETE FROM users`, {
        timeoutMs: 50,
      });

      assert.deepStrictEqual(calls, [
        setStatementTimeout,
        { text: 'DELETE FROM users' },
        restoreStatementTimeout,
      ]);
    });

    it('batchCommand sets the timeout, runs its statements, then restores the previous timeout', async () => {
      const { client, calls } = fakePgClient();

      await executorFor(client).batchCommand(
        [SQL`DELETE FROM users`, SQL`DELETE FROM roles`],
        { timeoutMs: 50 },
      );

      assert.deepStrictEqual(calls, [
        setStatementTimeout,
        { text: 'DELETE FROM users' },
        { text: 'DELETE FROM roles' },
        restoreStatementTimeout,
      ]);
    });

    it('restores the previous timeout when a statement fails', async () => {
      const { client, calls } = fakePgClient((text) => {
        if (text === 'SELECT 1')
          throw Object.assign(new Error('canceling statement'), {
            code: '57014',
          });
        return respondAsPostgres(text);
      });

      await assert.rejects(
        () => executorFor(client).query(SQL`SELECT 1`, { timeoutMs: 50 }),
        QueryCanceledError,
      );

      assert.deepStrictEqual(calls, [
        setStatementTimeout,
        { text: 'SELECT 1' },
        restoreStatementTimeout,
      ]);
    });

    it.each([-1, 1.5])(
      'rejects timeoutMs %s without sending anything',
      async (timeoutMs) => {
        const { client, calls } = fakePgClient();

        await assert.rejects(
          () => executorFor(client).query(SQL`SELECT 1`, { timeoutMs }),
          InvalidOperationError,
        );

        assert.deepStrictEqual(calls, []);
      },
    );

    it('throws the mapped error and sends nothing else when setting the timeout fails', async () => {
      const { client, calls } = fakePgClient((text) => {
        if (text.startsWith("SELECT current_setting('statement_timeout')"))
          throw Object.assign(new Error('canceling statement'), {
            code: '57014',
          });
        return respondAsPostgres(text);
      });

      await assert.rejects(
        () => executorFor(client).query(SQL`SELECT 1`, { timeoutMs: 50 }),
        QueryCanceledError,
      );

      assert.deepStrictEqual(calls, [setStatementTimeout]);
    });

    it('throws the failed statement error when restoring the previous timeout fails too', async () => {
      const { client } = fakePgClient((text) => {
        if (text === 'DELETE FROM users')
          throw Object.assign(new Error('canceling statement'), {
            code: '57014',
          });
        if (text.startsWith('SELECT set_config'))
          throw Object.assign(new Error('transaction is aborted'), {
            code: '25P02',
          });
        return respondAsPostgres(text);
      });

      await assert.rejects(
        () =>
          executorFor(client).command(SQL`DELETE FROM users`, {
            timeoutMs: 50,
          }),
        QueryCanceledError,
      );
    });
  });
});
