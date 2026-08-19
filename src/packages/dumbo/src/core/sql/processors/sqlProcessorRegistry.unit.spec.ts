import assert from 'node:assert/strict';
import { describe, it } from 'vitest';
import { SQLProcessor } from './sqlProcessor';
import { SQLProcessorsRegistry } from './sqlProcessorRegistry';

const processorFor = (tokenType: string) =>
  SQLProcessor({
    canHandle: tokenType,
    handle: () => {},
  });

describe('registering SQL processors', () => {
  it('registers a single processor passed on its own', () => {
    const processor = processorFor('SQL_TEST_TOKEN');

    const registry = SQLProcessorsRegistry().register(processor);

    assert.strictEqual(registry.get('SQL_TEST_TOKEN'), processor);
  });

  it('registers processors passed as a record', () => {
    const processor = processorFor('SQL_TEST_TOKEN');

    const registry = SQLProcessorsRegistry().register({ test: processor });

    assert.strictEqual(registry.get('SQL_TEST_TOKEN'), processor);
  });

  it('registers several processors passed as arguments', () => {
    const first = processorFor('SQL_FIRST_TOKEN');
    const second = processorFor('SQL_SECOND_TOKEN');

    const registry = SQLProcessorsRegistry().register(first, second);

    assert.strictEqual(registry.get('SQL_FIRST_TOKEN'), first);
    assert.strictEqual(registry.get('SQL_SECOND_TOKEN'), second);
  });
});
