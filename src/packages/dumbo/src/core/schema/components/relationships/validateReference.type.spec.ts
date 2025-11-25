import { describe, it } from 'node:test';
import { SQL } from '../../../sql';
import type { Equals, Expect, IsError } from '../../../testing';
import type { TypeValidationResult } from '../../../typing';
import { dumboSchema } from '../../dumboSchema';
import type { SchemaColumnName } from './relationshipTypes';
import type { ValidateReference } from './relationshipValidation';

const { column, table, schema } = dumboSchema;
const { BigInteger, Varchar, Integer } = SQL.column.type;

void describe('ValidateReference', () => {
  const usersTable = table('users', {
    columns: {
      id: column('id', BigInteger),
      name: column('name', Varchar('max')),
      age: column('age', Integer),
    },
  });

  const postsTable = table('posts', {
    columns: {
      post_id: column('post_id', BigInteger),
      user_id: column('user_id', BigInteger),
      title: column('title', Varchar('max')),
      view_count: column('view_count', Integer),
    },
  });

  const _publicSchema = schema('public', {
    users: usersTable,
    posts: postsTable,
  });

  type TestSchemas = {
    public: typeof _publicSchema;
  };

  void describe('reference existence validation', () => {
    void it('fails when referenced schema does not exist', () => {
      type RefPath = SchemaColumnName<'nonexistent', 'users', 'id'>;
      type ColPath = SchemaColumnName<'public', 'posts', 'user_id'>;

      type Result = ValidateReference<RefPath, ColPath, TestSchemas>;

      type _Then = [
        Expect<IsError<Result>>,
        Expect<
          Equals<
            Result,
            TypeValidationResult<
              false,
              {
                errorCode: 'missing_schema';
                reference: 'nonexistent.users.id';
              }
            >
          >
        >,
      ];
    });

    void it('fails when referenced table does not exist', () => {
      type RefPath = SchemaColumnName<'public', 'nonexistent', 'id'>;
      type ColPath = SchemaColumnName<'public', 'posts', 'user_id'>;

      type Result = ValidateReference<RefPath, ColPath, TestSchemas>;

      type _Then = [
        Expect<IsError<Result>>,
        Expect<
          Equals<
            Result,
            TypeValidationResult<
              false,
              {
                errorCode: 'missing_table';
                reference: 'public.nonexistent.id';
              }
            >
          >
        >,
      ];
    });

    void it('fails when referenced column does not exist', () => {
      type RefPath = SchemaColumnName<'public', 'users', 'nonexistent'>;
      type ColPath = SchemaColumnName<'public', 'posts', 'user_id'>;

      type Result = ValidateReference<RefPath, ColPath, TestSchemas>;

      type _Then = [
        Expect<IsError<Result>>,
        Expect<
          Equals<
            Result,
            TypeValidationResult<
              false,
              {
                errorCode: 'missing_column';
                reference: 'public.users.nonexistent';
              }
            >
          >
        >,
      ];
    });
  });

  void describe('type matching: both ColumnTypeToken', () => {
    void it('validates when types match', () => {
      type RefPath = SchemaColumnName<'public', 'users', 'id'>;
      type ColPath = SchemaColumnName<'public', 'posts', 'user_id'>;

      type Result = ValidateReference<RefPath, ColPath, TestSchemas>;

      type _Then = Expect<
        Equals<Result, TypeValidationResult<true, undefined>>
      >;
    });

    void it('fails when types do not match', () => {
      type RefPath = SchemaColumnName<'public', 'users', 'name'>;
      type ColPath = SchemaColumnName<'public', 'posts', 'user_id'>;

      type Result = ValidateReference<RefPath, ColPath, TestSchemas>;

      type _Then = [
        Expect<IsError<Result>>,
        Expect<
          Equals<
            Result,
            TypeValidationResult<
              false,
              {
                errorCode: 'type_mismatch';
                reference: 'public.users.name';
                referenceType: 'VARCHAR';
                columnTypeName: 'BIGINT';
              }
            >
          >
        >,
      ];
    });

    void it('fails when integer does not match bigint', () => {
      type RefPath = SchemaColumnName<'public', 'users', 'age'>;
      type ColPath = SchemaColumnName<'public', 'posts', 'user_id'>;

      type Result = ValidateReference<RefPath, ColPath, TestSchemas>;

      type _Then = [
        Expect<IsError<Result>>,
        Expect<
          Equals<
            Result,
            TypeValidationResult<
              false,
              {
                errorCode: 'type_mismatch';
                reference: 'public.users.age';
                referenceType: 'INTEGER';
                columnTypeName: 'BIGINT';
              }
            >
          >
        >,
      ];
    });
  });

  void describe('type matching: ColumnType is ColumnTypeToken, RefColumnType is string', () => {
    const stringRefTable = table('string_ref', {
      columns: {
        id: column('id', 'BIGINT'),
        label: column('label', 'VARCHAR'),
      },
    });

    const _mixedSchema1 = schema('mixed1', {
      string_ref: stringRefTable,
      posts: postsTable,
    });

    type MixedSchemas1 = {
      mixed1: typeof _mixedSchema1;
    };

    void it('validates when string reference type matches ColumnTypeToken', () => {
      type RefPath = SchemaColumnName<'mixed1', 'string_ref', 'id'>;
      type ColPath = SchemaColumnName<'mixed1', 'posts', 'user_id'>;

      type Result = ValidateReference<RefPath, ColPath, MixedSchemas1>;

      type _Then = Expect<
        Equals<Result, TypeValidationResult<true, undefined>>
      >;
    });

    void it('fails when string reference type does not match ColumnTypeToken', () => {
      type RefPath = SchemaColumnName<'mixed1', 'string_ref', 'label'>;
      type ColPath = SchemaColumnName<'mixed1', 'posts', 'user_id'>;

      type Result = ValidateReference<RefPath, ColPath, MixedSchemas1>;

      type _Then = [
        Expect<IsError<Result>>,
        Expect<
          Equals<
            Result,
            TypeValidationResult<
              false,
              {
                errorCode: 'type_mismatch';
                reference: 'mixed1.string_ref.label';
                referenceType: 'VARCHAR';
                columnTypeName: 'BIGINT';
              }
            >
          >
        >,
      ];
    });
  });

  void describe('type matching: RefColumnType is ColumnTypeToken, ColumnType is string', () => {
    const stringColTable = table('string_col', {
      columns: {
        id: column('id', 'BIGINT'),
        count: column('count', 'INTEGER'),
      },
    });

    const _mixedSchema2 = schema('mixed2', {
      string_col: stringColTable,
      users: usersTable,
    });

    type MixedSchemas2 = {
      mixed2: typeof _mixedSchema2;
    };

    void it('validates when ColumnTypeToken reference matches string type', () => {
      type RefPath = SchemaColumnName<'mixed2', 'users', 'id'>;
      type ColPath = SchemaColumnName<'mixed2', 'string_col', 'id'>;

      type Result = ValidateReference<RefPath, ColPath, MixedSchemas2>;

      type _Then = Expect<
        Equals<Result, TypeValidationResult<true, undefined>>
      >;
    });

    void it('fails when ColumnTypeToken reference does not match string type', () => {
      type RefPath = SchemaColumnName<'mixed2', 'users', 'age'>;
      type ColPath = SchemaColumnName<'mixed2', 'string_col', 'id'>;

      type Result = ValidateReference<RefPath, ColPath, MixedSchemas2>;

      type _Then = [
        Expect<IsError<Result>>,
        Expect<
          Equals<
            Result,
            TypeValidationResult<
              false,
              {
                errorCode: 'type_mismatch';
                reference: 'mixed2.users.age';
                referenceType: 'INTEGER';
                columnTypeName: 'BIGINT';
              }
            >
          >
        >,
      ];
    });
  });

  void describe('type matching: both are strings', () => {
    const stringOnlyTable1 = table('string_only1', {
      columns: {
        id: column('id', 'BIGINT'),
        label: column('label', 'VARCHAR'),
      },
    });

    const stringOnlyTable2 = table('string_only2', {
      columns: {
        ref_id: column('ref_id', 'BIGINT'),
        description: column('description', 'VARCHAR'),
      },
    });

    const _mixedSchema3 = schema('mixed3', {
      string_only1: stringOnlyTable1,
      string_only2: stringOnlyTable2,
    });

    type MixedSchemas3 = {
      mixed3: typeof _mixedSchema3;
    };

    void it('validates when both string types match', () => {
      type RefPath = SchemaColumnName<'mixed3', 'string_only1', 'id'>;
      type ColPath = SchemaColumnName<'mixed3', 'string_only2', 'ref_id'>;

      type Result = ValidateReference<RefPath, ColPath, MixedSchemas3>;

      type _Then = Expect<
        Equals<Result, TypeValidationResult<true, undefined>>
      >;
    });

    void it('fails when both string types do not match', () => {
      type RefPath = SchemaColumnName<'mixed3', 'string_only1', 'label'>;
      type ColPath = SchemaColumnName<'mixed3', 'string_only2', 'ref_id'>;

      type Result = ValidateReference<RefPath, ColPath, MixedSchemas3>;

      type _Then = [
        Expect<IsError<Result>>,
        Expect<
          Equals<
            Result,
            TypeValidationResult<
              false,
              {
                errorCode: 'type_mismatch';
                reference: 'mixed3.string_only1.label';
                referenceType: 'VARCHAR';
                columnTypeName: 'BIGINT';
              }
            >
          >
        >,
      ];
    });
  });

  void describe('edge cases', () => {
    void it('validates self-referencing column', () => {
      type RefPath = SchemaColumnName<'public', 'users', 'id'>;
      type ColPath = SchemaColumnName<'public', 'users', 'id'>;

      type Result = ValidateReference<RefPath, ColPath, TestSchemas>;

      type _Then = Expect<
        Equals<Result, TypeValidationResult<true, undefined>>
      >;
    });

    void it('validates reference across different tables with same type', () => {
      type RefPath = SchemaColumnName<'public', 'posts', 'post_id'>;
      type ColPath = SchemaColumnName<'public', 'users', 'id'>;

      type Result = ValidateReference<RefPath, ColPath, TestSchemas>;

      type _Then = Expect<
        Equals<Result, TypeValidationResult<true, undefined>>
      >;
    });
  });
});
