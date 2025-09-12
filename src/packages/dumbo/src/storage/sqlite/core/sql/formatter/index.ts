import {
  defaultProcessorsRegistry,
  registerFormatter,
  SQLFormatter,
  SQLProcessorsRegistry,
} from '../../../../../core/sql';

const sqliteSQLProcessorsRegistry = SQLProcessorsRegistry({
  from: defaultProcessorsRegistry,
}).register();

const sqliteFormatter: SQLFormatter = SQLFormatter({
  processorsRegistry: sqliteSQLProcessorsRegistry,
});

registerFormatter('SQLite', sqliteFormatter);

export { sqliteFormatter };
