import assert from 'assert';
import { describe, it } from 'vitest';
import {
  JSONSerializer,
  QueryCanceledError,
  SQL,
  sqlExecutor,
} from '../../../../core';
import type { PgClientOrPoolClient } from '../connections';
import { pgQueryStatements, pgSQLExecutor } from './execute';

type RecordedCall = { text: string; params?: unknown[] };

const showAndSetStatementTimeoutResult = [
  { rowCount: null, rows: [{ statement_timeout: '5s' }] },
  { rowCount: null, rows: [] },
];

const respondAsPostgres = (text: string) =>
  text.startsWith('SHOW statement_timeout;')
    ? showAndSetStatementTimeoutResult
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

  describe('with timeoutMs', () => {
    const setStatementTimeout = {
      text: 'SHOW statement_timeout; SET statement_timeout = 50',
    };
    const restoreStatementTimeout = {
      text: "SELECT set_config('statement_timeout', $1, false)",
      params: ['5s'],
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

describe('pgQueryStatements', () => {
  it('sends all statements joined in one query and returns a result per statement', async () => {
    const { client, calls } = fakePgClient();

    const results = await pgQueryStatements(client, [
      'SHOW statement_timeout',
      'SET statement_timeout = 50',
    ]);

    assert.deepStrictEqual(calls, [
      { text: 'SHOW statement_timeout; SET statement_timeout = 50' },
    ]);
    assert.deepStrictEqual(results, showAndSetStatementTimeoutResult);
  });

  it('returns a one-element list for a single statement', async () => {
    const { client, calls } = fakePgClient();

    const results = await pgQueryStatements(client, ['COMMIT']);

    assert.deepStrictEqual(calls, [{ text: 'COMMIT' }]);
    assert.deepStrictEqual(results, [{ rowCount: 0, rows: [] }]);
  });
});
