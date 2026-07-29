import { expectTypeOf } from 'vitest';
import { SQL } from '../sql';
import * as dumboPublicAPI from './index';
import {
  dumboSchema,
  type DatabaseComponent,
  type DatabaseSchemaComponent,
  type IndexComponent,
  type TableComponent,
  type TableRowType,
} from './index';

const email = dumboSchema.index('users_email_idx', ['email'] as const);
const users = dumboSchema.table('users', {
  columns: {
    id: dumboSchema.column('id', SQL.column.type.Varchar(100), {
      primaryKey: true,
      notNull: true,
    }),
    email: dumboSchema.column('email', SQL.column.type.Varchar(200), {
      notNull: true,
    }),
  },
  indexes: { email },
  primaryKey: ['id'],
});
const publicSchema = dumboSchema.schema('public', { users });
const app = dumboSchema.database('app', { public: publicSchema });

expectTypeOf(users).toMatchTypeOf<TableComponent>();
expectTypeOf(email).toMatchTypeOf<IndexComponent>();
expectTypeOf(publicSchema).toMatchTypeOf<DatabaseSchemaComponent>();
expectTypeOf(app).toMatchTypeOf<DatabaseComponent>();
expectTypeOf(
  app.schemas.public.tables.users.columns.email.columnName,
).toEqualTypeOf<'email'>();
expectTypeOf<TableRowType<typeof users>>().toEqualTypeOf<{
  id: string;
  email: string;
}>();

// @ts-expect-error Schema columns are declared through dumboSchema.column.
void SQL.columnN;
// @ts-expect-error Component records have no public construction helper.
void dumboPublicAPI.componentMap;
// @ts-expect-error Runtime component-record mutation is internal to Dumbo.
void dumboPublicAPI.setComponentMapEntry;
// @ts-expect-error Runtime component-record mutation is internal to Dumbo.
void dumboPublicAPI.deleteComponentMapEntry;
// @ts-expect-error Component initialization is internal to Dumbo.
void dumboPublicAPI.initializeSchemaComponent;
// @ts-expect-error Kind-specific construction is internal to Dumbo.
void dumboPublicAPI.createSchemaComponent;
// @ts-expect-error Removed component-cloning helpers are not public APIs.
void dumboPublicAPI.copySchemaComponentSpecialization;
// @ts-expect-error Local migration storage is internal to Dumbo.
void dumboPublicAPI.localMigrationsOf;
