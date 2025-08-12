import { JSONSerializer } from '../../../../../core/serializer';
import {
  formatSQL,
  formatSQLRaw,
  mapSQLValue,
  registerFormatter,
  type SQLFormatter,
} from '../../../../../core/sql';
import format from './sqliteFormat';

const sqliteFormatter: SQLFormatter = {
  formatIdentifier: format.ident,
  formatLiteral: format.literal,
  formatString: format.string,
  formatArray: (array, itemFormatter) => {
    if (array.length === 0) return '()';
    return '(' + array.map(itemFormatter).join(', ') + ')';
  },
  formatBoolean: (value: boolean): string => (value ? '1' : '0'),
  formatDate: (value) => format.literal(value.toISOString()),
  mapSQLValue: (value: unknown): unknown => {
    if (typeof value === 'boolean') return value ? 1 : 0;
    if (value instanceof Date) return value.toISOString();
    if (typeof value === 'bigint') return value.toString();

    return mapSQLValue(value, sqliteFormatter);
  },
  format: (sql) => {
    const result = formatSQL(sql, () => '?', sqliteFormatter);

    const formattedParams = result.params.map((param) => {
      if (param === null || param === undefined) return param;
      if (typeof param === 'string' || typeof param === 'number') return param;
      if (typeof param === 'boolean') return param ? 1 : 0;
      if (param instanceof Date) return param.toISOString();
      if (typeof param === 'bigint') return param.toString();
      if (Array.isArray(param)) return JSONSerializer.serialize(param);
      if (typeof param === 'object') return JSONSerializer.serialize(param);
      return param;
    });

    return { query: result.query, params: formattedParams };
  },
  formatRaw: (sql) => formatSQLRaw(sql, sqliteFormatter),
};

registerFormatter('SQLite', sqliteFormatter);

export { format, sqliteFormatter };
