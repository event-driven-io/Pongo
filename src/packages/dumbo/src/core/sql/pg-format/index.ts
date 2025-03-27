import { JSONSerializer } from '../../serializer';
import { type SQLFormatter, registerFormatter } from '../sql';
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

    // Check if it's a nested array
    const isNestedArray = array.some((item) => Array.isArray(item));

    if (isNestedArray) {
      // For nested arrays, format with double parentheses
      const formattedItems = array.map((item) => {
        if (Array.isArray(item)) {
          // Use parentheses around each subarray item
          return (
            '(' + item.map((subItem) => itemFormatter(subItem)).join(', ') + ')'
          );
        }
        return itemFormatter(item);
      });

      // Wrap the entire result in additional parentheses
      return '(' + formattedItems.join(', ') + ')';
    } else {
      // For regular arrays, use PostgreSQL's tuple syntax: (item1, item2, ...)
      const formattedItems = array.map((item) => itemFormatter(item));
      return '(' + formattedItems.join(', ') + ')';
    }
  },

  formatDate: (value: Date): string => {
    // Format date for PostgreSQL with proper timezone
    let isoStr = value.toISOString();
    // Replace 'T' with space and keep timezone info (Z becomes +00)
    isoStr = isoStr.replace('T', ' ').replace('Z', '+00');
    return `'${isoStr}'`;
  },

  formatObject: (value: object): string => {
    return `'${JSONSerializer.serialize(value).replace(/'/g, "''")}'`;
  },
};

registerFormatter('PostgreSQL', pgFormatter);

// Export the original functions if needed
export { format, pgFormatter };
