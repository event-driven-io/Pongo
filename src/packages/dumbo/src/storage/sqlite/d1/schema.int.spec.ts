import { Miniflare } from 'miniflare';
import { afterEach, beforeEach, describe } from 'vitest';
import { sqliteSchemaObjectsTests } from '../sqliteSchemaObjectsTests';
import { d1Pool } from './pool';

describe('checking if D1 schema objects exist', () => {
  let mf: Miniflare;
  let pool: ReturnType<typeof d1Pool>;

  beforeEach(async () => {
    mf = new Miniflare({
      modules: true,
      script: 'export default { fetch() { return new Response("ok"); } }',
      d1Databases: { DB: 'schema' },
    });
    pool = d1Pool({ database: await mf.getD1Database('DB') });
  });

  afterEach(async () => {
    await pool.close();
    await mf.dispose();
  });

  sqliteSchemaObjectsTests({ execute: () => pool.execute });
});
