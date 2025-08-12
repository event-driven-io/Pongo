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
  // Handle SQL wrapper types first
  if (SQL.isIdentifier(value)) {
    return formatter.formatIdentifier(value.value);
  } else if (SQL.isPlain(value)) {
    return value.value;
  } else if (SQL.isLiteral(value)) {
    return formatter.formatLiteral(value.value);
  } else if (SQL.isIn(value)) {
    return formatSQLIn(value, formatter);
  } else if (SQL.isSQL(value)) {
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

  // Fallback: standard IN clause with parameterized values
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
  // Handle array by merging with newline separator
  const merged = Array.isArray(sql) ? SQL.merge(sql, '\n') : sql;

  if (!isParametrizedSQL(merged)) {
    throw new Error('Expected ParametrizedSQL, got string-based SQL');
  }

  const parametrized = merged as unknown as ParametrizedSQL;
  let query = parametrized.sql;
  const finalParams: unknown[] = [];
  let paramIndex = 0;

  // Process each parameter
  parametrized.params.forEach((param, index) => {
    const placeholder = `__P${index + 1}__`;

    if (SQL.isIdentifier(param)) {
      // Identifiers must be inlined in the SQL, not bound as parameters
      const inlinedIdentifier = formatter.formatIdentifier(param.value);
      query = query.replace(new RegExp(placeholder, 'g'), inlinedIdentifier);
    } else if (SQL.isIn(param)) {
      // SQL.in helper - handle empty arrays gracefully
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
      // Arrays - expand to individual parameters for universal compatibility
      if (param.length === 0) {
        // Empty arrays should use SQL.in helper for proper handling
        throw new Error(
          'Empty arrays in IN clauses are not supported. Use SQL.in(column, array) helper instead.',
        );
      } else {
        // Non-empty array - expand to individual parameters
        const expandedPlaceholders = param.map(() =>
          placeholderGenerator(paramIndex++),
        );
        const expandedPlaceholderString = `(${expandedPlaceholders.join(', ')})`;
        query = query.replace(
          new RegExp(placeholder, 'g'),
          expandedPlaceholderString,
        );
        finalParams.push(...(param as unknown[]));
      }
    } else {
      // Regular parameters get database-specific placeholders and are added to params
      const dbPlaceholder = placeholderGenerator(paramIndex);
      query = query.replace(new RegExp(placeholder, 'g'), dbPlaceholder);
      finalParams.push(param);
      paramIndex++;
    }
  });

  return { query, params: finalParams };
}

export function mapSQLValue(value: unknown, formatter: SQLFormatter): unknown {
  // Handle SQL wrapper types first - these need special processing for parameters
  if (SQL.isIdentifier(value)) {
    // For parameter binding, identifiers should be processed by the formatter
    return formatter.formatIdentifier(value.value);
  } else if (SQL.isPlain(value)) {
    // Raw values should be processed by the formatter
    return value.value;
  } else if (SQL.isLiteral(value)) {
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
