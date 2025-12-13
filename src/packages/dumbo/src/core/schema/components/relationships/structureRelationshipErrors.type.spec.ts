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
      _error: 'RELATIONSHIP_VALIDATION_FAILED';
      schemas: {
        public: {
          tables: {
            posts: {
              relationships: {
                user: {
                  errors: [
                    'Schema "nonexistent" does not exist (nonexistent.users.id)',
                  ];
                };
              };
            };
          };
        };
      };
    }>;

    type _Then = Expect<Equals<Result, Expected>>;
  });
});
