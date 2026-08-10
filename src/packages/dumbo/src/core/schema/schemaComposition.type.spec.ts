import { describe, expectTypeOf, it } from 'vitest';
import { SQL } from '../sql';
import type { DatabaseSchemaComponentOptions } from './components';
import type * as dumboPublicAPI from './index';
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

describe('composing a schema through the Dumbo declaration API', () => {
  it('types each declaration as its own component kind', () => {
    expectTypeOf(users).toExtend<TableComponent>();
    expectTypeOf(email).toExtend<IndexComponent>();
    expectTypeOf(publicSchema).toExtend<DatabaseSchemaComponent>();
    expectTypeOf(app).toExtend<DatabaseComponent>();
  });

  it('keeps declared names and row types reachable through the tree', () => {
    expectTypeOf(
      app.schemas.public.tables.users.columns.email.columnName,
    ).toEqualTypeOf<'email'>();
    expectTypeOf<TableRowType<typeof users>>().toEqualTypeOf<{
      id: string;
      email: string;
    }>();
  });

  it('carries no database name on a schema declaration', () => {
    expectTypeOf<
      Extract<keyof typeof publicSchema, 'databaseName'>
    >().toEqualTypeOf<never>();
    expectTypeOf<
      Extract<
        keyof DatabaseSchemaComponentOptions<
          typeof publicSchema.tables,
          'public',
          typeof publicSchema.extensions
        >,
        'databaseName'
      >
    >().toEqualTypeOf<never>();
  });

  it('declares schema columns only through dumboSchema.column', () => {
    expectTypeOf<Extract<keyof typeof SQL, 'columnN'>>().toEqualTypeOf<never>();
  });

  it('keeps component construction and storage internal to Dumbo', () => {
    expectTypeOf<
      Extract<
        keyof typeof dumboPublicAPI,
        // component records have no public construction helper
        | 'componentMap'
        // runtime component-record mutation is internal
        | 'setComponentMapEntry'
        | 'deleteComponentMapEntry'
        // component initialization and kind-specific construction are internal
        | 'initializeSchemaComponent'
        | 'createSchemaComponent'
        // removed component-cloning helpers are not public APIs
        | 'copySchemaComponentSpecialization'
        // local migration storage is internal
        | 'localMigrationsOf'
      >
    >().toEqualTypeOf<never>();
  });
});
