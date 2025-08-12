import {
  type SQLFormatter,
  formatSQL,
  formatSQLRaw,
  mapSQLValue,
  registerFormatter,
} from '../../../../../core';
import format from './pgFormat';

const pgFormatter: SQLFormatter = {
  formatIdentifier: format.ident,
  formatLiteral: format.literal,
  formatString: format.string,
  formatArray: (
    array: unknown[],
    itemFormatter: (item: unknown) => string,
  ): string => {
    if (array.length === 0) {
      return '()';
    }

    const isNestedArray = array.some((item) => Array.isArray(item));

    if (isNestedArray) {
      const formattedItems = array.map((item) => {
        if (Array.isArray(item)) {
          return (
            '(' + item.map((subItem) => itemFormatter(subItem)).join(', ') + ')'
          );
        }
        return itemFormatter(item);
      });

      return '(' + formattedItems.join(', ') + ')';
    } else {
      const formattedItems = array.map((item) => itemFormatter(item));
      return '(' + formattedItems.join(', ') + ')';
    }
  },
  mapDate: (value: Date): unknown => {
    let isoStr = value.toISOString();
    isoStr = isoStr.replace('T', ' ').replace('Z', '+00');
    return `${isoStr}`;
  },
  formatDate: (value: Date): string =>
    format.literal(pgFormatter.mapDate!(value)),
  mapSQLValue: (value: unknown): unknown => mapSQLValue(value, pgFormatter),
  format: (sql) => formatSQL(sql, (index) => `$${index + 1}`, pgFormatter),
  formatRaw: (sql) => formatSQLRaw(sql, pgFormatter),
};

registerFormatter('PostgreSQL', pgFormatter);

// Export the original functions if needed
export { format, pgFormatter };
