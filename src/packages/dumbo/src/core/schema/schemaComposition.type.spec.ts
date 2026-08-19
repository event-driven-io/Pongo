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
const app = dumboSchema.database('app', { schemas: { public: publicSchema } });
const flat = dumboSchema.database('app', { tables: { users } });

describe('composing a schema through the Dumbo declaration API', () => {
  it('infers tables added through schema.withTable({ posts })', () => {
    const posts = dumboSchema.table('posts');

    const next = publicSchema.withTable({ posts });

    expectTypeOf(next.tables.users).toEqualTypeOf(users);
    expectTypeOf(next.tables.posts).toEqualTypeOf(posts);
    expectTypeOf<
      Extract<keyof typeof publicSchema.tables, 'posts'>
    >().toEqualTypeOf<never>();
  });

  it('infers schemas added through database.withSchema({ audit })', () => {
    const audit = dumboSchema.schema('audit', {});

    const next = app.withSchema({ audit });

    expectTypeOf(next.schemas.public).toEqualTypeOf(publicSchema);
    expectTypeOf(next.schemas.audit).toEqualTypeOf(audit);
  });

  it('infers default tables added through database.withTable({ posts })', () => {
    const posts = dumboSchema.table('posts');

    const next = flat.withTable({ posts });

    expectTypeOf(next.tables.users).toEqualTypeOf(users);
    expectTypeOf(next.tables.posts).toEqualTypeOf(posts);
    expectTypeOf(next.defaultSchema.tables.posts).toEqualTypeOf(posts);
  });

  it("infers named tables added through database.withTable({ posts }, 'public')", () => {
    const posts = dumboSchema.table('posts');

    const existing = app.withTable({ posts }, 'public');
    const created = flat.withTable({ posts }, 'content');

    expectTypeOf(existing.schemas.public.tables.users).toEqualTypeOf(users);
    expectTypeOf(existing.schemas.public.tables.posts).toEqualTypeOf(posts);
    expectTypeOf(created.schemas.content.tables.posts).toEqualTypeOf(posts);
  });

  it('accepts a runtime schema name without changing known schema types', () => {
    const posts = dumboSchema.table('posts');
    const schemaName: string = 'content';

    const next = app.withTable({ posts }, schemaName);

    expectTypeOf(next.schemas.public).toEqualTypeOf(publicSchema);
    expectTypeOf(next).toExtend<DatabaseComponent>();
  });

  it('types each declaration as its own component kind', () => {
    expectTypeOf(users).toExtend<TableComponent>();
    expectTypeOf(email).toExtend<IndexComponent>();
    expectTypeOf(publicSchema).toExtend<DatabaseSchemaComponent>();
    expectTypeOf(app).toExtend<DatabaseComponent>();
    expectTypeOf(flat).toExtend<DatabaseComponent>();
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

  it('adds named schemas next to unscoped tables', () => {
    expectTypeOf(flat.tables.users).toEqualTypeOf(users);
    expectTypeOf<
      Extract<keyof typeof flat.schemas, 'public'>
    >().toEqualTypeOf<never>();
    expectTypeOf<
      Extract<keyof typeof app.tables, 'users'>
    >().toEqualTypeOf<never>();

    const mixed = dumboSchema
      .database('mixed', { tables: { users } })
      .withSchema({ public: publicSchema });

    expectTypeOf(mixed.tables.users).toEqualTypeOf(users);
    expectTypeOf(mixed.schemas.public.tables.users).toEqualTypeOf(users);

    const empty = dumboSchema.database('empty', {});

    expectTypeOf(empty).toExtend<DatabaseComponent>();
    expectTypeOf<
      Extract<keyof typeof empty.tables, 'users'>
    >().toEqualTypeOf<never>();
  });

  it('holds unscoped tables in the nameless default schema', () => {
    expectTypeOf(flat.defaultSchema.tables.users).toEqualTypeOf(users);
    expectTypeOf(flat.defaultSchema.schemaName).toEqualTypeOf<
      string | SQLDefaultSchemaNameToken
    >();
  });

  it('validates relationships of directly declared tables without naming a scope', () => {
    const posts = dumboSchema.table('posts', {
      columns: {
        id: dumboSchema.column('id', SQL.column.type.Varchar(100)),
        user_id: dumboSchema.column('user_id', SQL.column.type.Varchar(100)),
      },
      relationships: {
        user: {
          columns: ['user_id'],
          references: ['users.id'],
          type: 'many-to-one',
        },
      },
    });

    const valid = dumboSchema.database({ tables: { users, posts } });

    expectTypeOf(valid).toExtend<DatabaseComponent>();
    expectTypeOf(valid.tables.posts).toEqualTypeOf(posts);

    const invalid = dumboSchema.database({ tables: { posts } });

    expectTypeOf(invalid).toEqualTypeOf<{
      valid: false;
      error: [
        {
          table: 'posts';
          errors: [
            {
              relationship: 'user';
              errors: [{ errorCode: 'missing_table'; reference: 'users.id' }];
            },
          ];
        },
      ];
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

  it('names every schema explicitly', () => {
    expectTypeOf(dumboSchema.schema).parameter(0).toEqualTypeOf<string>();
    expectTypeOf(dumboSchema.schema)
      .parameter(1)
      .toExtend<DatabaseSchemaTables>();
    expectTypeOf<
      Extract<keyof typeof dumboSchema, 'defaultSchema'>
    >().toEqualTypeOf<never>();
    expectTypeOf<
      Extract<keyof typeof dumboSchema.schema, 'from'>
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

  it('keeps schemas contributed by extensions reachable through the extension', () => {
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
        readmodels: dumboSchema.schema('readmodels', {
          users: readmodelUsers,
        }),
      },
    });
    const direct = dumboSchema.schema('direct', {});
    const database = dumboSchema.database('app', {
      schemas: { direct },
      extensions: { eventStore, audit },
    });

    expectTypeOf(eventStore.schemas.readmodels.tables.users).toEqualTypeOf(
      readmodelUsers,
    );
    expectTypeOf(audit.schemas.audit.tables.auditLog).toEqualTypeOf(auditLog);
    expectTypeOf(
      database.extensions.eventStore.schemas.readmodels.tables.users,
    ).toEqualTypeOf(readmodelUsers);
    expectTypeOf(database.schemas.direct).toEqualTypeOf(direct);
    expectTypeOf(database.extensions.eventStore).toEqualTypeOf(eventStore);
    expectTypeOf(database.schemas.readmodels).toEqualTypeOf(
      eventStore.schemas.readmodels,
    );
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
