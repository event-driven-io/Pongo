import type { QueryResult, QueryResultRow } from './query';

export const mapRows = async <
  Result extends QueryResultRow = QueryResultRow,
  Mapped = unknown,
>(
  getResult: Promise<QueryResult<Result>>,
  map: (row: Result) => Mapped,
): Promise<Mapped[]> => {
  const result = await getResult;

  return result.rows.map(map);
};

export const toCamelCase = (snakeStr: string): string =>
  snakeStr.replace(/_([a-z])/g, (g) => g[1]?.toUpperCase() ?? '');

export const mapToCamelCase = <T extends Record<string, unknown>>(
  obj: Record<string, unknown>,
): T => {
  const newObj: Record<string, unknown> = {};
  for (const key in obj) {
    if (Object.prototype.hasOwnProperty.call(obj, key)) {
      newObj[toCamelCase(key)] = obj[key];
    }
  }
  return newObj as T;
};
