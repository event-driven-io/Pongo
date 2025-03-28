import { JSONSerializer } from '../../serializer';
import { type SQLFormatter, registerFormatter } from '../sql';
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
};

registerFormatter('SQLite', sqliteFormatter);

export { format, sqliteFormatter };
