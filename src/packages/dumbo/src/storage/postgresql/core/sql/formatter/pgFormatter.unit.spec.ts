// Ported from: https://github.com/datalanche/node-pg-format/blob/master/test/index.js
import assert from 'node:assert';
import { describe, it } from 'node:test';
import { pgFormatter } from '.';

void describe('pgFormatter.formatIdentifier(val)', () => {
  void it('should quote when necessary', () => {
    assert.equal(pgFormatter.params.mapIdentifier('foo'), 'foo');
    assert.equal(pgFormatter.params.mapIdentifier('_foo'), '_foo');
    assert.equal(
      pgFormatter.params.mapIdentifier('_foo_bar$baz'),
      '_foo_bar$baz',
    );
    assert.equal(
      pgFormatter.params.mapIdentifier('test.some.stuff'),
      '"test.some.stuff"',
    );
    assert.equal(
      pgFormatter.params.mapIdentifier('test."some".stuff'),
      '"test.""some"".stuff"',
    );
  });

  void it('should quote reserved words', () => {
    assert.equal(pgFormatter.params.mapIdentifier('desc'), '"desc"');
    assert.equal(pgFormatter.params.mapIdentifier('join'), '"join"');
    assert.equal(pgFormatter.params.mapIdentifier('cross'), '"cross"');
  });

  void it('throws when undefined', () => {
    try {
      pgFormatter.params.mapIdentifier(undefined!);
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
      pgFormatter.params.mapIdentifier(null!);
      assert.fail();
    } catch (err) {
      assert(
        err instanceof Error &&
          err.message === 'SQL identifier cannot be null or undefined',
      );
    }
  });
});
