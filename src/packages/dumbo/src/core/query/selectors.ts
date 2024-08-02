import type { QueryResult, QueryResultRow } from './query';

export const firstOrNull = async <
  Result extends QueryResultRow = QueryResultRow,
>(
  getResult: Promise<QueryResult<Result>>,
): Promise<Result | null> => {
  const result = await getResult;

  return result.rows.length > 0 ? result.rows[0] ?? null : null;
};

export const first = async <Result extends QueryResultRow = QueryResultRow>(
  getResult: Promise<QueryResult<Result>>,
): Promise<Result> => {
  const result = await getResult;

  if (result.rows.length === 0)
    throw new Error("Query didn't return any result");

  return result.rows[0]!;
};

export const singleOrNull = async <
  Result extends QueryResultRow = QueryResultRow,
>(
  getResult: Promise<QueryResult<Result>>,
): Promise<Result | null> => {
  const result = await getResult;

  if (result.rows.length > 1) throw new Error('Query had more than one result');

  return result.rows.length > 0 ? result.rows[0] ?? null : null;
};

export const single = async <Result extends QueryResultRow = QueryResultRow>(
  getResult: Promise<QueryResult<Result>>,
): Promise<Result> => {
  const result = await getResult;

  if (result.rows.length === 0)
    throw new Error("Query didn't return any result");

  if (result.rows.length > 1) throw new Error('Query had more than one result');

  return result.rows[0]!;
};

export type ExistsSQLQueryResult = { exists: boolean };

export const exists = async (
  getResult: Promise<QueryResult<ExistsSQLQueryResult>>,
): Promise<boolean> => {
  const result = await single(getResult);

  return result.exists === true;
};
