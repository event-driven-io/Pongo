import { describe, expectTypeOf, it } from 'vitest';
import { SQL, type SQLDefaultSchemaNameToken } from '../sql';
import type {
  DatabaseSchemaComponentOptions,
  DatabaseSchemaTables,
} from './components';
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

  it('names every schema, either explicitly or as the default one', () => {
    expectTypeOf(dumboSchema.schema).parameter(0).toEqualTypeOf<string>();
    expectTypeOf(dumboSchema.defaultSchema)
      .parameter(0)
      .toExtend<DatabaseSchemaTables>();
    expectTypeOf(
      dumboSchema.defaultSchema({ users }).schemaName,
    ).toEqualTypeOf<SQLDefaultSchemaNameToken>();
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

  it('keeps schemas contributed by extensions reachable through the extension', () => {
    const messages = dumboSchema.table('messages', {
      columns: {
        id: dumboSchema.column('id', SQL.column.type.Text),
      },
    });
    const readmodelUsers = dumboSchema.table('users', {
      columns: {
        id: dumboSchema.column('id', SQL.column.type.Text),
      },
    });
    const auditLog = dumboSchema.table('audit_log', {
      columns: {
        id: dumboSchema.column('id', SQL.column.type.Text),
      },
    });
    const audit = dumboSchema.extension('audit', {
      schemas: {
        audit: dumboSchema.schema('audit', { auditLog }),
      },
    });
    const eventStore = dumboSchema.extension('event-store', {
      schemas: {
        default: dumboSchema.defaultSchema({ messages }),
        readmodels: dumboSchema.schema('readmodels', {
          users: readmodelUsers,
        }),
      },
    });
    const direct = dumboSchema.schema('direct', {});
    const database = dumboSchema.database(
      'app',
      { direct },
      { eventStore, audit },
    );

    expectTypeOf(eventStore.schemas.readmodels.tables.users).toEqualTypeOf(
      readmodelUsers,
    );
    expectTypeOf(audit.schemas.audit.tables.auditLog).toEqualTypeOf(auditLog);
    expectTypeOf(
      database.extensions.eventStore.schemas.readmodels.tables.users,
    ).toEqualTypeOf(readmodelUsers);
    expectTypeOf(database.schemas.direct).toEqualTypeOf(direct);
    expectTypeOf(database.extensions.eventStore).toEqualTypeOf(eventStore);
    expectTypeOf<
      Extract<keyof typeof database.schemas, 'readmodels'>
    >().toEqualTypeOf<never>();
  });

  it('declares an extension with tables or schemas, never with both', () => {
    const auditLog = dumboSchema.table('audit_log', {
      columns: {
        id: dumboSchema.column('id', SQL.column.type.Text),
      },
    });
    const audit = dumboSchema.extension('audit', { tables: { auditLog } });

    expectTypeOf(audit.tables.auditLog).toEqualTypeOf(auditLog);
    dumboSchema.extension('mixed', {
      tables: { auditLog },
      // @ts-expect-error an extension declares tables or schemas, never both
      schemas: { audit: dumboSchema.schema('audit', { auditLog }) },
    });
  });
});
