import { JSONSerializer } from '../../../../../core/serializer';
import { registerFormatter, type SQLFormatter } from '../../../../../core/sql';
import {
  formatSQL,
  mapSQLValue,
  formatParametrizedQuery,
} from '../../../../../core/sql/sqlFormatter';
import format from './sqliteFormat';

const sqliteFormatter: SQLFormatter = {
  formatIdentifier: format.ident,
  formatLiteral: format.literal,
  formatString: format.string,
  formatArray: (array, itemFormatter) => {
    if (array.length === 0) return '()';
    return '(' + array.map(itemFormatter).join(', ') + ')';
  },
  formatDate: (value) => format.literal(value.toISOString()),
  formatObject: (value) =>
    `'${JSONSerializer.serialize(value).replace(/'/g, "''")}'`,
  mapSQLValue: (value: unknown): unknown => {
    // SQLite-specific type conversions first
    if (typeof value === 'boolean') return value ? 1 : 0; // SQLite booleans as 1/0
    if (value instanceof Date) return value.toISOString(); // SQLite dates as ISO strings
    if (typeof value === 'bigint') return value.toString(); // SQLite BigInt as string

    // Use base function for SQL wrapper types and other complex types
    return mapSQLValue(value, sqliteFormatter);
  },
  format: (sql) => {
    // Use base function with SQLite-specific placeholder generator
    const result = formatParametrizedQuery(sql, () => '?');

    // Apply SQLite-specific parameter conversions
    const formattedParams = result.params.map((param) => {
      if (param === null || param === undefined) return param;
      if (typeof param === 'string' || typeof param === 'number') return param;
      if (typeof param === 'boolean') return param ? 1 : 0; // SQLite booleans as 1/0
      if (param instanceof Date) return param.toISOString(); // SQLite dates as ISO strings
      if (typeof param === 'bigint') return param.toString(); // SQLite BigInt as string
      if (Array.isArray(param)) return JSONSerializer.serialize(param); // SQLite arrays as JSON
      if (typeof param === 'object') return JSONSerializer.serialize(param); // SQLite objects as JSON
      return param;
    });

    return { query: result.query, params: formattedParams };
  },
  formatRaw: (sql) => formatSQL(sql, sqliteFormatter),
};

registerFormatter('SQLite', sqliteFormatter);

export { format, sqliteFormatter };
