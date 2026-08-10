import {
  defaultProcessorsRegistry,
  registerFormatter,
  SQLFormatter,
  SQLProcessorsRegistry,
} from '../../../../../core/sql';
import {
  sqliteColumnProcessors,
  SQLiteCreateSchemaProcessor,
  SQLiteTableReferenceProcessor,
} from '../processors';

const sqliteSQLProcessorsRegistry = SQLProcessorsRegistry({
  from: defaultProcessorsRegistry,
})
  .register(sqliteColumnProcessors)
  .register(SQLiteTableReferenceProcessor, SQLiteCreateSchemaProcessor);

const sqliteFormatter: SQLFormatter = SQLFormatter({
  processorsRegistry: sqliteSQLProcessorsRegistry,
});

registerFormatter('SQLite', sqliteFormatter);

export { sqliteFormatter };
