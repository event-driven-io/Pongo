import { ParametrizedSQL, isParametrizedSQL } from './parametrizedSQL';
import { formatSQLRaw } from './sqlFormatter';

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

const ID = Symbol.for('SQL_IDENTIFIER');
const RAW = Symbol.for('SQL_RAW');
const LITERAL = Symbol.for('SQL_LITERAL');

type SQLIdentifier = { [ID]: true; value: string };
type SQLPlain = { [RAW]: true; value: string };
type SQLLiteral = { [LITERAL]: true; value: unknown };

const emptySQL = {
  __brand: 'parametrized-sql',
  sqlChunks: [''],
  values: [],
} satisfies ParametrizedSQL as unknown as SQL;

const mergeSQL = (sqls: SQL[], separator: string = ' '): SQL => {
  const parametrized = sqls
    .filter((sql) => !isEmpty(sql))
    .map((sql) => sql as unknown as ParametrizedSQL);

  const params = parametrized.flatMap((p) => p.values);
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
          values: params,
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
      parametrized.values.length === 0
    );
  }

  return false;
};

function identifier(value: string): SQLIdentifier {
  return { [ID]: true, value };
}

function plain(value: string): SQLPlain {
  return { [RAW]: true, value };
}

function literal(value: unknown): SQLLiteral {
  return { [LITERAL]: true, value };
}

// Type guards
const isIdentifier = (value: unknown): value is SQLIdentifier => {
  return value !== null && typeof value === 'object' && ID in value;
};

const isPlain = (value: unknown): value is SQLPlain => {
  return value !== null && typeof value === 'object' && RAW in value;
};

const isLiteral = (value: unknown): value is SQLLiteral => {
  return value !== null && typeof value === 'object' && LITERAL in value;
};

const SQLIN = Symbol.for('SQL_IN');
export type SQLIn = { [SQLIN]: true; column: SQLIdentifier; values: unknown[] };

function sqlIn(column: string, values: unknown[]): SQLIn {
  return { [SQLIN]: true, column: identifier(column), values };
}

const isSQLIn = (value: unknown): value is SQLIn => {
  return value !== null && typeof value === 'object' && SQLIN in value;
};

SQL.EMPTY = emptySQL;
SQL.concat = concatSQL;
SQL.merge = mergeSQL;
SQL.format = formatSQLRaw;
SQL.in = sqlIn;
SQL.identifier = identifier;
SQL.plain = plain;
SQL.literal = literal;

SQL.check = {
  isSQL,
  isParametrizedSQL: (value: unknown) => isParametrizedSQL(value),
  isEmpty,
  isIdentifier,
  isPlain,
  isLiteral,
  isSQLIn,
};
