import assert from 'node:assert/strict';
import { describe, it } from 'vitest';
import { JSONSerializer, SQL } from '../../../../core';
import { pgFormatter } from '../sql';
import { createFunctionIfDoesNotExistSQL } from './schema';

describe('creating a PostgreSQL function if it does not exist', () => {
  it('renders the SQL that existing migration hashes were recorded for', () => {
    const result = pgFormatter.format(
      createFunctionIfDoesNotExistSQL('answer', SQL`SELECT 42;`, {
        databaseSchemaName: 'crm',
      }),
      { serializer: JSONSerializer },
    );

    assert.equal(
      result.query,
      `
DO $$
BEGIN
IF NOT EXISTS (
  SELECT 1
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'crm'
    AND p.proname = 'answer'
) THEN
  SELECT 42;
END IF;
END $$;
`,
    );
  });

  it('renders the current schema check without a database schema', () => {
    const result = pgFormatter.format(
      createFunctionIfDoesNotExistSQL('answer', SQL`SELECT 42;`),
      { serializer: JSONSerializer },
    );

    assert.equal(
      result.query,
      `
DO $$
BEGIN
IF NOT EXISTS (
  SELECT 1
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = current_schema()
    AND p.proname = 'answer'
) THEN
  SELECT 42;
END IF;
END $$;
`,
    );
  });
});
