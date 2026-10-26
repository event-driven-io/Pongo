import {
  defaultProcessorsRegistry,
  registerFormatter,
  SQLFormatter,
  SQLProcessorsRegistry,
} from '../../../../../core/sql';
import {
  sqliteColumnProcessors,
  SQLiteCreateSchemaProcessor,
  SQLiteRenameTableProcessor,
  SQLiteIndexReferenceProcessor,
  SQLiteJSONDocumentIndexTargetProcessor,
  SQLiteJSONPathTargetProcessor,
  SQLiteTableReferenceProcessor,
} from '../processors';

let sqliteSQLProcessors: SQLProcessorsRegistry | undefined;

const sqliteSQLProcessorsRegistry = (): SQLProcessorsRegistry =>
  (sqliteSQLProcessors ??= SQLProcessorsRegistry({
    from: defaultProcessorsRegistry,
  })
    .register(sqliteColumnProcessors)
    .register(
      SQLiteTableReferenceProcessor,
      SQLiteCreateSchemaProcessor,
      SQLiteRenameTableProcessor,
      SQLiteIndexReferenceProcessor,
      SQLiteJSONDocumentIndexTargetProcessor,
      SQLiteJSONPathTargetProcessor,
    ));

const sqliteFormatter: SQLFormatter = SQLFormatter({
  processorsRegistry: {
    get: (tokenType) => sqliteSQLProcessorsRegistry().get(tokenType),
    all: () => sqliteSQLProcessorsRegistry().all(),
  },
});

registerFormatter('SQLite', sqliteFormatter);

export { sqliteFormatter };
