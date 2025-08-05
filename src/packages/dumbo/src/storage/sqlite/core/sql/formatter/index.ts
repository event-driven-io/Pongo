import { JSONSerializer } from '../../../../../core/serializer';
import { registerFormatter, type SQLFormatter } from '../../../../../core/sql';
import { formatSQL } from '../../../../../core/sql/sqlFormatter';
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
  format: (sql) => formatSQL(sql, sqliteFormatter),
};

registerFormatter('SQLite', sqliteFormatter);

export { format, sqliteFormatter };
