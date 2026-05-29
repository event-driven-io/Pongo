import assert from 'node:assert';
import { describe, it } from 'vitest';
import { InvalidOperationError } from '../errors';
import { databaseTransaction, transactionNestingCounter } from './transaction';

describe('transactionNestingCounter', () => {
  it('starts at level 0', () => {
    const counter = transactionNestingCounter();
    assert.strictEqual(counter.level, 0);
  });

  it('increments / decrements / resets', () => {
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
      rollback: (_err?: unknown) => {
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
  describe('allowNestedTransactions: false (default)', () => {
    it('first begin runs backend.begin, commit runs backend.commit', async () => {
      const { backend, calls } = makeBackend();
      const tx = databaseTransaction(backend);

      await tx.begin();
      await tx.commit();

      assert.deepStrictEqual(calls, ['begin', 'commit']);
    });

    it('second begin throws InvalidOperationError mentioning the flag', async () => {
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

    it('rollback after begin runs backend.rollback', async () => {
      const { backend, calls } = makeBackend();
      const tx = databaseTransaction(backend);

      await tx.begin();
      await tx.rollback();

      assert.deepStrictEqual(calls, ['begin', 'rollback']);
    });
  });

  describe('allowNestedTransactions: true, useSavepoints: false', () => {
    it('nested begin/commit/rollback are no-ops at the backend layer', async () => {
      const { backend, calls } = makeBackend();
      const tx = databaseTransaction(backend, {
        allowNestedTransactions: true,
      });

      await tx.begin(); // outer
      await tx.begin(); // nested
      await tx.commit(); // nested commit — no-op
      await tx.commit(); // outer commit

      assert.deepStrictEqual(calls, ['begin', 'commit']);
    });

    it('outer rollback runs backend.rollback; nested rollback is a no-op', async () => {
      const { backend, calls } = makeBackend();
      const tx = databaseTransaction(backend, {
        allowNestedTransactions: true,
      });

      await tx.begin();
      await tx.begin();
      await tx.rollback();
      await tx.rollback();

      assert.deepStrictEqual(calls, ['begin', 'rollback']);
    });

    it('outer can begin again after committing (counter resets)', async () => {
      const { backend, calls } = makeBackend();
      const tx = databaseTransaction(backend, {
        allowNestedTransactions: true,
      });

      await tx.begin();
      await tx.commit();
      await tx.begin();
      await tx.commit();

      assert.deepStrictEqual(calls, ['begin', 'commit', 'begin', 'commit']);
    });
  });

  describe('allowNestedTransactions: true, useSavepoints: true', () => {
    it('nested begin runs savepoint, nested commit runs releaseSavepoint', async () => {
      const { backend, calls } = makeBackend();
      const tx = databaseTransaction(backend, {
        allowNestedTransactions: true,
        useSavepoints: true,
      });

      await tx.begin(); // outer: backend.begin
      await tx.begin(); // nested: savepoint:2
      await tx.commit(); // nested: release:2
      await tx.commit(); // outer: backend.commit

      assert.deepStrictEqual(calls, [
        'begin',
        'savepoint:2',
        'release:2',
        'commit',
      ]);
    });

    it('nested rollback runs rollbackToSavepoint', async () => {
      const { backend, calls } = makeBackend();
      const tx = databaseTransaction(backend, {
        allowNestedTransactions: true,
        useSavepoints: true,
      });

      await tx.begin();
      await tx.begin();
      await tx.rollback();
      await tx.commit();

      assert.deepStrictEqual(calls, [
        'begin',
        'savepoint:2',
        'rollbackTo:2',
        'commit',
      ]);
    });

    it('savepoint level reflects current nesting depth', async () => {
      const { backend, calls } = makeBackend();
      const tx = databaseTransaction(backend, {
        allowNestedTransactions: true,
        useSavepoints: true,
      });

      await tx.begin(); // level 1
      await tx.begin(); // level 2
      await tx.begin(); // level 3
      await tx.commit(); // level 3 → release:3
      await tx.commit(); // level 2 → release:2
      await tx.commit(); // level 1 → backend.commit

      assert.deepStrictEqual(calls, [
        'begin',
        'savepoint:2',
        'savepoint:3',
        'release:3',
        'release:2',
        'commit',
      ]);
    });
  });

  describe('savepoint hooks are optional', () => {
    it('skips savepoint when useSavepoints is true but backend has no savepoint hook', async () => {
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
});
