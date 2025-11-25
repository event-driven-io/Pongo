import { describe, it } from 'node:test';
import type { Equals, Expect, IsError, IsOK } from '../../../testing';
import type { TypeValidationResult } from '../../../typing';
import type { AnyColumnSchemaComponent } from '../columnSchemaComponent';
import type { ValidateRelationshipColumns } from './relationshipValidation';

void describe('ValidateRelationshipColumns', () => {
  type ExistingColumns = {
    post_id: AnyColumnSchemaComponent;
    user_id: AnyColumnSchemaComponent;
    tenant_id: AnyColumnSchemaComponent;
  };

  void it('succeeds for single reference and column', () => {
    type SingleColumnAndReferences = {
      columns: ['user_id'];
      references: ['public.users.id'];
      type: 'one-to-one';
    };

    type Result = ValidateRelationshipColumns<
      SingleColumnAndReferences,
      ExistingColumns
    >;

    type _Then = Expect<IsOK<Result>>;
  });

  void it('succeeds for multiple reference and column of the same length', () => {
    type MultipleColumnsAndReferences = {
      columns: ['user_id', 'tenant_id'];
      references: ['public.users.id', 'public.users.tenant_id'];
      type: 'one-to-one';
    };

    type Result = ValidateRelationshipColumns<
      MultipleColumnsAndReferences,
      ExistingColumns
    >;

    type _Then = Expect<IsOK<Result>>;
  });

  void it('fails when references and columns are empty', () => {
    type EmptyRelationship = {
      columns: [];
      references: [];
      type: 'one-to-one';
    };

    type Result = ValidateRelationshipColumns<
      EmptyRelationship,
      ExistingColumns
    >;

    type _Then = [
      Expect<IsError<Result>>,
      Expect<
        Equals<
          Result,
          TypeValidationResult<
            false,
            {
              errorCode: 'reference_columns_mismatch';
              invalidColumns: [];
              availableColumns: keyof ExistingColumns;
            }
          >
        >
      >,
    ];
  });

  void it('fails for single invalid columns', () => {
    type SingleColumnAndReferences = {
      columns: ['invalid'];
      references: ['public.users.id'];
      type: 'one-to-one';
    };

    type Result = ValidateRelationshipColumns<
      SingleColumnAndReferences,
      ExistingColumns
    >;

    type _Then = [
      Expect<IsError<Result>>,
      Expect<
        Equals<
          Result,
          TypeValidationResult<
            false,
            {
              errorCode: 'reference_columns_mismatch';
              invalidColumns: ['invalid'];
              availableColumns: keyof ExistingColumns;
            }
          >
        >
      >,
    ];
  });

  void it('fails for multiple invalid columns', () => {
    type MultipleColumnsAndReferences = {
      columns: ['invalid', 'not_exist'];
      references: ['public.users.id', 'public.users.tenant_id'];
      type: 'one-to-one';
    };

    type Result = ValidateRelationshipColumns<
      MultipleColumnsAndReferences,
      ExistingColumns
    >;

    type _Then = [
      Expect<IsError<Result>>,
      Expect<
        Equals<
          Result,
          TypeValidationResult<
            false,
            {
              errorCode: 'reference_columns_mismatch';
              invalidColumns: ['invalid', 'not_exist'];
              availableColumns: keyof ExistingColumns;
            }
          >
        >
      >,
    ];
  });

  void it('fails for multiple invalid columns with a valid one', () => {
    type MultipleColumnsAndReferences = {
      columns: ['invalid', 'not_exist', 'user_id'];
      references: [
        'public.users.id',
        'public.users.tenant_id',
        'public.users.id',
      ];
      type: 'one-to-one';
    };

    type Result = ValidateRelationshipColumns<
      MultipleColumnsAndReferences,
      ExistingColumns
    >;

    type _Then = [
      Expect<IsError<Result>>,
      Expect<
        Equals<
          Result,
          TypeValidationResult<
            false,
            {
              errorCode: 'reference_columns_mismatch';
              invalidColumns: ['invalid', 'not_exist'];
              availableColumns: keyof ExistingColumns;
            }
          >
        >
      >,
    ];
  });
});
