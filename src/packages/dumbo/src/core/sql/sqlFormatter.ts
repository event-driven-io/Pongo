import { type ParametrizedSQL, isParametrizedSQL } from './parametrizedSQL';
import { SQL, isSQL } from './sql';

export interface ParametrizedQuery {
  query: string;
  params: unknown[];
}

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

export const formatSQL = (sql: SQL | SQL[], formatter: SQLFormatter): string =>
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
  } else if (typeof value === 'number') {
    return value.toString();
  } else if (Array.isArray(value)) {
    return formatter.formatArray
      ? formatter.formatArray(value, (item) => formatSQLValue(item, formatter))
      : formatter.formatLiteral(value);
  } else if (typeof value === 'bigint') {
    return formatter.formatBigInt
      ? formatter.formatBigInt(value)
      : formatter.formatLiteral(value);
  } else if (value instanceof Date) {
    return formatter.formatDate
      ? formatter.formatDate(value)
      : formatter.formatLiteral(value);
  } else if (typeof value === 'object') {
    return formatter.formatObject
      ? formatter.formatObject(value)
      : formatter.formatLiteral(value);
  }

  return formatter.formatLiteral(value);
}

function formatSQLIn(
  sqlIn: { column: string; values: unknown[] },
  formatter: SQLFormatter,
): string {
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

function formatSQLInParametrized(
  sqlIn: { column: string; values: unknown[] },
  formatter: SQLFormatter,
  placeholderGenerator: (index: number) => string,
  startIndex: number,
): { sql: string; params: unknown[] } {
  const { column, values } = sqlIn;

  if (values.length === 0) {
    return { sql: 'FALSE', params: [] };
  }

  if (formatter.formatSQLIn) {
    return formatter.formatSQLIn(
      column,
      values,
      placeholderGenerator,
      startIndex,
    );
  }

  const formattedColumn = formatter.formatIdentifier(column);
  const placeholders = values.map((_, index) =>
    placeholderGenerator(startIndex + index),
  );
  const sql = `${formattedColumn} IN (${placeholders.join(', ')})`;

  return { sql, params: values };
}

export function formatParametrizedQuery(
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
  const finalParams: unknown[] = [];
  let paramIndex = 0;

  parametrized.params.forEach((param, index) => {
    const placeholder = `__P${index + 1}__`;

    if (SQL.check.isIdentifier(param)) {
      const inlinedIdentifier = formatter.formatIdentifier(param.value);
      query = query.replace(new RegExp(placeholder, 'g'), inlinedIdentifier);
    } else if (SQL.check.isSQLIn(param)) {
      const sqlInResult = formatSQLInParametrized(
        param,
        formatter,
        placeholderGenerator,
        paramIndex,
      );
      query = query.replace(new RegExp(placeholder, 'g'), sqlInResult.sql);
      finalParams.push(...sqlInResult.params);
      paramIndex += sqlInResult.params.length;
    } else if (Array.isArray(param)) {
      if (param.length === 0) {
        throw new Error(
          'Empty arrays in IN clauses are not supported. Use SQL.in(column, array) helper instead.',
        );
      }
      const expandedPlaceholders = param.map(() =>
        placeholderGenerator(paramIndex++),
      );
      const expandedPlaceholderString = `(${expandedPlaceholders.join(', ')})`;
      query = query.replace(
        new RegExp(placeholder, 'g'),
        expandedPlaceholderString,
      );
      finalParams.push(...(param as unknown[]));
    } else {
      const dbPlaceholder = placeholderGenerator(paramIndex);
      query = query.replace(new RegExp(placeholder, 'g'), dbPlaceholder);
      finalParams.push(param);
      paramIndex++;
    }
  });

  return { query, params: finalParams };
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
    return formatSQL(value, formatter);
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
    return formatter.formatArray
      ? formatter.formatArray(value, (item) => String(item))
      : formatter.formatLiteral(value);
  }
  if (typeof value === 'bigint') {
    return formatter.formatBigInt
      ? formatter.formatBigInt(value)
      : formatter.formatLiteral(value);
  }
  if (value instanceof Date) {
    return formatter.formatDate
      ? formatter.formatDate(value)
      : formatter.formatLiteral(value);
  }
  if (typeof value === 'object') {
    return formatter.formatObject
      ? formatter.formatObject(value)
      : formatter.formatLiteral(value);
  }

  return formatter.formatLiteral(value);
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
