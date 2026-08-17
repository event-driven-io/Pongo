import type {
  AnyDatabaseComponent,
  DatabaseComponent,
  DatabaseSchemaComponent,
  IndexComponent,
  TableRowType,
} from '@event-driven-io/dumbo';
import { dumboSchema, SQL } from '@event-driven-io/dumbo';
import { describe, expectTypeOf, it } from 'vitest';
import type { PongoCollection, PongoDb, PongoDocument } from '../typing';
import {
  pongoSchema,
  type PongoCollectionComponent,
  type PongoDatabaseDefinition,
  type PongoDbSchema,
  type PongoDbWithSchema,
} from './index';

type User = PongoDocument & { email: string };
type Customer = PongoDocument & { company: string };
type AuditEntry = PongoDocument & { reason: string };

describe('typing Pongo declarations and projected databases', () => {
  it('withSchema preserves default collection and named schema types', () => {
    const app = pongoSchema
      .db('app', {
        collections: {
          users: pongoSchema.collection<User>('users'),
        },
      })
      .withSchema({
        crm: pongoSchema.schema('crm', {
          customers: pongoSchema.collection<Customer>('customers'),
        }),
      });
    type AppDatabase = PongoDbWithSchema<typeof app>;

    expectTypeOf(app).toMatchTypeOf<DatabaseComponent>();
    expectTypeOf(app.tables.users).toMatchTypeOf<
      PongoCollectionComponent<User>
    >();
    expectTypeOf(app.schemas.crm).toMatchTypeOf<DatabaseSchemaComponent>();
    expectTypeOf<AppDatabase['users']>().toEqualTypeOf<PongoCollection<User>>();
    expectTypeOf<AppDatabase['crm']['customers']>().toEqualTypeOf<
      PongoCollection<Customer>
    >();
  });

  it('a collection component carries document and index types without placement metadata', () => {
    const _users = pongoSchema.collection<User>('users', {
      indexes: {
        email: pongoSchema.index('users_email_idx', 'email'),
      },
    });

    expectTypeOf<TableRowType<typeof _users>['data']>().toEqualTypeOf<User>();
    expectTypeOf<
      NonNullable<(typeof _users.indexes)['email']>
    >().toMatchTypeOf<IndexComponent>();
    expectTypeOf<
      Extract<keyof typeof _users, 'databaseSchemaName'>
    >().toEqualTypeOf<never>();
  });

  it('a Pongo database declaration is assignable to DatabaseComponent', () => {
    const app = pongoSchema.db('app', {
      collections: { users: pongoSchema.collection<User>('users') },
    });

    expectTypeOf(app).toMatchTypeOf<AnyDatabaseComponent>();
    expectTypeOf(app).toMatchTypeOf<PongoDbSchema>();
    expectTypeOf(app).toMatchTypeOf<DatabaseComponent>();
  });

  it('types an empty database declaration', () => {
    type Empty = Readonly<Record<never, never>>;

    expectTypeOf<{ collections: Empty }>().toExtend<PongoDatabaseDefinition>();
    expectTypeOf<{ schemas: Empty }>().toExtend<PongoDatabaseDefinition>();
    expectTypeOf<Empty>().not.toExtend<PongoDatabaseDefinition>();
    expectTypeOf<{
      collections: Empty;
      schemas: Empty;
    }>().not.toExtend<PongoDatabaseDefinition>();
    expectTypeOf(
      pongoSchema.db({ collections: {} }),
    ).toMatchTypeOf<AnyDatabaseComponent>();
  });

  it('types direct access to a default declared collection', () => {
    const _app = pongoSchema.db({
      collections: { users: pongoSchema.collection<User>('users') },
    });

    expectTypeOf<PongoDbWithSchema<typeof _app>['users']>().toEqualTypeOf<
      PongoCollection<User>
    >();
  });

  it('types direct access to a collection in a named schema', () => {
    const _app = pongoSchema.db({
      schemas: {
        crm: pongoSchema.schema('crm', {
          customers: pongoSchema.collection<Customer>('customers'),
        }),
      },
    });

    expectTypeOf<
      PongoDbWithSchema<typeof _app>['crm']['customers']
    >().toEqualTypeOf<PongoCollection<Customer>>();
  });

  it('the same alias in two schemas retains each document type', () => {
    const _app = pongoSchema.db({
      schemas: {
        crm: pongoSchema.schema('crm', {
          entries: pongoSchema.collection<Customer>('entries'),
        }),
        audit: pongoSchema.schema('audit', {
          entries: pongoSchema.collection<AuditEntry>('entries'),
        }),
      },
    });
    type AppDatabase = PongoDbWithSchema<typeof _app>;

    expectTypeOf<AppDatabase['crm']['entries']>().toEqualTypeOf<
      PongoCollection<Customer>
    >();
    expectTypeOf<AppDatabase['audit']['entries']>().toEqualTypeOf<
      PongoCollection<AuditEntry>
    >();
  });

  it('plain Dumbo relational tables are not projected as Pongo collections', () => {
    const _relational = dumboSchema.database('app', {
      tables: {
        users: dumboSchema.table('users', {
          columns: {
            id: dumboSchema.column('id', SQL.column.type.Text),
          },
        }),
      },
    });
    type RelationalDatabase = PongoDbWithSchema<typeof _relational>;

    expectTypeOf<RelationalDatabase>().toMatchTypeOf<PongoDb>();
    expectTypeOf<
      Extract<keyof RelationalDatabase, 'users'>
    >().toEqualTypeOf<never>();
  });

  it('schemas without direct Pongo collections are not projected', () => {
    const _app = dumboSchema.database('app', {
      schemas: {
        crm: dumboSchema.schema('crm', {
          users: dumboSchema.table('users'),
        }),
      },
    });
    type AppDatabase = PongoDbWithSchema<typeof _app>;

    expectTypeOf<Extract<keyof AppDatabase, 'crm'>>().toEqualTypeOf<never>();
  });

  it('database API member collisions retain the database API type', () => {
    const _collision = pongoSchema.db({
      collections: {
        schema: pongoSchema.collection('schema'),
      },
    });
    type CollisionDatabase = PongoDbWithSchema<typeof _collision>;

    expectTypeOf<CollisionDatabase['schema']>().toEqualTypeOf<
      PongoDb['schema']
    >();
  });
});
