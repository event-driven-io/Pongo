import { ParametrizedSQL, isParametrizedSQL } from './parametrizedSQL';
import { describeSQL, formatSQL } from './sqlFormatter';
import { SQLIdentifier, SQLIn, SQLPlain } from './tokens';

export type SQL = string & { __brand: 'sql' };

export function SQL(strings: TemplateStringsArray, ...values: unknown[]): SQL {
  const parametrized = ParametrizedSQL(strings, values);
  return parametrized as unknown as SQL;
}

export const isSQL = (value: unknown): value is SQL => {
  if (value === undefined || value === null) {
    return false;
  }

  return isParametrizedSQL(value);
};

const emptySQL = {
  __brand: 'parametrized-sql',
  sqlChunks: [''],
  sqlTokens: [],
} satisfies ParametrizedSQL as unknown as SQL;

const mergeSQL = (sqls: SQL[], separator: string = ' '): SQL => {
  const parametrized = sqls
    .filter((sql) => !isEmpty(sql))
    .map((sql) => sql as unknown as ParametrizedSQL);

  const params = parametrized.flatMap((p) => p.sqlTokens);
  const sqlChunks = parametrized.flatMap((p, i) =>
    i == parametrized.length - 1 || separator === ''
      ? p.sqlChunks
      : [...p.sqlChunks, separator],
  );

  const merged: ParametrizedSQL =
    sqlChunks.length > 0
      ? {
          __brand: 'parametrized-sql',
          sqlChunks: sqlChunks,
          sqlTokens: params,
        }
      : ParametrizedSQL.empty;

  return merged as unknown as SQL;
};

const concatSQL = (...sqls: SQL[]): SQL => mergeSQL(sqls, '');

const isEmpty = (sql: SQL): boolean => {
  if (isParametrizedSQL(sql)) {
    const parametrized = sql as unknown as ParametrizedSQL;
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
SQL.format = formatSQL;
SQL.describe = describeSQL;
SQL.in = (column: string, values: unknown[]) => SQLIn.from({ column, values });
SQL.identifier = SQLIdentifier.from;
SQL.plain = SQLPlain.from;

SQL.check = {
  isSQL,
  isParametrizedSQL: (value: unknown) => isParametrizedSQL(value),
  isEmpty,
  isIdentifier: SQLIdentifier.check,
  isPlain: SQLPlain.check,
  isSQLIn: SQLIn.check,
};
