// Ported from: https://github.com/datalanche/node-pg-format/blob/master/test/index.js
import assert from 'node:assert';
import { describe, it } from 'node:test';
import { pgFormatter } from '.';

void describe('pgFormatter.formatIdentifier(val)', () => {
  void it('should quote when necessary', () => {
    assert.equal(pgFormatter.formatIdentifier('foo'), 'foo');
    assert.equal(pgFormatter.formatIdentifier('_foo'), '_foo');
    assert.equal(pgFormatter.formatIdentifier('_foo_bar$baz'), '_foo_bar$baz');
    assert.equal(
      pgFormatter.formatIdentifier('test.some.stuff'),
      '"test.some.stuff"',
    );
    assert.equal(
      pgFormatter.formatIdentifier('test."some".stuff'),
      '"test.""some"".stuff"',
    );
  });

  void it('should quote reserved words', () => {
    assert.equal(pgFormatter.formatIdentifier('desc'), '"desc"');
    assert.equal(pgFormatter.formatIdentifier('join'), '"join"');
    assert.equal(pgFormatter.formatIdentifier('cross'), '"cross"');
  });

  void it('throws when undefined', () => {
    try {
      pgFormatter.formatIdentifier(undefined!);
      assert.fail();
    } catch (err) {
      assert(
        err instanceof Error &&
          err.message === 'SQL identifier cannot be null or undefined',
      );
    }
  });

  void it('throws when null', () => {
    try {
      pgFormatter.formatIdentifier(null!);
      assert.fail();
    } catch (err) {
      assert(
        err instanceof Error &&
          err.message === 'SQL identifier cannot be null or undefined',
      );
    }
  });
});
