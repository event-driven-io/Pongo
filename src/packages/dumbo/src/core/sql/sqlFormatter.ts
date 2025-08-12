import { JSONSerializer } from '../serializer';
import { isParametrizedSQL, type ParametrizedSQL } from './parametrizedSQL';
import { SQL, isSQL, type SQLIn } from './sql';

export interface ParametrizedQuery {
  query: string;
  params: unknown[];
}

export interface SQLFormatter {
  formatIdentifier: (value: unknown) => string;
  formatLiteral: (value: unknown) => string;
  formatString: (value: unknown) => string;
  formatBoolean?: (value: boolean) => string;
  formatArray?: (
    array: unknown[],
    itemFormatter: (item: unknown) => string,
  ) => string;
  mapArray?: (
    array: unknown[],
    itemFormatter: (item: unknown) => unknown,
  ) => unknown[];
  formatDate?: (value: Date) => string;
  formatObject?: (value: object) => string;
  formatBigInt?: (value: bigint) => string;
  formatSQLIn?: (
    column: string,
    values: unknown[],
    placeholderGenerator: (index: number) => string,
    startIndex: number,
  ) => { sql: string; params: unknown[] };
  mapSQLValue: (value: unknown) => unknown;
  format: (sql: SQL | SQL[]) => ParametrizedQuery;
  formatRaw: (sql: SQL | SQL[]) => string;
}
const formatters: Record<string, SQLFormatter> = {};

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

export const formatSQLRaw = (
  sql: SQL | SQL[],
  formatter: SQLFormatter,
): string =>
  Array.isArray(sql)
    ? sql.map((s) => processSQL(s, formatter)).join('\n')
    : processSQL(sql, formatter);

function formatSQLValue(value: unknown, formatter: SQLFormatter): string {
  if (SQL.check.isIdentifier(value)) {
    return formatter.formatIdentifier(value.value);
  }
  if (SQL.check.isPlain(value)) {
    return value.value;
  }
  if (SQL.check.isLiteral(value)) {
    return formatter.formatLiteral(value.value);
  }
  if (SQL.check.isSQLIn(value)) {
    return formatSQLIn(value, formatter);
  }
  if (SQL.check.isSQL(value)) {
    return processSQL(value as unknown as SQL, formatter);
  }

  if (value === null || value === undefined) {
    return 'NULL';
  }
  if (typeof value === 'number') {
    return value.toString();
  }
  if (Array.isArray(value) && formatter.formatArray) {
    return formatter.formatArray
      ? formatter.formatArray(value, (item) => formatSQLValue(item, formatter))
      : formatter.formatLiteral(value);
  }
  if (typeof value === 'boolean') {
    return formatter.formatBoolean
      ? formatter.formatBoolean(value)
      : value
        ? 'TRUE'
        : 'FALSE';
  }
  if (typeof value === 'bigint') {
    return formatter.formatBigInt
      ? formatter.formatBigInt(value)
      : value.toString();
  }
  if (value instanceof Date && formatter.formatDate) {
    return formatter.formatDate(value);
  }
  if (typeof value === 'object') {
    return formatter.formatObject
      ? formatter.formatObject(value)
      : formatter.formatLiteral(value);
  }

  return formatter.formatLiteral(value);
}

export function mapSQLValue(value: unknown, formatter: SQLFormatter): unknown {
  if (SQL.check.isIdentifier(value)) {
    return formatter.formatIdentifier(value.value);
  }
  if (SQL.check.isPlain(value)) {
    return value.value;
  }
  if (SQL.check.isLiteral(value)) {
    return formatter.formatLiteral(value.value);
  }
  if (isSQL(value)) {
    return formatSQLRaw(value, formatter);
  }

  if (value === null || value === undefined) {
    return null;
  }
  if (typeof value === 'number') {
    return value;
  }
  if (typeof value === 'string') {
    return value;
  }

  if (Array.isArray(value)) {
    return formatter.mapArray
      ? formatter.mapArray(value, (item) => mapSQLValue(item, formatter))
      : value.map((item) => mapSQLValue(item, formatter));
  }
  if (typeof value === 'boolean') {
    return formatter.formatBoolean
      ? formatter.formatBoolean(value)
      : value
        ? 'TRUE'
        : 'FALSE';
  }
  if (typeof value === 'bigint') {
    return formatter.formatBigInt
      ? formatter.formatBigInt(value)
      : value.toString();
  }
  if (value instanceof Date && formatter.formatDate) {
    return formatter.formatDate(value);
  }
  if (typeof value === 'object') {
    return formatter.formatObject
      ? formatter.formatObject(value)
      : `'${JSONSerializer.serialize(value).replace(/'/g, "''")}'`;
  }

  return formatter.formatLiteral(value);
}

function formatSQLIn(sqlIn: SQLIn, formatter: SQLFormatter): string {
  const { column, values } = sqlIn;

  if (values.length === 0) {
    return 'TRUE';
  }

  const formattedColumn = formatter.formatIdentifier(column);
  const formattedValues = values
    .map((v) => formatSQLValue(v, formatter))
    .join(', ');
  return `${formattedColumn} IN (${formattedValues})`;
}

export function formatSQL(
  sql: SQL | SQL[],
  placeholderGenerator: (index: number) => string,
  formatter: SQLFormatter,
): ParametrizedQuery {
  const merged = Array.isArray(sql) ? SQL.merge(sql, '\n') : sql;

  if (!isParametrizedSQL(merged)) {
    throw new Error('Expected ParametrizedSQL, got string-based SQL');
  }

  const parametrized = merged as unknown as ParametrizedSQL;
  let query = parametrized.sql;
  const params: unknown[] = [];

  parametrized.params.forEach((param, index) => {
    const placeholder = `__P${index + 1}__`;
    const placeholderRegex = new RegExp(placeholder, 'g');

    if (SQL.check.isIdentifier(param)) {
      query = query.replace(
        placeholderRegex,
        formatter.formatIdentifier(param.value),
      );
      return;
    }

    query = query.replace(
      placeholderRegex,
      placeholderGenerator(params.length),
    );
    params.push(formatter.mapSQLValue(param));
  });

  return { query, params };
}

function processSQL(sql: SQL, formatter: SQLFormatter): string {
  if (isParametrizedSQL(sql)) {
    const parametrized = sql as unknown as ParametrizedSQL;
    let result = parametrized.sql;

    parametrized.params.forEach((param, index) => {
      const placeholder = `__P${index + 1}__`;
      const formattedValue = formatSQLValue(param, formatter);
      result = result.replace(new RegExp(placeholder, 'g'), formattedValue);
    });

    return result;
  }

  return sql;
}
