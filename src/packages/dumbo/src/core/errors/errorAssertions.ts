import assert from 'node:assert';
import { DumboError } from './index';

export type ExpectedDumboError = {
  errorType: string;
  errorCode: number;
  message: string;
};

const assertDumboError = (
  error: unknown,
  expected: ExpectedDumboError,
): void => {
  assert.ok(
    DumboError.isInstanceOf(error),
    `Expected a DumboError, got: ${String(error)}`,
  );
  assert.strictEqual(error.errorType, expected.errorType);
  assert.strictEqual(error.errorCode, expected.errorCode);
  assert.strictEqual(error.message, expected.message);
};

export const assertThrowsDumboError = (
  operation: () => unknown,
  expected: ExpectedDumboError,
): void => {
  try {
    operation();
  } catch (error) {
    assertDumboError(error, expected);
    return;
  }

  assert.fail(`Expected ${expected.errorType} to be thrown, but it wasn't`);
};

export const assertRejectsDumboError = async (
  operation: () => Promise<unknown>,
  expected: ExpectedDumboError,
): Promise<void> => {
  try {
    await operation();
  } catch (error) {
    assertDumboError(error, expected);
    return;
  }

  assert.fail(`Expected ${expected.errorType} to be rejected, but it wasn't`);
};
