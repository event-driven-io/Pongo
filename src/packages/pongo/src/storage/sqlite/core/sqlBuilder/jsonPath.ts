import { SQL } from '@event-driven-io/dumbo';
import { SQLLiteral } from '../../../core/sqlLiteral';

export const sqliteJsonPathLiteral = (path: string) =>
  SQL.plain(SQLLiteral.string(`$.${path}`));
