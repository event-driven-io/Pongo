import assert from 'node:assert';
import { describe, it } from 'vitest';
import { withPongoTransactionOptions } from './pongoTransaction';

describe('withPongoTransactionOptions', () => {
  it('enables nested transactions by default', () => {
    const options = withPongoTransactionOptions();

    assert.deepStrictEqual(options.transactionOptions, {
      allowNestedTransactions: true,
    });
  });

  it('preserves existing transaction options, including savepoints', () => {
    const options = withPongoTransactionOptions({
      pooled: true,
      transactionOptions: {
        useSavepoints: true,
        isolationLevel: 'SERIALIZABLE',
      },
    });

    assert.deepStrictEqual(options, {
      pooled: true,
      transactionOptions: {
        allowNestedTransactions: true,
        useSavepoints: true,
        isolationLevel: 'SERIALIZABLE',
      },
    });
  });

  it('respects explicitly disabled nested transactions', () => {
    const options = withPongoTransactionOptions({
      transactionOptions: {
        allowNestedTransactions: false,
        useSavepoints: true,
      },
    });

    assert.deepStrictEqual(options.transactionOptions, {
      allowNestedTransactions: false,
      useSavepoints: true,
    });
  });
});
