import {
  defaultProcessorsRegistry,
  mapSQLIdentifier,
  registerFormatter,
  SQLFormatter,
  SQLProcessorsRegistry,
} from '../../../../../core';
import {
  PostgreSQLArrayProcessor,
  postgreSQLColumnProcessors,
  PostgreSQLCreateSchemaProcessor,
  PostgreSQLRenameTableProcessor,
  PostgreSQLExpandSQLInProcessor,
  PostgreSQLIndexReferenceProcessor,
  PostgreSQLJSONDocumentIndexTargetProcessor,
  PostgreSQLJSONPathTargetProcessor,
  PostgreSQLTableReferenceProcessor,
} from '../processors';
import reservedMap from './reserved';

let postgreSQLProcessors: SQLProcessorsRegistry | undefined;

const postgreSQLProcessorsRegistry = (): SQLProcessorsRegistry =>
  (postgreSQLProcessors ??= SQLProcessorsRegistry({
    from: defaultProcessorsRegistry,
  })
    .register(postgreSQLColumnProcessors)
    .register(
      PostgreSQLArrayProcessor,
      PostgreSQLExpandSQLInProcessor,
      PostgreSQLTableReferenceProcessor,
      PostgreSQLCreateSchemaProcessor,
      PostgreSQLRenameTableProcessor,
      PostgreSQLIndexReferenceProcessor,
      PostgreSQLJSONDocumentIndexTargetProcessor,
      PostgreSQLJSONPathTargetProcessor,
    ));

const pgFormatter: SQLFormatter = SQLFormatter({
  processorsRegistry: {
    get: (tokenType) => postgreSQLProcessorsRegistry().get(tokenType),
    all: () => postgreSQLProcessorsRegistry().all(),
  },
  valueMapper: {
    mapDate: (value: Date): unknown =>
      value.toISOString().replace('T', ' ').replace('Z', '+00'),
    mapPlaceholder: (index: number): string => `$${index + 1}`,
    mapIdentifier: (value: string): string =>
      mapSQLIdentifier(value, { reservedWords: reservedMap }),
    mapArray: (values: unknown[]): unknown[] => values,
  },
});

registerFormatter('PostgreSQL', pgFormatter);

// Export the original functions if needed
export { pgFormatter };
