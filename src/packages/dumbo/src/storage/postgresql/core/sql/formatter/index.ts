import {
  type SQLFormatter,
  describeSQL,
  formatSQL,
  mapSQLParam,
  registerFormatter,
} from '../../../../../core';
import format from './pgFormat';

const pgFormatter: SQLFormatter = {
  formatIdentifier: format.ident,
  formatLiteral: format.literal,
  params: {
    mapString: format.string,
    mapArray: (array: unknown[], itemFormatter: (item: unknown) => unknown) => {
      return array.map((item) => itemFormatter(item));
    },
    mapDate: (value: Date): unknown => {
      let isoStr = value.toISOString();
      isoStr = isoStr.replace('T', ' ').replace('Z', '+00');
      return `${isoStr}`;
    },
    mapParam: (value: unknown): unknown => mapSQLParam(value, pgFormatter),
  },
  format: (sql) => formatSQL(sql, pgFormatter),
  describe: (sql) => describeSQL(sql, pgFormatter),
  placeholderGenerator: (index: number): string => `$${index + 1}`,
};

registerFormatter('PostgreSQL', pgFormatter);

// Export the original functions if needed
export { format, pgFormatter };
