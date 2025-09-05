// Ported from: https://github.com/datalanche/node-pg-format/blob/master/test/index.js
import assert from 'node:assert';
import { describe, it } from 'node:test';
import { pgFormatter } from '.';

void describe('pgFormatter.formatIdentifier(val)', () => {
  void it('should quote when necessary', () => {
    assert.equal(pgFormatter.valueMapper.mapIdentifier('foo'), 'foo');
    assert.equal(pgFormatter.valueMapper.mapIdentifier('_foo'), '_foo');
    assert.equal(
      pgFormatter.valueMapper.mapIdentifier('_foo_bar$baz'),
      '_foo_bar$baz',
    );
    assert.equal(
      pgFormatter.valueMapper.mapIdentifier('test.some.stuff'),
      '"test.some.stuff"',
    );
    assert.equal(
      pgFormatter.valueMapper.mapIdentifier('test."some".stuff'),
      '"test.""some"".stuff"',
    );
  });

  void it('should quote reserved words', () => {
    assert.equal(pgFormatter.valueMapper.mapIdentifier('desc'), '"desc"');
    assert.equal(pgFormatter.valueMapper.mapIdentifier('join'), '"join"');
    assert.equal(pgFormatter.valueMapper.mapIdentifier('cross'), '"cross"');
  });

  void it('throws when undefined', () => {
    try {
      pgFormatter.valueMapper.mapIdentifier(undefined!);
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
      pgFormatter.valueMapper.mapIdentifier(null!);
      assert.fail();
    } catch (err) {
      assert(
        err instanceof Error &&
          err.message === 'SQL identifier cannot be null or undefined',
      );
    }
  });
});
