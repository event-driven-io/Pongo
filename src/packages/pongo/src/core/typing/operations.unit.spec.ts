import assert from 'node:assert/strict';
import { describe, it } from 'vitest';
import {
  DOCUMENT_DOES_NOT_EXIST,
  DOCUMENT_EXISTS,
  NO_CONCURRENCY_CHECK,
  expectedVersionPredicate,
} from './operations';

describe('expectedVersionPredicate', () => {
  it('maps undefined to no predicate', () => {
    assert.deepEqual(expectedVersionPredicate(undefined), { operator: 'none' });
  });

  it('maps NO_CONCURRENCY_CHECK to no predicate', () => {
    assert.deepEqual(expectedVersionPredicate(NO_CONCURRENCY_CHECK), {
      operator: 'none',
    });
  });

  it('maps DOCUMENT_EXISTS to no predicate (existence enforced by the row match)', () => {
    assert.deepEqual(expectedVersionPredicate(DOCUMENT_EXISTS), {
      operator: 'none',
    });
  });

  it('maps DOCUMENT_DOES_NOT_EXIST to _version = 0', () => {
    assert.deepEqual(expectedVersionPredicate(DOCUMENT_DOES_NOT_EXIST), {
      operator: '=',
      value: 0n,
    });
  });

  it('maps a concrete version to _version = that value', () => {
    assert.deepEqual(expectedVersionPredicate(5n), {
      operator: '=',
      value: 5n,
    });
  });
});
