import format from './pg-format/pgFormat';
import { sqliteFormatter } from './sqlite-format';

export type SQL = string & { __brand: 'sql' };

export interface SQLFormatter {
  formatIdentifier: (value: unknown) => string;
  formatLiteral: (value: unknown) => string;
  formatString: (value: unknown) => string;
  formatArray?: (
    array: unknown[],
    itemFormatter: (item: unknown) => string,
  ) => string;
  formatDate?: (value: Date) => string;
  formatObject?: (value: object) => string;
  formatBigInt?: (value: bigint) => string;
  format: (sql: SQL | SQL[]) => string;
}

const formatters: Record<string, SQLFormatter> = {};

// Register a formatter for a specific dialect
export const registerFormatter = (
  dialect: string,
  formatter: SQLFormatter,
): void => {
  formatters[dialect] = formatter;
};

export const getFormatter = (dialect: string): SQLFormatter => {
  const formatterKey = dialect;
  if (!formatters[formatterKey]) {
    throw new Error(`No SQL formatter registered for dialect: ${dialect}`);
  }
  return formatters[formatterKey];
};
registerFormatter('SQLite', sqliteFormatter);

const ID = Symbol('SQL_IDENTIFIER');
const RAW = Symbol('SQL_RAW');
const LITERAL = Symbol('SQL_LITERAL');

type SQLIdentifier = { [ID]: true; value: string };
type SQLRaw = { [RAW]: true; value: string };
type SQLLiteral = { [LITERAL]: true; value: unknown };

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

export interface DeferredSQL {
  __brand: 'deferred-sql';
  strings: TemplateStringsArray;
  values: unknown[];
}

export const isDeferredSQL = (value: unknown): value is DeferredSQL => {
  return (
    value !== null &&
    typeof value === 'object' &&
    '__brand' in value &&
    value.__brand === 'deferred-sql'
  );
};

export function SQL(strings: TemplateStringsArray, ...values: unknown[]): SQL {
  const deferredSql: DeferredSQL = {
    __brand: 'deferred-sql',
    strings,
    values,
  };

  return deferredSql as unknown as SQL;
}

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

export const sql = (sqlQuery: string, ...params: unknown[]): SQL => {
  return format(sqlQuery, ...params) as SQL;
};

export const rawSql = (sqlQuery: string): SQL => {
  return sqlQuery as SQL;
};

export const isSQL = (value: unknown): value is SQL => {
  if (value === undefined || value === null) {
    return false;
  }

  if (isDeferredSQL(value)) {
    return true;
  }

  if (typeof value === 'object') {
    return '__brand' in value && value.__brand === 'sql';
  }

  return typeof value === 'string';
};
