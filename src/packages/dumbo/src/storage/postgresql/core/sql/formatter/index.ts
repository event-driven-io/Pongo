import {
  type SQLFormatter,
  describeSQL,
  formatSQL,
  mapSQLParamValue,
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
    mapValue: (value: unknown): unknown => mapSQLParamValue(value, pgFormatter),
    mapPlaceholder: (index: number): string => `$${index + 1}`,
  },
  format: (sql) => formatSQL(sql, pgFormatter),
  describe: (sql) => describeSQL(sql),
};

registerFormatter('PostgreSQL', pgFormatter);

// Export the original functions if needed
export { format, pgFormatter };
