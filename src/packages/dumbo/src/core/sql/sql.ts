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

const emptySQL = (): SQL =>
  ({
    __brand: 'parametrized-sql',
    sql: '',
    params: [],
  }) as unknown as SQL;

const mergeSQL = (sqls: SQL[], separator: string = ' '): SQL => {
  if (!Array.isArray(sqls)) return sqls;
  if (sqls.length === 0) return emptySQL();
  if (sqls.length === 1) return sqls[0]!;

  // Filter out empty SQL parts
  const nonEmptySqls = sqls.filter((sql) => !isEmpty(sql));
  if (nonEmptySqls.length === 0) return emptySQL();
  if (nonEmptySqls.length === 1) return nonEmptySqls[0]!;

  const strings: string[] = [''];
  const values: unknown[] = [];

  nonEmptySqls.forEach((sql, index) => {
    if (index > 0) {
      strings.push('');
      values.push(SQL([separator] as unknown as TemplateStringsArray));
    }
    strings.push('');
    values.push(sql);
  });
  strings.push('');

  return SQL(strings as unknown as TemplateStringsArray, ...values);
};

const concatSQL = (...sqls: SQL[]): SQL => {
  if (sqls.length === 0) return SQL.EMPTY;
  if (sqls.length === 1) return sqls[0]!;

  const strings: string[] = [''];
  const values: unknown[] = [];

  sqls.forEach((part, index) => {
    if (index > 0) strings.push('');
    values.push(part);
  });
  strings.push('');

  return SQL(strings as unknown as TemplateStringsArray, ...values);
};

const isEmpty = (sql: SQL): boolean => {
  if (isParametrizedSQL(sql)) {
    const parametrized = sql as unknown as ParametrizedSQL;
    return parametrized.sql.trim() === '' && parametrized.params.length === 0;
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

SQL.EMPTY = emptySQL();
SQL.concat = concatSQL;
SQL.merge = mergeSQL;
SQL.isEmpty = isEmpty;
SQL.format = formatSQLRaw;
SQL.in = sqlIn;
SQL.identifier = identifier;
SQL.plain = plain;
SQL.literal = literal;
SQL.in = sqlIn;

SQL.check = {
  isSQL,
  isParametrizedSQL: (value: unknown) => isParametrizedSQL(value),
  isIdentifier,
  isPlain,
  isLiteral,
  isSQLIn,
};
