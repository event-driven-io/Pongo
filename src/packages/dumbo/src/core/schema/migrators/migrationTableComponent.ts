import { SQL } from '../../sql';
import {
  columnSchemaComponent,
  databaseSchemaComponent,
  tableComponent,
} from '../components';
import type { SchemaComponent } from '../schemaComponent';

const { AutoIncrement, Varchar, Timestamp } = SQL.column.type;

export const migrationTableComponentFor = ({
  schemaName,
  tableName = 'dmb_migrations',
  createSchema = false,
}: {
  schemaName?: string | undefined;
  tableName?: string | undefined;
  createSchema?: boolean | undefined;
} = {}): SchemaComponent => {
  const migrationTable = tableComponent({
    tableName,
    databaseSchemaName: schemaName,
    columns: {
      id: columnSchemaComponent({
        columnName: 'id',
        type: AutoIncrement({ primaryKey: true }),
      }),
      name: columnSchemaComponent({
        columnName: 'name',
        type: Varchar(255),
        notNull: true,
        unique: true,
      }),
      application: columnSchemaComponent({
        columnName: 'application',
        type: Varchar(255),
        notNull: true,
        default: 'default',
      }),
      sql_hash: columnSchemaComponent({
        columnName: 'sql_hash',
        type: Varchar(64),
        notNull: true,
      }),
      timestamp: columnSchemaComponent({
        columnName: 'timestamp',
        type: Timestamp,
        notNull: true,
        default: SQL.plain('CURRENT_TIMESTAMP'),
      }),
    },
  });

  return createSchema && schemaName
    ? databaseSchemaComponent({
        schemaName,
        tables: { [tableName]: migrationTable },
      })
    : migrationTable;
};
