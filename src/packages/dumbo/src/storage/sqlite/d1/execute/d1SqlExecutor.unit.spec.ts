import assert from 'assert';
import { describe, it } from 'vitest';
import { SQL, type QueryResult } from '../../../../core';
import type { D1Client } from '../connections';
import { d1SQLExecutor } from './d1SqlExecutor';

const clientReturning = (rows: Record<string, unknown>[]): D1Client =>
  ({
    query: () => Promise.resolve({ rowCount: rows.length, rows }),
    batchQuery: (sqls: SQL[]) =>
      Promise.resolve(
        sqls.map((): QueryResult => ({ rowCount: rows.length, rows })),
      ),
  }) as unknown as D1Client;

const mapping = {
  data: (value: unknown): unknown => JSON.parse(value as string),
};

describe('d1SQLExecutor', () => {
  it('query returns rows mapped with the mapping option', async () => {
    const client = clientReturning([{ id: 1, data: '{"name":"David"}' }]);

    const result = await d1SQLExecutor().query(client, SQL`SELECT 1`, {
      mapping,
    });

    assert.deepStrictEqual(result.rows, [{ id: 1, data: { name: 'David' } }]);
  });

  it('batchQuery returns rows mapped with the mapping option', async () => {
    const client = clientReturning([{ id: 1, data: '{"name":"David"}' }]);

    const results = await d1SQLExecutor().batchQuery(
      client,
      [SQL`SELECT 1`, SQL`SELECT 2`],
      { mapping },
    );

    assert.deepStrictEqual(
      results.map((result) => result.rows),
      [
        [{ id: 1, data: { name: 'David' } }],
        [{ id: 1, data: { name: 'David' } }],
      ],
    );
  });
});
