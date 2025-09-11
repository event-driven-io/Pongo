import {
  SQLFormatter,
  mapSQLIdentifier,
  registerFormatter,
} from '../../../../../core';
import reservedMap from './reserved';

const pgFormatter: SQLFormatter = SQLFormatter({
  valueMapper: {
    mapDate: (value: Date): unknown =>
      value.toISOString().replace('T', ' ').replace('Z', '+00'),
    mapPlaceholder: (index: number): string => `$${index + 1}`,
    mapIdentifier: (value: string): string =>
      mapSQLIdentifier(value, { reservedWords: reservedMap }),
  },
});

registerFormatter('PostgreSQL', pgFormatter);

// Export the original functions if needed
export { pgFormatter };
