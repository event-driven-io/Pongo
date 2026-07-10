import assert from 'node:assert';
import { describe, it } from 'vitest';
import { JSONSerializer } from '../../serializer';
import { mapSQLParamValue } from './sqlValueMapper';

const specialCharacterCases = [
  {
    name: 'apostrophes',
    value: {
      title: "director's cut",
      nested: {
        quote: "owner's copy",
        list: ["can't", "won't", "it's"],
      },
    },
  },
  {
    name: 'quotes and slashes',
    value: {
      doubleQuote: 'say "hello"',
      backslash: String.raw`C:\temp\director's-cut`,
      jsonLike: `{"title":"director's cut","path":"C:\\temp"}`,
    },
  },
  {
    name: 'diacritics and unicode',
    value: {
      polish: 'Zażółć gęślą jaźń',
      emoji: 'snowman ☃ and rocket 🚀',
      mixed: "Łódź user's résumé",
    },
  },
  {
    name: 'sql-shaped strings',
    value: {
      clause: "Robert'); DROP TABLE users; --",
      comment: "value' /* comment */",
      keyword: 'select from where',
    },
  },
  {
    name: 'json path-shaped strings',
    value: {
      dotted: 'profile.name',
      sqlitePath: "$.profile['display.name']",
      postgresPath: '{profile,"display.name"}',
    },
  },
  {
    name: 'whitespace and control characters',
    value: {
      multiline: "first line\nsecond line's value",
      tabbed: 'left\tright',
      carriageReturn: 'before\rafter',
    },
  },
] as const;

describe('mapSQLParamValue', () => {
  describe('object values', () => {
    for (const { name, value } of specialCharacterCases) {
      it(`serializes ${name} without SQL escaping bound JSON`, () => {
        assert.deepStrictEqual(
          mapSQLParamValue(value, JSONSerializer),
          JSONSerializer.serialize(value),
        );
      });
    }
  });

  it('maps nested arrays through the same JSON serialization rules', () => {
    const firstObject = { title: "director's cut" };
    const nestedObject = { note: "owner's copy" };
    const value = [firstObject, ["nested user's value", nestedObject]];

    assert.deepStrictEqual(mapSQLParamValue(value, JSONSerializer), [
      JSONSerializer.serialize(firstObject),
      ["nested user's value", JSONSerializer.serialize(nestedObject)],
    ]);
  });

  it('keeps primitive values unchanged', () => {
    assert.strictEqual(
      mapSQLParamValue("director's cut", JSONSerializer),
      "director's cut",
    );
    assert.strictEqual(mapSQLParamValue(123, JSONSerializer), 123);
    assert.strictEqual(mapSQLParamValue(true, JSONSerializer), true);
    assert.strictEqual(mapSQLParamValue(null, JSONSerializer), null);
  });

  it('honors the mapObject override', () => {
    const document = { title: "director's cut" };

    const result = mapSQLParamValue(document, JSONSerializer, {
      mapObject: (value) => value,
    });

    assert.strictEqual(result, document);
  });
});
