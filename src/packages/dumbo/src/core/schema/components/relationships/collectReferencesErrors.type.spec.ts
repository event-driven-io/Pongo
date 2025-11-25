import { describe, it } from 'node:test';
import { SQL } from '../../../sql';
import type { Equals, Expect } from '../../../testing';
import { dumboSchema } from '../../dumboSchema';
import type { SchemaColumnName } from './relationshipTypes';
import type {
  CollectReferencesErrors,
  ColumnReferenceExistanceError,
  ColumnReferenceTypeMismatchError,
} from './relationshipValidation';

const { column, table, schema } = dumboSchema;
const { BigInteger, Varchar, Integer } = SQL.column.type;

void describe('CollectReferencesErrors', () => {
  const usersTable = table('users', {
    columns: {
      id: column('id', BigInteger),
      name: column('name', Varchar('max')),
      age: column('age', Integer),
    },
  });

  const postsTable = table('posts', {
    columns: {
      id: column('id', BigInteger),
      user_id: column('user_id', BigInteger),
      title: column('title', Varchar('max')),
    },
  });

  const _publicSchema = schema('public', {
    users: usersTable,
    posts: postsTable,
  });

  type TestSchemas = {
    public: typeof _publicSchema;
  };

  void it('returns empty array when all references are valid', () => {
    type Columns = readonly [SchemaColumnName<'public', 'posts', 'user_id'>];
    type References = readonly [SchemaColumnName<'public', 'users', 'id'>];

    type Result = CollectReferencesErrors<
      Columns,
      References,
      'public',
      'posts',
      TestSchemas
    >;

    type _Then = Expect<Equals<Result, []>>;
  });

  void it('returns empty array for multiple valid references', () => {
    type Columns = readonly [
      SchemaColumnName<'public', 'posts', 'user_id'>,
      SchemaColumnName<'public', 'posts', 'title'>,
    ];
    type References = readonly [
      SchemaColumnName<'public', 'users', 'id'>,
      SchemaColumnName<'public', 'users', 'name'>,
    ];

    type Result = CollectReferencesErrors<
      Columns,
      References,
      'public',
      'posts',
      TestSchemas
    >;

    type _Then = Expect<Equals<Result, []>>;
  });

  void it('collects error for missing schema', () => {
    type Columns = readonly [SchemaColumnName<'public', 'posts', 'user_id'>];
    type References = readonly [SchemaColumnName<'nonexistent', 'users', 'id'>];

    type Result = CollectReferencesErrors<
      Columns,
      References,
      'public',
      'posts',
      TestSchemas
    >;

    type Expected = [
      ColumnReferenceExistanceError<'missing_schema', 'nonexistent.users.id'>,
    ];

    type _Then = Expect<Equals<Result, Expected>>;
  });

  void it('collects error for missing table', () => {
    type Columns = readonly [SchemaColumnName<'public', 'posts', 'user_id'>];
    type References = readonly [
      SchemaColumnName<'public', 'nonexistent', 'id'>,
    ];

    type Result = CollectReferencesErrors<
      Columns,
      References,
      'public',
      'posts',
      TestSchemas
    >;

    type Expected = [
      ColumnReferenceExistanceError<'missing_table', 'public.nonexistent.id'>,
    ];

    type _Then = Expect<Equals<Result, Expected>>;
  });

  void it('collects error for missing column', () => {
    type Columns = readonly [SchemaColumnName<'public', 'posts', 'user_id'>];
    type References = readonly [
      SchemaColumnName<'public', 'users', 'nonexistent'>,
    ];

    type Result = CollectReferencesErrors<
      Columns,
      References,
      'public',
      'posts',
      TestSchemas
    >;

    type Expected = [
      ColumnReferenceExistanceError<
        'missing_column',
        'public.users.nonexistent'
      >,
    ];

    type _Then = Expect<Equals<Result, Expected>>;
  });

  void it('collects error for type mismatch', () => {
    type Columns = readonly [SchemaColumnName<'public', 'posts', 'user_id'>];
    type References = readonly [SchemaColumnName<'public', 'users', 'name'>];

    type Result = CollectReferencesErrors<
      Columns,
      References,
      'public',
      'posts',
      TestSchemas
    >;

    type Expected = [
      ColumnReferenceTypeMismatchError<
        'public.users.name',
        'VARCHAR',
        'BIGINT'
      >,
    ];

    type _Then = Expect<Equals<Result, Expected>>;
  });

  void it('collects multiple errors for different invalid references', () => {
    type Columns = readonly [
      SchemaColumnName<'public', 'posts', 'user_id'>,
      SchemaColumnName<'public', 'posts', 'title'>,
    ];
    type References = readonly [
      SchemaColumnName<'public', 'users', 'nonexistent'>,
      SchemaColumnName<'public', 'users', 'age'>,
    ];

    type Result = CollectReferencesErrors<
      Columns,
      References,
      'public',
      'posts',
      TestSchemas
    >;

    type Expected = [
      ColumnReferenceExistanceError<
        'missing_column',
        'public.users.nonexistent'
      >,
      ColumnReferenceTypeMismatchError<
        'public.users.age',
        'INTEGER',
        'VARCHAR'
      >,
    ];

    type _Then = Expect<Equals<Result, Expected>>;
  });

  void it('collects only errors, skipping valid references', () => {
    type Columns = readonly [
      SchemaColumnName<'public', 'posts', 'user_id'>,
      SchemaColumnName<'public', 'posts', 'title'>,
      SchemaColumnName<'public', 'posts', 'id'>,
    ];
    type References = readonly [
      SchemaColumnName<'public', 'users', 'id'>,
      SchemaColumnName<'public', 'users', 'age'>,
      SchemaColumnName<'public', 'users', 'id'>,
    ];

    type Result = CollectReferencesErrors<
      Columns,
      References,
      'public',
      'posts',
      TestSchemas
    >;

    type Expected = [
      ColumnReferenceTypeMismatchError<
        'public.users.age',
        'INTEGER',
        'VARCHAR'
      >,
    ];

    type _Then = Expect<Equals<Result, Expected>>;
  });

  void it('returns empty array for empty input tuples', () => {
    type Columns = readonly [];
    type References = readonly [];

    type Result = CollectReferencesErrors<
      Columns,
      References,
      'public',
      'posts',
      TestSchemas
    >;

    type _Then = Expect<Equals<Result, []>>;
  });

  void it('accumulates errors with pre-existing errors', () => {
    type Columns = readonly [SchemaColumnName<'public', 'posts', 'user_id'>];
    type References = readonly [
      SchemaColumnName<'public', 'users', 'nonexistent'>,
    ];
    type ExistingError = ColumnReferenceExistanceError<
      'missing_column',
      'public.foo.bar'
    >;

    type Result = CollectReferencesErrors<
      Columns,
      References,
      'public',
      'posts',
      TestSchemas,
      [ExistingError]
    >;

    type Expected = [
      ExistingError,
      ColumnReferenceExistanceError<
        'missing_column',
        'public.users.nonexistent'
      >,
    ];

    type _Then = Expect<Equals<Result, Expected>>;
  });
});
