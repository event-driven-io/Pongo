import type {
  DatabaseComponent,
  DatabaseSchemaComponent,
  IndexComponent,
  TableComponent,
  TableRowType,
} from '@event-driven-io/dumbo';
import { describe, expectTypeOf, it } from 'vitest';
import type { PongoCollection, PongoDb, PongoDocument } from '../typing';
import {
  pongoSchema,
  pongoDocumentType,
  type PongoDbWithSchema,
} from './index';

type User = PongoDocument & { email: string };

describe('typing Pongo declarations and projected databases', () => {
  it('types direct collection properties from their document declarations', () => {
    const direct = pongoSchema.db('app', {
      collections: {
        users: pongoSchema.collection<User>('users'),
      },
    });
    type DirectDatabase = PongoDbWithSchema<typeof direct>;

    expectTypeOf(direct).toMatchTypeOf<DatabaseComponent>();
    expectTypeOf(direct.collections.users).toMatchTypeOf<TableComponent>();
    expectTypeOf<DirectDatabase['users']>().toEqualTypeOf<
      PongoCollection<User>
    >();
  });

  it('infers the physical collection row from its Dumbo columns', () => {
    const _users = pongoSchema.collection<User>('users');

    expectTypeOf<TableRowType<typeof _users>>().toEqualTypeOf<{
      _id: string;
      data: User;
      metadata: Record<string, unknown>;
      _version: bigint;
      _partition: string;
      _archived: boolean;
      _created: Date;
      _updated: Date;
    }>();
  });

  it('types named schema scopes without promoting their collections', () => {
    const grouped = pongoSchema.db('app', {
      schemas: {
        public: pongoSchema.schema('public', {
          users: pongoSchema.collection<User>('users'),
        }),
      },
    });
    type GroupedDatabase = PongoDbWithSchema<typeof grouped>;

    expectTypeOf(
      grouped.schemas.public,
    ).toMatchTypeOf<DatabaseSchemaComponent>();
    expectTypeOf(
      grouped.schemas.public.tables.users[pongoDocumentType],
    ).toEqualTypeOf<User>();
    expectTypeOf<GroupedDatabase['public']['users']>().toEqualTypeOf<
      PongoCollection<User>
    >();
    // @ts-expect-error Named-schema mode does not promote collections.
    void grouped.collections;
  });

  it('types every Pongo index as a Dumbo index', () => {
    expectTypeOf(
      pongoSchema.index('users_email_idx', 'email'),
    ).toMatchTypeOf<IndexComponent>();
    expectTypeOf(
      pongoSchema.index.unique('users_email_uq', 'email'),
    ).toMatchTypeOf<IndexComponent>();
    expectTypeOf(
      pongoSchema.index.json('users_data_idx'),
    ).toMatchTypeOf<IndexComponent>();
  });

  it('requires exactly one database declaration mode', () => {
    // @ts-expect-error A database declaration must select exactly one mode.
    pongoSchema.db({ collections: {}, schemas: {} });

    // @ts-expect-error A database declaration must select a mode.
    pongoSchema.db({});
  });

  it('keeps database API collisions on the database API type', () => {
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

  it('does not expose internal schema maps or default names at runtime', () => {
    const _grouped = pongoSchema.db('app', {
      schemas: {
        public: pongoSchema.schema('public', {
          users: pongoSchema.collection<User>('users'),
        }),
      },
    });
    type GroupedDatabase = PongoDbWithSchema<typeof _grouped>;
    const db = undefined as unknown as GroupedDatabase;

    // @ts-expect-error Schema groups are projected directly.
    void db.schemas;

    // @ts-expect-error The resolved default schema is internal state.
    void db.defaultSchemaName;
  });
});
