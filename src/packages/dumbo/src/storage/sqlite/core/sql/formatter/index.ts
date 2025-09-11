import { registerFormatter, SQLFormatter } from '../../../../../core/sql';

const sqliteFormatter: SQLFormatter = SQLFormatter({});

registerFormatter('SQLite', sqliteFormatter);

export { sqliteFormatter };
