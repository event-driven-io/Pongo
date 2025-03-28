import {
  isDeferredSQL,
  isIdentifier,
  isLiteral,
  isRaw,
  SQL,
  type DeferredSQL,
  type SQLFormatter,
} from './sql';

function formatValue(value: unknown, formatter: SQLFormatter): string {
  // Handle SQL wrapper types first
  if (isIdentifier(value)) {
    return formatter.formatIdentifier(value.value);
  } else if (isRaw(value)) {
    return value.value;
  } else if (isLiteral(value)) {
    return formatter.formatLiteral(value.value);
  } else if (isDeferredSQL(value)) {
    return processDeferredSQL(
      value as unknown as SQL,
      formatter,
    ) as unknown as string;
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

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function processDeferredSQL(sql: SQL, formatter: any): SQL {
  // If it's not a DeferredSQL, return as is
  if (!isDeferredSQL(sql)) {
    return sql;
  }

  const { strings, values } = sql as DeferredSQL;

  // Process the template
  let result = '';
  strings.forEach((string, i) => {
    result += string;

    if (i < values.length) {
      // eslint-disable-next-line @typescript-eslint/no-unsafe-argument
      result += formatValue(values[i], formatter);
    }
  });

  return result as SQL;
}
