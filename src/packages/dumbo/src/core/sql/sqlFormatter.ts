import { isIdentifier, isLiteral, isRaw, isSQL, SQL, mergeSQL } from './sql';
import { type ParametrizedSQL, isParametrizedSQL } from './parametrizedSQL';

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
  // Handle SQL wrapper types first
  if (isIdentifier(value)) {
    return formatter.formatIdentifier(value.value);
  } else if (isRaw(value)) {
    return value.value;
  } else if (isLiteral(value)) {
    return formatter.formatLiteral(value.value);
  } else if (isSQL(value)) {
    return processSQL(value as unknown as SQL, formatter);
  }

  // Handle specific types directly
  if (value === null || value === undefined) {
    return 'NULL';
  } else if (typeof value === 'number') {
    return value.toString();
  } else if (Array.isArray(value)) {
    return formatter.formatArray
      ? formatter.formatArray(value, (item) => formatSQLValue(item, formatter))
      : formatter.formatLiteral(value);
  } else if (typeof value === 'bigint') {
    // Format BigInt as a quoted string to match test expectations

    return formatter.formatBigInt
      ? formatter.formatBigInt(value)
      : formatter.formatLiteral(value);
  } else if (value instanceof Date) {
    // Let the formatter handle dates consistently
    return formatter.formatDate
      ? formatter.formatDate(value)
      : formatter.formatLiteral(value);
  } else if (typeof value === 'object') {
    // Let the formatter handle objects (excluding null which is handled above)
    return formatter.formatObject
      ? formatter.formatObject(value)
      : formatter.formatLiteral(value);
  }

  // For all other types, use the formatter's literal formatting
  return formatter.formatLiteral(value);
}

export function formatParametrizedQuery(
  sql: SQL | SQL[],
  placeholderGenerator: (index: number) => string,
): ParametrizedQuery {
  // Handle array by merging with newline separator
  const merged = Array.isArray(sql) ? mergeSQL(sql, '\n') : sql;

  if (!isParametrizedSQL(merged)) {
    throw new Error('Expected ParametrizedSQL, got string-based SQL');
  }

  const parametrized = merged as unknown as ParametrizedSQL;
  let query = parametrized.sql;

  // Replace __P1__, __P2__ with database-specific placeholders
  parametrized.params.forEach((_, index) => {
    const placeholder = `__P${index + 1}__`;
    const dbPlaceholder = placeholderGenerator(index);
    query = query.replace(new RegExp(placeholder, 'g'), dbPlaceholder);
  });

  return { query, params: parametrized.params };
}

export function mapSQLValue(value: unknown, formatter: SQLFormatter): unknown {
  // Handle SQL wrapper types first - these need special processing for parameters
  if (isIdentifier(value)) {
    // For parameter binding, identifiers should be processed by the formatter
    return formatter.formatIdentifier(value.value);
  } else if (isRaw(value)) {
    // Raw values should be processed by the formatter
    return value.value;
  } else if (isLiteral(value)) {
    // Literals should be processed by the formatter
    return formatter.formatLiteral(value.value);
  } else if (isSQL(value)) {
    // Nested SQL should be processed
    return formatSQL(value, formatter);
  }

  // For primitive types, return as-is for parameter binding
  if (value === null || value === undefined) {
    return null;
  } else if (typeof value === 'number') {
    return value;
  } else if (typeof value === 'string') {
    return value;
  }

  // For complex types, let formatter handle them
  if (Array.isArray(value)) {
    return formatter.formatArray
      ? formatter.formatArray(value, (item) => String(item))
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

  // Fallback to literal formatting
  return formatter.formatLiteral(value);
}

function processSQL(sql: SQL, formatter: SQLFormatter): string {
  if (isParametrizedSQL(sql)) {
    const parametrized = sql as unknown as ParametrizedSQL;
    let result = parametrized.sql;

    // Replace __P1__, __P2__, etc. with formatted parameter values
    parametrized.params.forEach((param, index) => {
      const placeholder = `__P${index + 1}__`;
      const formattedValue = formatSQLValue(param, formatter);
      result = result.replace(new RegExp(placeholder, 'g'), formattedValue);
    });

    return result;
  }

  // Fallback for string-based SQL
  return sql;
}
