import assert from 'assert';
import { describe, it } from 'node:test';
import {
  composeJSONReplacers,
  composeJSONRevivers,
  JSONCodec,
  JSONReplacer,
  JSONReplacers,
  JSONReviver,
  JSONRevivers,
  JSONSerializer,
  jsonSerializer,
  RawJSONSerializer,
} from '.';

const UNSAFE_INTEGER = Number.MAX_SAFE_INTEGER + 2;
const UNSAFE_INTEGER_STR = '9007199254740993';
const UNSAFE_BIGINT = 9007199254740993n;

// Detect if JSON.parse reviver supports context.source (Node 21+)
const supportsReviverSource = (() => {
  let hasSource = false;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-call
  (JSON.parse as any)(
    '1',
    (
      _key: string,
      _value: unknown,
      context: { source?: string } | undefined,
    ) => {
      hasSource = context?.source !== undefined;
    },
  );
  return hasSource;
})();

const itWithSource = supportsReviverSource ? it : it.skip;

void describe('JSON Serializer', () => {
  void describe('JSONReplacers', () => {
    void describe('bigInt', () => {
      void it('converts bigint to string', () => {
        const value: bigint = UNSAFE_BIGINT;
        const result = JSONReplacers.bigInt('key', value) as string;

        assert.strictEqual(result, UNSAFE_INTEGER_STR);
      });

      void it('passes non-bigint values through unchanged', () => {
        const stringValue: string = 'hello';
        const numberValue: number = 42;
        const objectValue: object = { foo: 'bar' };

        assert.strictEqual(JSONReplacers.bigInt('key', stringValue), 'hello');
        assert.strictEqual(JSONReplacers.bigInt('key', numberValue), 42);
        assert.deepStrictEqual(JSONReplacers.bigInt('key', objectValue), {
          foo: 'bar',
        });
      });
    });

    void describe('date', () => {
      void it('converts Date to ISO string', () => {
        const date: Date = new Date('2024-01-15T10:30:00.000Z');
        const result = JSONReplacers.date('key', date) as string;

        assert.strictEqual(result, '2024-01-15T10:30:00.000Z');
      });

      void it('passes non-Date values through unchanged', () => {
        const stringValue: string = 'not a date';
        const numberValue: number = 123;
        const objectValue: object = { date: '2024-01-15' };

        assert.strictEqual(
          JSONReplacers.date('key', stringValue),
          'not a date',
        );
        assert.strictEqual(JSONReplacers.date('key', numberValue), 123);
        assert.deepStrictEqual(JSONReplacers.date('key', objectValue), {
          date: '2024-01-15',
        });
      });
    });
  });

  void describe('JSONRevivers', () => {
    void describe('bigInt', () => {
      void it('converts unsafe integer to BigInt using source', () => {
        const result = JSONRevivers.bigInt('key', UNSAFE_INTEGER, {
          source: UNSAFE_INTEGER_STR,
        }) as bigint;

        assert.strictEqual(result, UNSAFE_BIGINT);
      });

      void it('passes safe integers through unchanged', () => {
        const safeNumber: number = 42;
        const result = JSONRevivers.bigInt('key', safeNumber, {
          source: '42',
        }) as number;

        assert.strictEqual(result, 42);
      });

      void it('passes zero through unchanged', () => {
        const result = JSONRevivers.bigInt('key', 0, {
          source: '0',
        }) as number;

        assert.strictEqual(result, 0);
      });

      void it('passes negative integers through unchanged', () => {
        const result = JSONRevivers.bigInt('key', -500, {
          source: '-500',
        }) as number;

        assert.strictEqual(result, -500);
      });

      void it('passes max safe integer through unchanged', () => {
        const result = JSONRevivers.bigInt('key', Number.MAX_SAFE_INTEGER, {
          source: '9007199254740991',
        }) as number;

        assert.strictEqual(result, Number.MAX_SAFE_INTEGER);
      });

      void it('passes min safe integer through unchanged', () => {
        const result = JSONRevivers.bigInt('key', Number.MIN_SAFE_INTEGER, {
          source: '-9007199254740991',
        }) as number;

        assert.strictEqual(result, Number.MIN_SAFE_INTEGER);
      });

      void it('passes floating point numbers through unchanged', () => {
        const floatValue: number = 3.14159;
        const result = JSONRevivers.bigInt('key', floatValue, {
          source: '3.14159',
        }) as number;

        assert.strictEqual(result, 3.14159);
      });

      void it('passes small floating point numbers through unchanged', () => {
        const floatValue: number = 0.001;
        const result = JSONRevivers.bigInt('key', floatValue, {
          source: '0.001',
        }) as number;

        assert.strictEqual(result, 0.001);
      });

      void it('passes large floating point numbers through unchanged', () => {
        const floatValue: number = 1.7976931348623157e308;
        const result = JSONRevivers.bigInt('key', floatValue, {
          source: '1.7976931348623157e+308',
        }) as number;

        assert.strictEqual(result, 1.7976931348623157e308);
      });

      void it('passes negative floating point numbers through unchanged', () => {
        const floatValue: number = -19.99;
        const result = JSONRevivers.bigInt('key', floatValue, {
          source: '-19.99',
        }) as number;

        assert.strictEqual(result, -19.99);
      });

      void it('passes non-numbers through unchanged', () => {
        const stringValue: string = 'hello';
        const result = JSONRevivers.bigInt('key', stringValue, {
          source: '"hello"',
        }) as string;

        assert.strictEqual(result, 'hello');
      });
    });

    void describe('date', () => {
      void it('converts valid ISO string to Date', () => {
        const isoString: string = '2024-01-15T10:30:00.000Z';
        const result = JSONRevivers.date('key', isoString, {
          source: `"${isoString}"`,
        }) as Date;

        assert.ok(result instanceof Date);
        assert.strictEqual(result.toISOString(), isoString);
      });

      void it('passes string with wrong length through unchanged', () => {
        const shortString: string = '2024-01-15';
        const result = JSONRevivers.date('key', shortString, {
          source: `"${shortString}"`,
        }) as string;

        assert.strictEqual(result, '2024-01-15');
      });

      void it('passes string without T at position 10 through unchanged', () => {
        const invalidFormat: string = '2024-01-15X10:30:00.000Z';
        const result = JSONRevivers.date('key', invalidFormat, {
          source: `"${invalidFormat}"`,
        }) as string;

        assert.strictEqual(result, '2024-01-15X10:30:00.000Z');
      });

      void it('passes string without Z at position 23 through unchanged', () => {
        const invalidFormat: string = '2024-01-15T10:30:00.000X';
        const result = JSONRevivers.date('key', invalidFormat, {
          source: `"${invalidFormat}"`,
        }) as string;

        assert.strictEqual(result, '2024-01-15T10:30:00.000X');
      });

      void it('passes invalid date strings through unchanged', () => {
        const invalidDate: string = '9999-99-99T99:99:99.999Z';
        const result = JSONRevivers.date('key', invalidDate, {
          source: `"${invalidDate}"`,
        }) as string;

        assert.strictEqual(result, '9999-99-99T99:99:99.999Z');
      });

      void it('passes non-strings through unchanged', () => {
        const numberValue: number = 123;
        const result = JSONRevivers.date('key', numberValue, {
          source: '123',
        }) as number;

        assert.strictEqual(result, 123);
      });
    });
  });

  void describe('composeJSONReplacers', () => {
    void it('returns undefined when all replacers are undefined', () => {
      const composed = composeJSONReplacers(undefined, undefined);

      assert.strictEqual(composed, undefined);
    });

    void it('chains multiple replacers left-to-right', () => {
      const addPrefix = (_key: string, value: unknown) =>
        typeof value === 'string' ? `prefix_${value}` : value;
      const addSuffix = (_key: string, value: unknown) =>
        typeof value === 'string' ? `${value}_suffix` : value;

      const composed = composeJSONReplacers(addPrefix, addSuffix);
      const result = composed?.('key', 'test') as string;

      assert.strictEqual(result, 'prefix_test_suffix');
    });

    void it('filters out undefined replacers', () => {
      const doubleValue = (_key: string, value: unknown) =>
        typeof value === 'number' ? value * 2 : value;

      const composed = composeJSONReplacers(undefined, doubleValue, undefined);
      const result = composed?.('key', 5) as number;

      assert.strictEqual(result, 10);
    });
  });

  void describe('composeJSONRevivers', () => {
    void it('returns undefined when all revivers are undefined', () => {
      const composed = composeJSONRevivers(undefined, undefined);

      assert.strictEqual(composed, undefined);
    });

    void it('chains multiple revivers left-to-right', () => {
      const toUpperCase = (_key: string, value: unknown) =>
        typeof value === 'string' ? value.toUpperCase() : value;
      const addBrackets = (_key: string, value: unknown) =>
        typeof value === 'string' ? `[${value}]` : value;

      const composed = composeJSONRevivers(toUpperCase, addBrackets);
      const result = composed?.('key', 'test', { source: '"test"' }) as string;

      assert.strictEqual(result, '[TEST]');
    });

    void it('filters out undefined revivers', () => {
      const tripleValue = (_key: string, value: unknown) =>
        typeof value === 'number' ? value * 3 : value;

      const composed = composeJSONRevivers(undefined, tripleValue, undefined);
      const result = composed?.('key', 7, { source: '7' }) as number;

      assert.strictEqual(result, 21);
    });

    void it('passes context through all revivers', () => {
      const contextAwareReviver = (
        _key: string,
        value: unknown,
        context: { source: string },
      ) => (typeof value === 'number' ? `${value}:${context.source}` : value);

      const composed = composeJSONRevivers(contextAwareReviver);
      const result = composed?.('key', 42, { source: '42' }) as string;

      assert.strictEqual(result, '42:42');
    });
  });

  void describe('JSONReplacer factory', () => {
    void it('includes bigInt replacer when parseBigInts is true', () => {
      const replacer = JSONReplacer({ parseBigInts: true });
      const result = replacer?.('key', UNSAFE_BIGINT) as string;

      assert.strictEqual(result, UNSAFE_INTEGER_STR);
    });

    void it('includes date replacer when parseDates is true', () => {
      const replacer = JSONReplacer({ parseDates: true });
      const date: Date = new Date('2024-01-15T10:30:00.000Z');
      const result = replacer?.('key', date) as string;

      assert.strictEqual(result, '2024-01-15T10:30:00.000Z');
    });

    void it('includes custom replacer', () => {
      const customReplacer = (_key: string, value: unknown) =>
        value === 'secret' ? '[REDACTED]' : value;

      const replacer = JSONReplacer({ replacer: customReplacer });
      const result = replacer?.('key', 'secret') as string;

      assert.strictEqual(result, '[REDACTED]');
    });

    void it('composes all replacers together', () => {
      const customReplacer = (_key: string, value: unknown) =>
        typeof value === 'string' ? value.toUpperCase() : value;

      const replacer = JSONReplacer({
        parseBigInts: true,
        parseDates: true,
        replacer: customReplacer,
      });

      assert.strictEqual(replacer?.('key', 123n), '123');

      const date: Date = new Date('2024-01-15T10:30:00.000Z');
      assert.strictEqual(
        replacer?.('key', date),
        '2024-01-15T10:30:00.000Z'.toUpperCase(),
      );
    });

    void it('returns undefined for empty options', () => {
      const replacer = JSONReplacer({});

      assert.strictEqual(replacer, undefined);
    });
  });

  void describe('JSONReviver factory', () => {
    void it('includes bigInt reviver when parseBigInts is true', () => {
      const reviver = JSONReviver({ parseBigInts: true });
      const result = reviver?.('key', UNSAFE_INTEGER, {
        source: UNSAFE_INTEGER_STR,
      }) as bigint;

      assert.strictEqual(result, UNSAFE_BIGINT);
    });

    void it('includes date reviver when parseDates is true', () => {
      const reviver = JSONReviver({ parseDates: true });
      const isoString: string = '2024-01-15T10:30:00.000Z';
      const result = reviver?.('key', isoString, {
        source: `"${isoString}"`,
      }) as Date;

      assert.ok(result instanceof Date);
    });

    void it('includes custom reviver', () => {
      const customReviver = (_key: string, value: unknown) =>
        value === '[REDACTED]' ? 'secret' : value;

      const reviver = JSONReviver({ reviver: customReviver });
      const result = reviver?.('key', '[REDACTED]', {
        source: '"[REDACTED]"',
      }) as string;

      assert.strictEqual(result, 'secret');
    });

    void it('composes all revivers together', () => {
      const customReviver = (_key: string, value: unknown) =>
        typeof value === 'string' ? value.toLowerCase() : value;

      const reviver = JSONReviver({
        parseBigInts: true,
        parseDates: true,
        reviver: customReviver,
      });

      const result = reviver?.('key', UNSAFE_INTEGER, {
        source: UNSAFE_INTEGER_STR,
      }) as bigint;
      assert.strictEqual(result, UNSAFE_BIGINT);
    });

    void it('returns undefined for empty options', () => {
      const reviver = JSONReviver({});

      assert.strictEqual(reviver, undefined);
    });
  });

  void describe('jsonSerializer', () => {
    void describe('number type preservation with parseBigInts', () => {
      void it('preserves regular integers as numbers in JSON', () => {
        const serializer = jsonSerializer({ parseBigInts: true });
        const json = '{"count":42}';
        const result = serializer.deserialize<{ count: number }>(json);

        assert.strictEqual(result.count, 42);
        assert.strictEqual(typeof result.count, 'number');
      });

      void it('preserves zero as number in JSON', () => {
        const serializer = jsonSerializer({ parseBigInts: true });
        const json = '{"value":0}';
        const result = serializer.deserialize<{ value: number }>(json);

        assert.strictEqual(result.value, 0);
        assert.strictEqual(typeof result.value, 'number');
      });

      void it('preserves negative integers as numbers in JSON', () => {
        const serializer = jsonSerializer({ parseBigInts: true });
        const json = '{"value":-999}';
        const result = serializer.deserialize<{ value: number }>(json);

        assert.strictEqual(result.value, -999);
        assert.strictEqual(typeof result.value, 'number');
      });

      void it('preserves floating point numbers in JSON', () => {
        const serializer = jsonSerializer({ parseBigInts: true });
        const json = '{"price":19.99}';
        const result = serializer.deserialize<{ price: number }>(json);

        assert.strictEqual(result.price, 19.99);
        assert.strictEqual(typeof result.price, 'number');
      });

      void it('preserves small floating point numbers in JSON', () => {
        const serializer = jsonSerializer({ parseBigInts: true });
        const json = '{"rate":0.001}';
        const result = serializer.deserialize<{ rate: number }>(json);

        assert.strictEqual(result.rate, 0.001);
        assert.strictEqual(typeof result.rate, 'number');
      });

      void it('preserves negative floating point numbers in JSON', () => {
        const serializer = jsonSerializer({ parseBigInts: true });
        const json = '{"change":-3.14}';
        const result = serializer.deserialize<{ change: number }>(json);

        assert.strictEqual(result.change, -3.14);
        assert.strictEqual(typeof result.change, 'number');
      });

      void itWithSource('converts unsafe integers to BigInt in JSON', () => {
        const serializer = jsonSerializer({ parseBigInts: true });
        const json = `{"id":${UNSAFE_INTEGER_STR}}`;
        const result = serializer.deserialize<{ id: bigint }>(json);

        assert.strictEqual(result.id, UNSAFE_BIGINT);
        assert.strictEqual(typeof result.id, 'bigint');
      });

      void itWithSource('handles mixed numeric types in same object', () => {
        const serializer = jsonSerializer({ parseBigInts: true });
        const json = `{"count":42,"price":19.99,"bigId":${UNSAFE_INTEGER_STR}}`;
        const result = serializer.deserialize<{
          count: number;
          price: number;
          bigId: bigint;
        }>(json);

        assert.strictEqual(result.count, 42);
        assert.strictEqual(typeof result.count, 'number');

        assert.strictEqual(result.price, 19.99);
        assert.strictEqual(typeof result.price, 'number');

        assert.strictEqual(result.bigId, UNSAFE_BIGINT);
        assert.strictEqual(typeof result.bigId, 'bigint');
      });

      void it('preserves max safe integer as number', () => {
        const serializer = jsonSerializer({ parseBigInts: true });
        const json = `{"value":${Number.MAX_SAFE_INTEGER}}`;
        const result = serializer.deserialize<{ value: number }>(json);

        assert.strictEqual(result.value, Number.MAX_SAFE_INTEGER);
        assert.strictEqual(typeof result.value, 'number');
      });

      void itWithSource(
        'handles nested objects with mixed numeric types',
        () => {
          const serializer = jsonSerializer({ parseBigInts: true });
          const json = `{"user":{"age":30,"balance":${UNSAFE_INTEGER_STR}},"meta":{"rate":0.5}}`;
          const result = serializer.deserialize<{
            user: { age: number; balance: bigint };
            meta: { rate: number };
          }>(json);

          assert.strictEqual(result.user.age, 30);
          assert.strictEqual(typeof result.user.age, 'number');

          assert.strictEqual(result.user.balance, UNSAFE_BIGINT);
          assert.strictEqual(typeof result.user.balance, 'bigint');

          assert.strictEqual(result.meta.rate, 0.5);
          assert.strictEqual(typeof result.meta.rate, 'number');
        },
      );

      void itWithSource('handles arrays with mixed numeric types', () => {
        const serializer = jsonSerializer({ parseBigInts: true });
        const json = `[1, 2.5, ${UNSAFE_INTEGER_STR}, -10]`;
        const result = serializer.deserialize<(number | bigint)[]>(json);

        assert.strictEqual(result[0], 1);
        assert.strictEqual(typeof result[0], 'number');

        assert.strictEqual(result[1], 2.5);
        assert.strictEqual(typeof result[1], 'number');

        assert.strictEqual(result[2], UNSAFE_BIGINT);
        assert.strictEqual(typeof result[2], 'bigint');

        assert.strictEqual(result[3], -10);
        assert.strictEqual(typeof result[3], 'number');
      });
    });

    void it('serializes with default replacer', () => {
      const serializer = jsonSerializer({ parseBigInts: true });
      const data: { value: bigint } = { value: 123n };
      const result: string = serializer.serialize(data);

      assert.strictEqual(result, '{"value":"123"}');
    });

    void it('serializes with options override replacer', () => {
      const serializer = jsonSerializer({ parseBigInts: false });
      const customReplacer = (_key: string, value: unknown) =>
        typeof value === 'bigint' ? `BIGINT:${value}` : value;

      const data: { value: bigint } = { value: 456n };
      const result: string = serializer.serialize(data, {
        replacer: customReplacer,
      });

      assert.strictEqual(result, '{"value":"BIGINT:456"}');
    });

    void it('deserializes with default reviver', () => {
      const serializer = jsonSerializer({ parseDates: true });
      const json: string = '{"date":"2024-01-15T10:30:00.000Z"}';
      const result = serializer.deserialize<{ date: Date }>(json);

      assert.ok(result.date instanceof Date);
      assert.strictEqual(result.date.toISOString(), '2024-01-15T10:30:00.000Z');
    });

    void it('deserializes with options override reviver', () => {
      const serializer = jsonSerializer({ parseDates: false });
      const customReviver = (_key: string, value: unknown) =>
        typeof value === 'string' && value.includes('T')
          ? new Date(value)
          : value;

      const json: string = '{"date":"2024-01-15T10:30:00.000Z"}';
      const result = serializer.deserialize<{ date: Date }>(json, {
        reviver: customReviver,
      });

      assert.ok(result.date instanceof Date);
    });

    void it('creates serializer without options', () => {
      const serializer = jsonSerializer();
      const data: { name: string } = { name: 'test' };
      const result: string = serializer.serialize(data);

      assert.strictEqual(result, '{"name":"test"}');
    });
  });

  void describe('JSONSerializer', () => {
    void it('parses BigInts by default', () => {
      const json: string = `{"value":"${UNSAFE_INTEGER_STR}"}`;
      const result = JSONSerializer.deserialize<{ value: bigint }>(json);

      assert.strictEqual(result.value, UNSAFE_BIGINT);
    });

    void it('serializes BigInts by default', () => {
      const data: { value: bigint } = { value: UNSAFE_BIGINT };
      const result: string = JSONSerializer.serialize(data);

      assert.strictEqual(result, `{"value":"${UNSAFE_INTEGER_STR}"}`);
    });
  });

  void describe('RawJSONSerializer', () => {
    void it('does not parse BigInts', () => {
      const json: string = '{"value":42}';
      const result = RawJSONSerializer.deserialize<{ value: number }>(json);

      assert.strictEqual(result.value, 42);
      assert.strictEqual(typeof result.value, 'number');
    });

    void it('serializes without special handling', () => {
      const data: { name: string; count: number } = { name: 'test', count: 42 };
      const result: string = RawJSONSerializer.serialize(data);

      assert.strictEqual(result, '{"name":"test","count":42}');
    });
  });

  void describe('JSONCodec', () => {
    void it('uses provided serializer', () => {
      const customSerializer = jsonSerializer({ parseBigInts: true });
      const codec = JSONCodec({ serializer: customSerializer });

      const data: { value: bigint } = { value: 123n };
      const encoded: string = codec.encode(data);
      assert.strictEqual(encoded, '{"value":"123"}');
    });

    void it('creates serializer from serializerOptions', () => {
      const codec = JSONCodec({
        serializerOptions: { parseBigInts: true, parseDates: true },
      });

      const data: { value: bigint } = { value: 456n };
      const encoded: string = codec.encode(data);
      assert.strictEqual(encoded, '{"value":"456"}');
    });

    void it('creates default serializer when no options', () => {
      const codec = JSONCodec({});
      const data: { name: string } = { name: 'test' };
      const encoded: string = codec.encode(data);

      assert.strictEqual(encoded, '{"name":"test"}');
    });

    void it('encodes with options', () => {
      const codec = JSONCodec({});
      const customReplacer = (_key: string, value: unknown) =>
        typeof value === 'string' ? value.toUpperCase() : value;

      const data: { name: string } = { name: 'test' };
      const encoded: string = codec.encode(data, { replacer: customReplacer });

      assert.strictEqual(encoded, '{"name":"TEST"}');
    });

    void it('encodes without options', () => {
      const codec = JSONCodec({
        serializerOptions: { parseBigInts: true },
      });
      const data: { value: bigint } = { value: 789n };
      const encoded: string = codec.encode(data);

      assert.strictEqual(encoded, '{"value":"789"}');
    });

    void it('decodes with options', () => {
      const codec = JSONCodec<{ name: string }>({});
      const customReviver = (_key: string, value: unknown) =>
        typeof value === 'string' ? value.toLowerCase() : value;

      const json: string = '{"name":"TEST"}';
      const decoded = codec.decode(json, {
        reviver: customReviver,
      });

      assert.strictEqual(decoded.name, 'test');
    });

    void it('decodes without options', () => {
      const codec = JSONCodec<{ value: bigint }>({
        serializerOptions: { parseBigInts: true },
      });
      const json: string = `{"value":"${UNSAFE_INTEGER_STR}"}`;
      const decoded = codec.decode(json);

      assert.strictEqual(decoded.value, UNSAFE_BIGINT);
    });

    void describe('upcast/downcast with document versioning', () => {
      type UserDocV1 = {
        name: string;
        createdAt: string;
        lastLogin: string;
        accountBalance: string;
      };

      type UserDocV2 = {
        profile: {
          name: string;
        };
        timestamps: {
          createdAt: Date;
          lastLogin: Date;
        };
        accountBalance: bigint;
      };

      const upcast = (doc: UserDocV1): UserDocV2 => ({
        profile: { name: doc.name },
        timestamps: {
          createdAt: new Date(doc.createdAt),
          lastLogin: new Date(doc.lastLogin),
        },
        accountBalance: BigInt(doc.accountBalance),
      });

      const downcast = (doc: UserDocV2): UserDocV1 => ({
        name: doc.profile.name,
        createdAt: doc.timestamps.createdAt.toISOString(),
        lastLogin: doc.timestamps.lastLogin.toISOString(),
        accountBalance: doc.accountBalance.toString(),
      });

      void it('upcasts flat document to grouped structure on decode', () => {
        const codec = JSONCodec<UserDocV2, UserDocV1>({
          upcast,
          downcast,
        });

        const flatJson: string = JSON.stringify({
          name: 'Alice',
          createdAt: '2024-01-15T10:30:00.000Z',
          lastLogin: '2024-06-20T14:45:00.000Z',
          accountBalance: UNSAFE_INTEGER_STR,
        });

        const result: UserDocV2 = codec.decode(flatJson);

        assert.strictEqual(result.profile.name, 'Alice');
        assert.ok(result.timestamps.createdAt instanceof Date);
        assert.strictEqual(
          result.timestamps.createdAt.toISOString(),
          '2024-01-15T10:30:00.000Z',
        );
        assert.ok(result.timestamps.lastLogin instanceof Date);
        assert.strictEqual(
          result.timestamps.lastLogin.toISOString(),
          '2024-06-20T14:45:00.000Z',
        );
        assert.strictEqual(result.accountBalance, UNSAFE_BIGINT);
      });

      void it('downcasts grouped document to flat structure on encode', () => {
        const codec = JSONCodec<UserDocV2, UserDocV1>({
          upcast,
          downcast,
        });

        const groupedDoc: UserDocV2 = {
          profile: { name: 'Bob' },
          timestamps: {
            createdAt: new Date('2024-02-20T08:00:00.000Z'),
            lastLogin: new Date('2024-07-15T16:30:00.000Z'),
          },
          accountBalance: 1234567890123456789n,
        };

        const result: string = codec.encode(groupedDoc);
        const parsed = JSON.parse(result) as UserDocV1;

        assert.strictEqual(parsed.name, 'Bob');
        assert.strictEqual(parsed.createdAt, '2024-02-20T08:00:00.000Z');
        assert.strictEqual(parsed.lastLogin, '2024-07-15T16:30:00.000Z');
        assert.strictEqual(parsed.accountBalance, '1234567890123456789');
      });

      void it('roundtrips document through encode/decode with upcast/downcast', () => {
        const codec = JSONCodec<UserDocV2, UserDocV1>({
          upcast,
          downcast,
        });

        const original: UserDocV2 = {
          profile: { name: 'Charlie' },
          timestamps: {
            createdAt: new Date('2024-03-10T12:00:00.000Z'),
            lastLogin: new Date('2024-08-01T09:15:00.000Z'),
          },
          accountBalance: 999999999999999999n,
        };

        const encoded: string = codec.encode(original);
        const decoded: UserDocV2 = codec.decode(encoded);

        assert.strictEqual(decoded.profile.name, original.profile.name);
        assert.strictEqual(
          decoded.timestamps.createdAt.toISOString(),
          original.timestamps.createdAt.toISOString(),
        );
        assert.strictEqual(
          decoded.timestamps.lastLogin.toISOString(),
          original.timestamps.lastLogin.toISOString(),
        );
        assert.strictEqual(decoded.accountBalance, original.accountBalance);
      });

      void it('works without upcast/downcast as identity transform', () => {
        const codec = JSONCodec<{ name: string }>({});

        const data: { name: string } = { name: 'test' };
        const encoded: string = codec.encode(data);
        const decoded = codec.decode(encoded);

        assert.strictEqual(decoded.name, 'test');
      });
    });
  });
});
