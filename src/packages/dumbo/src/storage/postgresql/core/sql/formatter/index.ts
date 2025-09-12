import {
  SQLFormatter,
  SQLProcessorsRegistry,
  defaultProcessorsRegistry,
  mapSQLIdentifier,
  registerFormatter,
} from '../../../../../core';
import { postgreSQLColumnProcessors } from '../processors';
import reservedMap from './reserved';

const postgreSQLProcessorsRegistry = SQLProcessorsRegistry({
  from: defaultProcessorsRegistry,
}).register(postgreSQLColumnProcessors);

const pgFormatter: SQLFormatter = SQLFormatter({
  processorsRegistry: postgreSQLProcessorsRegistry,
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
