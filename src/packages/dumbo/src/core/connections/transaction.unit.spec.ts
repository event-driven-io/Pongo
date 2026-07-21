import assert from 'node:assert';
import { describe, it } from 'vitest';
import { InvalidOperationError } from '../errors';
import {
  databaseTransaction,
  executeInNestedTransaction,
  transactionNestingCounter,
} from './transaction';

describe('transactionNestingCounter', () => {
  it('starts at level 0', () => {
    const counter = transactionNestingCounter();
    assert.strictEqual(counter.level, 0);
  });

  it('increments, decrements, and resets', () => {
    const counter = transactionNestingCounter();
    counter.increment();
    counter.increment();
    assert.strictEqual(counter.level, 2);
    counter.decrement();
    assert.strictEqual(counter.level, 1);
    counter.reset();
    assert.strictEqual(counter.level, 0);
  });

  it('throws when decremented below zero', () => {
    const counter = transactionNestingCounter();
    assert.throws(() => counter.decrement(), /out of bounds/i);
  });
});

const makeBackend = () => {
  const calls: string[] = [];
  return {
    calls,
    backend: {
      begin: () => {
        calls.push('begin');
        return Promise.resolve();
      },
      commit: () => {
        calls.push('commit');
        return Promise.resolve();
      },
      rollback: () => {
        calls.push('rollback');
        return Promise.resolve();
      },
      savepoint: (level: number) => {
        calls.push(`savepoint:${level}`);
        return Promise.resolve();
      },
      releaseSavepoint: (level: number) => {
        calls.push(`release:${level}`);
        return Promise.resolve();
      },
      rollbackToSavepoint: (level: number) => {
        calls.push(`rollbackTo:${level}`);
        return Promise.resolve();
      },
    },
  };
};

describe('databaseTransaction', () => {
  it('runs backend begin and commit for a single transaction', async () => {
    const { backend, calls } = makeBackend();
    const tx = databaseTransaction(backend);

    await tx.begin();
    await tx.commit();

    assert.deepStrictEqual(calls, ['begin', 'commit']);
  });

  it('rejects nested begin when nested transactions are disabled', async () => {
    const { backend, calls } = makeBackend();
    const tx = databaseTransaction(backend);

    await tx.begin();
    await assert.rejects(
      () => tx.begin(),
      (err) =>
        err instanceof InvalidOperationError &&
        /allowNestedTransactions/.test(err.message),
    );

    assert.deepStrictEqual(calls, ['begin']);
  });

  it('treats nested commit and rollback as backend no-ops without savepoints', async () => {
    const { backend, calls } = makeBackend();
    const tx = databaseTransaction(backend, {
      allowNestedTransactions: true,
    });

    await tx.begin();
    await tx.begin();
    await tx.commit();
    await tx.commit();
    await tx.begin();
    await tx.begin();
    await tx.rollback();
    await tx.rollback();

    assert.deepStrictEqual(calls, ['begin', 'commit', 'begin', 'rollback']);
  });

  it('uses savepoints for nested commit and rollback when enabled', async () => {
    const { backend, calls } = makeBackend();
    const tx = databaseTransaction(backend, {
      allowNestedTransactions: true,
      useSavepoints: true,
    });

    await tx.begin();
    await tx.begin();
    await tx.begin();
    await tx.commit();
    await tx.rollback();
    await tx.commit();

    assert.deepStrictEqual(calls, [
      'begin',
      'savepoint:2',
      'savepoint:3',
      'release:3',
      'rollbackTo:2',
      'commit',
    ]);
  });

  it('skips savepoint calls when hooks are not provided', async () => {
    const calls: string[] = [];
    const tx = databaseTransaction(
      {
        begin: () => {
          calls.push('begin');
          return Promise.resolve();
        },
        commit: () => {
          calls.push('commit');
          return Promise.resolve();
        },
        rollback: () => {
          calls.push('rollback');
          return Promise.resolve();
        },
      },
      { allowNestedTransactions: true, useSavepoints: true },
    );

    await tx.begin();
    await tx.begin();
    await tx.commit();
    await tx.commit();

    assert.deepStrictEqual(calls, ['begin', 'commit']);
  });
});

describe('executeInNestedTransaction', () => {
  it('rejects when nested transactions are disabled on the transaction object', async () => {
    const { backend } = makeBackend();
    const tx = {
      ...databaseTransaction(backend),
      _transactionOptions: { allowNestedTransactions: false },
    };

    await assert.rejects(
      () => executeInNestedTransaction(tx, () => Promise.resolve(undefined)),
      (err) =>
        err instanceof InvalidOperationError &&
        /allowNestedTransactions/.test(err.message),
    );
  });
});
