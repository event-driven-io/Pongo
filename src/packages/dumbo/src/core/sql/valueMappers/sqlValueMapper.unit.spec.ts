import assert from 'assert';
import { describe, it } from 'vitest';
import { JSONSerializer } from '../../serializer';
import { mapSQLParamValue } from './sqlValueMapper';

describe('mapSQLParamValue', () => {
  it('maps object values to serialized JSON without escaping single quotes', () => {
    const result = mapSQLParamValue(
      { title: "director's cut" },
      JSONSerializer,
    );

    assert.strictEqual(result, `{"title":"director's cut"}`);
  });

  it('maps nested object values without escaping single quotes', () => {
    const result = mapSQLParamValue(
      { title: "director's cut", metadata: { note: "author's note" } },
      JSONSerializer,
    );

    assert.strictEqual(
      result,
      `{"title":"director's cut","metadata":{"note":"author's note"}}`,
    );
  });

  it('maps objects nested in arrays without escaping single quotes', () => {
    const result = mapSQLParamValue(
      [{ title: "director's cut" }],
      JSONSerializer,
    );

    assert.deepStrictEqual(result, [`{"title":"director's cut"}`]);
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
