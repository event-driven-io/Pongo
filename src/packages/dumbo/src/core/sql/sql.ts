import { formatSQL } from './sqlFormatter';
import { ParametrizedSQL, isParametrizedSQL } from './parametrizedSQL';

export type SQL = string & { __brand: 'sql' };

export interface DeferredSQL {
  __brand: 'deferred-sql';
  strings: TemplateStringsArray;
  values: unknown[];
}

export interface RawSQL {
  __brand: 'sql';
  sql: string;
}

export function SQL(strings: TemplateStringsArray, ...values: unknown[]): SQL {
  const parametrized = ParametrizedSQL(strings, values);
  return parametrized as unknown as SQL;
}

const ID = Symbol.for('SQL_IDENTIFIER');
const RAW = Symbol.for('SQL_RAW');
const LITERAL = Symbol.for('SQL_LITERAL');

type SQLIdentifier = { [ID]: true; value: string };
type SQLRaw = { [RAW]: true; value: string };
type SQLLiteral = { [LITERAL]: true; value: unknown };

const emptySQL = (): SQL => SQL([''] as unknown as TemplateStringsArray);

export const mergeSQL = (sqls: SQL[], separator: string = ' '): SQL => {
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

export const concatSQL = (...sqls: SQL[]): SQL => {
  if (sqls.length === 0) return SQL.empty;
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
  if (typeof sql === 'string') return sql.trim() === '';

  if (isParametrizedSQL(sql)) {
    const parametrized = sql as unknown as ParametrizedSQL;
    return parametrized.sql.trim() === '' && parametrized.params.length === 0;
  }

  if (isDeferredSQL(sql)) {
    const deferred = sql as DeferredSQL;
    const hasContent =
      deferred.strings.some((s) => s.trim() !== '') ||
      deferred.values.length > 0;
    return !hasContent;
  }

  if (isRawSQL(sql)) {
    const raw = sql as RawSQL;
    return raw.sql.trim() === '';
  }

  return false;
};

SQL.empty = emptySQL();
SQL.concat = concatSQL;
SQL.merge = mergeSQL;
SQL.isEmpty = isEmpty;
SQL.format = formatSQL;

export function identifier(value: string): SQLIdentifier {
  return { [ID]: true, value };
}

export function raw(value: string): SQLRaw {
  return { [RAW]: true, value };
}

//TODO: remove it
export const plainString = raw;

export function literal(value: unknown): SQLLiteral {
  return { [LITERAL]: true, value };
}

// Type guards
export const isIdentifier = (value: unknown): value is SQLIdentifier => {
  return value !== null && typeof value === 'object' && ID in value;
};

export const isRaw = (value: unknown): value is SQLRaw => {
  return value !== null && typeof value === 'object' && RAW in value;
};

export const isLiteral = (value: unknown): value is SQLLiteral => {
  return value !== null && typeof value === 'object' && LITERAL in value;
};

export const isDeferredSQL = (value: unknown): value is DeferredSQL => {
  return (
    value !== null &&
    typeof value === 'object' &&
    '__brand' in value &&
    value.__brand === 'deferred-sql'
  );
};

export const isRawSQL = (value: unknown): value is RawSQL => {
  return (
    value !== null &&
    typeof value === 'object' &&
    '__brand' in value &&
    value.__brand === 'sql'
  );
};

export const isReserved = (
  value: string,
  reservedWords: Record<string, boolean>,
): boolean => !!reservedWords[value.toUpperCase()];

// Helper to format arrays as lists
export function arrayToList(
  useSpace: boolean,
  array: unknown[],
  formatter: (value: unknown) => string,
): string {
  let sql = '';
  sql += useSpace ? ' (' : '(';
  for (let i = 0; i < array.length; i++) {
    sql += (i === 0 ? '' : ', ') + formatter(array[i]);
  }
  sql += ')';
  return sql;
}

export const isSQL = (value: unknown): value is SQL => {
  if (value === undefined || value === null) {
    return false;
  }

  return isDeferredSQL(value) || isRawSQL(value) || isParametrizedSQL(value);
};
