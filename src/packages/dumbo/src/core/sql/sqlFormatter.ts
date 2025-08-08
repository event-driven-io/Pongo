import {
  isDeferredSQL,
  isIdentifier,
  isLiteral,
  isRaw,
  isRawSQL,
  isSQL,
  SQL,
  type DeferredSQL,
} from './sql';
import { type ParametrizedSQL, isParametrizedSQL } from './parametrizedSQL';

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

function formatValue(value: unknown, formatter: SQLFormatter): string {
  // Handle SQL wrapper types first
  if (isIdentifier(value)) {
    return formatter.formatIdentifier(value.value);
  } else if (isRaw(value)) {
    return value.value;
  } else if (isLiteral(value)) {
    return formatter.formatLiteral(value.value);
  } else if (isSQL(value)) {
    return isRawSQL(value)
      ? value.sql
      : processSQL(value as unknown as SQL, formatter);
  }

  // Handle specific types directly
  if (value === null || value === undefined) {
    return 'NULL';
  } else if (typeof value === 'number') {
    return value.toString();
  } else if (Array.isArray(value)) {
    return formatter.formatArray
      ? formatter.formatArray(value, (item) => formatValue(item, formatter))
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

function processSQL(sql: SQL, formatter: SQLFormatter): string {
  if (isRawSQL(sql)) return sql.sql;

  if (isParametrizedSQL(sql)) {
    const parametrized = sql as unknown as ParametrizedSQL;
    let result = parametrized.sql;

    // Replace __P1__, __P2__, etc. with formatted parameter values
    parametrized.params.forEach((param, index) => {
      const placeholder = `__P${index + 1}__`;
      const formattedValue = formatValue(param, formatter);
      result = result.replace(new RegExp(placeholder, 'g'), formattedValue);
    });

    return result;
  }

  if (!isDeferredSQL(sql)) return sql;

  const { strings, values } = sql as DeferredSQL;

  // Process the template
  let result = '';
  strings.forEach((string, i) => {
    result += string;

    if (i < values.length) {
      result += formatValue(values[i], formatter);
    }
  });

  return result;
}
