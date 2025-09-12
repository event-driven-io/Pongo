import {
  defaultProcessorsRegistry,
  registerFormatter,
  SQLFormatter,
  SQLProcessorsRegistry,
} from '../../../../../core/sql';
import { sqliteColumnProcessors } from '../processors';

const sqliteSQLProcessorsRegistry = SQLProcessorsRegistry({
  from: defaultProcessorsRegistry,
}).register(sqliteColumnProcessors);

const sqliteFormatter: SQLFormatter = SQLFormatter({
  processorsRegistry: sqliteSQLProcessorsRegistry,
});

registerFormatter('SQLite', sqliteFormatter);

export { sqliteFormatter };
