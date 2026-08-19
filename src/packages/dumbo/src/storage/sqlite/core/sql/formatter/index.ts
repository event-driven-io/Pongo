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

const sqliteSQLProcessorsRegistry = SQLProcessorsRegistry({
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
  );

const sqliteFormatter: SQLFormatter = SQLFormatter({
  processorsRegistry: sqliteSQLProcessorsRegistry,
});

registerFormatter('SQLite', sqliteFormatter);

export { sqliteFormatter };
