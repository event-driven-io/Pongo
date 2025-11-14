import {
  describeSQL,
  formatSQL,
  SQLFormatter,
  type FormatSQLOptions,
} from './formatters';
import type { ParametrizedSQL } from './parametrizedSQL';
import { isTokenizedSQL, TokenizedSQL } from './tokenizedSQL';
import {
  SQLColumnToken,
  SQLColumnTypeTokensFactory,
  SQLIdentifier,
  SQLIn,
  SQLPlain,
} from './tokens';

export type SQL = string & { __brand: 'sql' };

export function SQL(strings: TemplateStringsArray, ...values: unknown[]): SQL {
  const parametrized = TokenizedSQL(strings, values);
  return parametrized as unknown as SQL;
}

export const isSQL = (value: unknown): value is SQL => {
  if (value === undefined || value === null) {
    return false;
  }

  return isTokenizedSQL(value);
};

const emptySQL = {
  __brand: 'tokenized-sql',
  sqlChunks: [''],
  sqlTokens: [],
} satisfies TokenizedSQL as unknown as SQL;

const mergeSQL = (sqls: SQL[], separator: string = ' '): SQL => {
  const parametrized = sqls
    .filter((sql) => !isEmpty(sql))
    .map((sql) => sql as unknown as TokenizedSQL);

  const params = parametrized.flatMap((p) => p.sqlTokens);
  const sqlChunks = parametrized.flatMap((p, i) =>
    i == parametrized.length - 1 || separator === ''
      ? p.sqlChunks
      : [...p.sqlChunks, separator],
  );

  const merged: TokenizedSQL =
    sqlChunks.length > 0
      ? {
          __brand: 'tokenized-sql',
          sqlChunks: sqlChunks,
          sqlTokens: params,
        }
      : TokenizedSQL.empty;

  return merged as unknown as SQL;
};

const concatSQL = (...sqls: SQL[]): SQL => mergeSQL(sqls, '');

const isEmpty = (sql: SQL): boolean => {
  if (isTokenizedSQL(sql)) {
    const parametrized = sql as unknown as TokenizedSQL;
    return (
      parametrized.sqlChunks.every((chunk) => chunk.trim() === '') &&
      parametrized.sqlTokens.length === 0
    );
  }

  return false;
};

SQL.EMPTY = emptySQL;
SQL.concat = concatSQL;
SQL.merge = mergeSQL;
SQL.format = (
  sql: SQL | SQL[],
  formatter: SQLFormatter,
  options?: FormatSQLOptions,
): ParametrizedSQL => formatSQL(sql, formatter, options);
SQL.describe = (
  sql: SQL | SQL[],
  formatter: SQLFormatter,
  options?: FormatSQLOptions,
): string => describeSQL(sql, formatter, options);
SQL.in = (column: string, values: unknown[]) => SQLIn.from({ column, values });
SQL.identifier = SQLIdentifier.from;
SQL.plain = SQLPlain.from;

SQL.check = {
  isSQL,
  isTokenizedSQL: (value: unknown) => isTokenizedSQL(value),
  isEmpty,
  isIdentifier: SQLIdentifier.check,
  isPlain: SQLPlain.check,
  isSQLIn: SQLIn.check,
};

const columnFactory: typeof SQLColumnToken.from & {
  type: typeof SQLColumnTypeTokensFactory;
} = SQLColumnToken.from as unknown as typeof SQLColumnToken.from & {
  type: typeof SQLColumnTypeTokensFactory;
};
columnFactory.type =
  SQLColumnTypeTokensFactory as unknown as typeof SQLColumnTypeTokensFactory;

SQL.column = columnFactory;
