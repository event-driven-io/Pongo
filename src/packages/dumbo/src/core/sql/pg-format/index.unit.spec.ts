// Ported from: https://github.com/datalanche/node-pg-format/blob/master/test/index.js
import assert from 'node:assert';
import { describe, it } from 'node:test';
import format from './pgFormat';

const testDate = new Date(Date.UTC(2012, 11, 14, 13, 6, 43, 152));
const testArray = ['abc', 1, true, null, testDate];
const testIdentArray = ['abc', 'AbC', 1, true, testDate];
const testObject = { a: 1, b: 2 };
const testNestedArray = [
  [1, 2],
  [3, 4],
  [5, 6],
];

void describe('format(fmt, ...)', () => {
  void describe('%s', () => {
    void it('should format as a simple string', () => {
      assert.equal(format('some %s here', 'thing'), 'some thing here');
      assert.equal(
        format('some %s thing %s', 'long', 'here'),
        'some long thing here',
      );
    });

    void it('should format array of array as simple string', () => {
      assert.equal(
        format('many %s %s', 'things', testNestedArray),
        'many things (1, 2), (3, 4), (5, 6)',
      );
    });

    void it('should format string using position field', () => {
      assert.equal(format('some %1$s', 'thing'), 'some thing');
      assert.equal(format('some %1$s %1$s', 'thing'), 'some thing thing');
      assert.equal(
        format('some %1$s %s', 'thing', 'again'),
        'some thing again',
      );
      assert.equal(
        format('some %1$s %2$s', 'thing', 'again'),
        'some thing again',
      );
      assert.equal(
        format('some %1$s %2$s %1$s', 'thing', 'again'),
        'some thing again thing',
      );
      assert.equal(
        format('some %1$s %2$s %s %1$s', 'thing', 'again', 'some'),
        'some thing again some thing',
      );
    });

    void it('should not format string using position 0', () => {
      assert.throws(() => format('some %0$s', 'thing'));
    });

    void it('should not format string using position field with too few arguments', () => {
      assert.throws(() => format('some %2$s', 'thing'));
    });
  });

  void describe('%%', () => {
    void it('should format as %', () => {
      assert.equal(format('some %%', 'thing'), 'some %');
    });

    void it('should not eat args', () => {
      assert.equal(format('just %% a %s', 'test'), 'just % a test');
    });

    void it('should not format % using position field', () => {
      assert.equal(format('%1$%', 'thing'), '%1$%');
    });
  });

  void describe('%I', () => {
    void it('should format as an identifier', () => {
      assert.equal(format('some %I', 'foo/bar/baz'), 'some "foo/bar/baz"');
    });

    void it('should not format array of array as an identifier', () => {
      assert.throws(() => format('many %I %I', 'foo/bar/baz', testNestedArray));
    });

    void it('should format identifier using position field', () => {
      assert.equal(format('some %1$I', 'thing'), 'some thing');
      assert.equal(format('some %1$I %1$I', 'thing'), 'some thing thing');
      assert.equal(
        format('some %1$I %I', 'thing', 'again'),
        'some thing again',
      );
      assert.equal(
        format('some %1$I %2$I', 'thing', 'again'),
        'some thing again',
      );
      assert.equal(
        format('some %1$I %2$I %1$I', 'thing', 'again'),
        'some thing again thing',
      );
      assert.equal(
        format('some %1$I %2$I %I %1$I', 'thing', 'again', 'huh'),
        'some thing again huh thing',
      );
    });

    void it('should not format identifier using position 0', () => {
      assert.throws(() => format('some %0$I', 'thing'));
    });

    void it('should not format identifier using position field with too few arguments', () => {
      assert.throws(() => format('some %2$I', 'thing'));
    });
  });

  void describe('%L', () => {
    void it('should format as a literal', () => {
      assert.equal(format('%L', "Tobi's"), "'Tobi''s'");
    });

    void it('should format array of array as a literal', () => {
      assert.equal(
        format('%L', testNestedArray),
        "('1', '2'), ('3', '4'), ('5', '6')",
      );
    });

    void it('should format literal using position field', () => {
      assert.equal(format('some %1$L', 'thing'), "some 'thing'");
      assert.equal(format('some %1$L %1$L', 'thing'), "some 'thing' 'thing'");
      assert.equal(
        format('some %1$L %L', 'thing', 'again'),
        "some 'thing' 'again'",
      );
      assert.equal(
        format('some %1$L %2$L', 'thing', 'again'),
        "some 'thing' 'again'",
      );
      assert.equal(
        format('some %1$L %2$L %1$L', 'thing', 'again'),
        "some 'thing' 'again' 'thing'",
      );
      assert.equal(
        format('some %1$L %2$L %L %1$L', 'thing', 'again', 'some'),
        "some 'thing' 'again' 'some' 'thing'",
      );
    });

    void it('should not format literal using position 0', () => {
      assert.throws(() => format('some %0$L', 'thing'));
    });

    void it('should not format literal using position field with too few arguments', () => {
      assert.throws(() => format('some %2$L', 'thing'));
    });
  });
});

void describe('format.withArray(fmt, args)', () => {
  void describe('%s', () => {
    void it('should format as a simple string', () => {
      assert.equal(
        format.withArray('some %s here', ['thing']),
        'some thing here',
      );
      assert.equal(
        format.withArray('some %s thing %s', ['long', 'here']),
        'some long thing here',
      );
    });

    void it('should format array of array as simple string', () => {
      assert.equal(
        format.withArray('many %s %s', ['things', testNestedArray]),
        'many things (1, 2), (3, 4), (5, 6)',
      );
    });
  });

  void describe('%%', () => {
    void it('should format as %', () => {
      assert.equal(format.withArray('some %%', ['thing']), 'some %');
    });

    void it('should not eat args', () => {
      assert.equal(format.withArray('just %% a %s', ['test']), 'just % a test');
      assert.equal(
        format.withArray('just %% a %s %s %s', ['test', 'again', 'and again']),
        'just % a test again and again',
      );
    });
  });

  void describe('%I', () => {
    void it('should format as an identifier', () => {
      assert.equal(
        format.withArray('some %I', ['foo/bar/baz']),
        'some "foo/bar/baz"',
      );
      assert.equal(
        format.withArray('some %I and %I', ['foo/bar/baz', '#hey']),
        'some "foo/bar/baz" and "#hey"',
      );
    });

    void it('should not format array of array as an identifier', () => {
      assert.throws(() =>
        format.withArray('many %I %I', ['foo/bar/baz', testNestedArray]),
      );
    });
  });

  void describe('%L', () => {
    void it('should format as a literal', () => {
      assert.equal(format.withArray('%L', ["Tobi's"]), "'Tobi''s'");
      assert.equal(
        format.withArray('%L %L', ["Tobi's", 'birthday']),
        "'Tobi''s' 'birthday'",
      );
    });

    void it('should format array of array as a literal', () => {
      assert.equal(
        format.withArray('%L', [testNestedArray]),
        "('1', '2'), ('3', '4'), ('5', '6')",
      );
    });
  });
});

void describe('format.string(val)', () => {
  void it('should coerce to a string', () => {
    assert.equal(format.string(undefined), '');
    assert.equal(format.string(null), '');
    assert.equal(format.string(true), 't');
    assert.equal(format.string(false), 'f');
    assert.equal(format.string(0), '0');
    assert.equal(format.string(15), '15');
    assert.equal(format.string(-15), '-15');
    assert.equal(format.string(45.13), '45.13');
    assert.equal(format.string(-45.13), '-45.13');
    assert.equal(format.string('something'), 'something');
    assert.equal(
      format.string(testArray),
      'abc,1,t,2012-12-14 13:06:43.152+00',
    );
    assert.equal(format.string(testNestedArray), '(1, 2), (3, 4), (5, 6)');
    assert.equal(format.string(testDate), '2012-12-14 13:06:43.152+00');
    assert.equal(format.string(testObject), '{"a":1,"b":2}');
  });
});

void describe('format.ident(val)', () => {
  void it('should quote when necessary', () => {
    assert.equal(format.ident('foo'), 'foo');
    assert.equal(format.ident('_foo'), '_foo');
    assert.equal(format.ident('_foo_bar$baz'), '_foo_bar$baz');
    assert.equal(format.ident('test.some.stuff'), '"test.some.stuff"');
    assert.equal(format.ident('test."some".stuff'), '"test.""some"".stuff"');
  });

  void it('should quote reserved words', () => {
    assert.equal(format.ident('desc'), '"desc"');
    assert.equal(format.ident('join'), '"join"');
    assert.equal(format.ident('cross'), '"cross"');
  });

  void it('should quote', () => {
    assert.equal(format.ident(true), '"t"');
    assert.equal(format.ident(false), '"f"');
    assert.equal(format.ident(0), '"0"');
    assert.equal(format.ident(15), '"15"');
    assert.equal(format.ident(-15), '"-15"');
    assert.equal(format.ident(45.13), '"45.13"');
    assert.equal(format.ident(-45.13), '"-45.13"');
    assert.equal(
      format.ident(testIdentArray),
      'abc,"AbC","1","t","2012-12-14 13:06:43.152+00"',
    );
    assert.throws(() => format.ident(testNestedArray));
    assert.equal(format.ident(testDate), '"2012-12-14 13:06:43.152+00"');
  });

  void it('should throw when undefined', () => {
    try {
      format.ident(undefined);
      assert.fail();
    } catch (err) {
      assert(
        err instanceof Error &&
          err.message === 'SQL identifier cannot be null or undefined',
      );
    }
  });

  void it('should throw when null', () => {
    try {
      format.ident(null);
      assert.fail();
    } catch (err) {
      assert(
        err instanceof Error &&
          err.message === 'SQL identifier cannot be null or undefined',
      );
    }
  });

  void it('should throw when object', () => {
    try {
      format.ident({});
      assert.fail();
    } catch (err) {
      assert(
        err instanceof Error &&
          err.message === 'SQL identifier cannot be an object',
      );
    }
  });
});

void describe('format.literal(val)', () => {
  void it('should return NULL for null', () => {
    assert.equal(format.literal(null), 'NULL');
    assert.equal(format.literal(undefined), 'NULL');
  });

  void it('should quote', () => {
    assert.equal(format.literal(true), "'t'");
    assert.equal(format.literal(false), "'f'");
    assert.equal(format.literal(0), "'0'");
    assert.equal(format.literal(15), "'15'");
    assert.equal(format.literal(-15), "'-15'");
    assert.equal(format.literal(45.13), "'45.13'");
    assert.equal(format.literal(-45.13), "'-45.13'");
    assert.equal(format.literal('hello world'), "'hello world'");
    assert.equal(
      format.literal(testArray),
      "'abc','1','t',NULL,'2012-12-14 13:06:43.152+00'",
    );
    assert.equal(
      format.literal(testNestedArray),
      "('1', '2'), ('3', '4'), ('5', '6')",
    );
    assert.equal(format.literal(testDate), "'2012-12-14 13:06:43.152+00'");
    assert.equal(format.literal(testObject), '\'{"a":1,"b":2}\'::jsonb');
  });

  void it('should format quotes', () => {
    assert.equal(format.literal("O'Reilly"), "'O''Reilly'");
  });

  void it('should format backslashes', () => {
    assert.equal(format.literal('\\whoop\\'), "E'\\\\whoop\\\\'");
  });
});
