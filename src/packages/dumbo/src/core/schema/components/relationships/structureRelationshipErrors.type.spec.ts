import { describe, it } from 'node:test';
import type { Equals, Expect } from '../../../testing';
import type { TypeValidationError } from '../../../typing';
import type { StructureValidationErrors } from './structureRelationshipErrors';

void describe('StructureValidationErrors', () => {
  void it('returns hardcoded error structure for any validation error', () => {
    type Input = TypeValidationError<
      [
        {
          schema: 'public';
          errors: [
            {
              table: 'posts';
              errors: [
                {
                  relationship: 'user';
                  errors: [
                    {
                      errorCode: 'missing_schema';
                      reference: 'nonexistent.users.id';
                    },
                  ];
                },
              ];
            },
          ];
        },
      ]
    >;

    type Result = StructureValidationErrors<Input>;

    type Expected = TypeValidationError<{
      public: {
        posts: {
          relationships: {
            user: [
              "relationship public.posts.user: schema 'nonexistent' not found",
            ];
          };
        };
      };
    }>;

    type _Then = Expect<Equals<Result, Expected>>;
  });
});
