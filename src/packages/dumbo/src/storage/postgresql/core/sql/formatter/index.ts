import {
  type SQLFormatter,
  JSONSerializer,
  formatParametrizedQuery,
  formatSQL,
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

  formatDate: (value: Date): string => {
    let isoStr = value.toISOString();
    isoStr = isoStr.replace('T', ' ').replace('Z', '+00');
    return `'${isoStr}'`;
  },

  formatObject: (value: object): string => {
    return `'${JSONSerializer.serialize(value).replace(/'/g, "''")}'`;
  },

  mapSQLValue: (value: unknown): unknown => {
    return mapSQLValue(value, pgFormatter);
  },
  format: (sql) => {
    return formatParametrizedQuery(
      sql,
      (index) => `$${index + 1}`,
      pgFormatter,
    );
  },
  formatRaw: (sql) => formatSQL(sql, pgFormatter),
};

registerFormatter('PostgreSQL', pgFormatter);

// Export the original functions if needed
export { format, pgFormatter };
