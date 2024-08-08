import format from './pg-format';
// TODO: add core formatter, when adding other database type

export type SQL = string & { __brand: 'sql' };

export const sql = (sqlQuery: string, ...params: unknown[]): SQL => {
  return format(sqlQuery, ...params) as SQL;
};

export const rawSql = (sqlQuery: string): SQL => {
  return sqlQuery as SQL;
};
