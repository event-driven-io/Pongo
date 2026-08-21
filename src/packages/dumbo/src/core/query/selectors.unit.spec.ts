import assert from 'node:assert';
import { describe, it } from 'vitest';
import { DataError } from '../errors';
import { assertRejectsDumboError } from '../errors/errorAssertions';
import type { QueryResult, QueryResultRow } from './query';
import { first, single, singleOrNull } from './selectors';

const queryResult = <Result extends QueryResultRow = QueryResultRow>(
  rows: Result[],
): Promise<QueryResult<Result>> =>
  Promise.resolve({ rowCount: rows.length, rows });

describe('selecting a single row from a query result', () => {
  describe('first', () => {
    it('returns the first row', async () => {
      assert.deepStrictEqual(await first(queryResult([{ id: 1 }, { id: 2 }])), {
        id: 1,
      });
    });

    it('fails with a DataError when there are no rows', () =>
      assertRejectsDumboError(() => first(queryResult([])), {
        errorType: DataError.ErrorType,
        errorCode: 400,
        message: "Query didn't return any result",
      }));
  });

  describe('singleOrNull', () => {
    it('returns null when there are no rows', async () => {
      assert.strictEqual(await singleOrNull(queryResult([])), null);
    });

    it('fails with a DataError when there is more than one row', () =>
      assertRejectsDumboError(
        () => singleOrNull(queryResult([{ id: 1 }, { id: 2 }])),
        {
          errorType: DataError.ErrorType,
          errorCode: 400,
          message: 'Query had more than one result',
        },
      ));
  });

  describe('single', () => {
    it('returns the only row', async () => {
      assert.deepStrictEqual(await single(queryResult([{ id: 1 }])), { id: 1 });
    });

    it('fails with a DataError when there are no rows', () =>
      assertRejectsDumboError(() => single(queryResult([])), {
        errorType: DataError.ErrorType,
        errorCode: 400,
        message: "Query didn't return any result",
      }));

    it('fails with a DataError when there is more than one row', () =>
      assertRejectsDumboError(
        () => single(queryResult([{ id: 1 }, { id: 2 }])),
        {
          errorType: DataError.ErrorType,
          errorCode: 400,
          message: 'Query had more than one result',
        },
      ));
  });
});
