import { describe, it } from 'node:test';
import type { Equals, Expect, IsError, IsOK } from '../../../testing';
import type {
  TypeValidationResult,
  TypeValidationSuccess,
} from '../../../typing';
import type { ValidateRelationshipLength } from './relationshipValidation';

void describe('ValidateRelationshipLength', () => {
  void it('succeeds for single reference and column', () => {
    type SingleColumnAndReferences = {
      columns: ['user_id'];
      references: ['public.users.id'];
      type: 'one-to-one';
    };

    type _Result_LengthMismatch =
      ValidateRelationshipLength<SingleColumnAndReferences>;

    type _Then = [
      Expect<IsOK<_Result_LengthMismatch>>,
      Expect<Equals<_Result_LengthMismatch, TypeValidationSuccess>>,
    ];
  });

  void it('succeeds for multiple reference and column of the same length', () => {
    type MultipleColumnsAndReferences = {
      columns: ['user_id', 'tenant_id'];
      references: ['public.users.id', 'public.users.tenant_id'];
      type: 'one-to-one';
    };

    type _Result_LengthMismatch =
      ValidateRelationshipLength<MultipleColumnsAndReferences>;

    type _Assert = [
      Expect<IsOK<_Result_LengthMismatch>>,
      Expect<Equals<_Result_LengthMismatch, TypeValidationSuccess>>,
    ];
  });

  void it('fails when references and columns are empty', () => {
    type EmptyRelationship = {
      columns: [];
      references: [];
      type: 'one-to-one';
    };

    type Result = ValidateRelationshipLength<EmptyRelationship>;

    type _Assert = [
      Expect<IsError<Result>>,
      Expect<
        Equals<
          Result,
          TypeValidationResult<
            false,
            {
              errorCode: 'reference_length_mismatch';
              columns: [];
              references: [];
            }
          >
        >
      >,
    ];
  });

  void it('fails when columns are longer than references', () => {
    type RelWithColumnsLongerThanReferences = {
      columns: ['user_id', 'tenant_id'];
      references: ['public.users.id'];
      type: 'one-to-one';
    };

    type Result =
      ValidateRelationshipLength<RelWithColumnsLongerThanReferences>;

    type _Then = [
      Expect<IsError<Result>>,
      Expect<
        Equals<
          Result,
          TypeValidationResult<
            false,
            {
              errorCode: 'reference_length_mismatch';
              columns: ['user_id', 'tenant_id'];
              references: ['public.users.id'];
            }
          >
        >
      >,
    ];
  });

  void it('fails when references are longer than columns', () => {
    type RelWithReferencesLongerThanColumns = {
      columns: ['user_id'];
      references: ['public.users.id', 'public.users.tenant_id'];
      type: 'one-to-one';
    };

    type Result =
      ValidateRelationshipLength<RelWithReferencesLongerThanColumns>;

    type _Then = [
      Expect<IsError<Result>>,
      Expect<
        Equals<
          Result,
          TypeValidationResult<
            false,
            {
              errorCode: 'reference_length_mismatch';
              columns: ['user_id'];
              references: ['public.users.id', 'public.users.tenant_id'];
            }
          >
        >
      >,
    ];
  });
});
