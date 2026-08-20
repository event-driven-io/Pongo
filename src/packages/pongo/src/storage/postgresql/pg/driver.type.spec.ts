import type { Dumbo } from '@event-driven-io/dumbo';
import type {
  PgConnection,
  PgPool,
  PgTransactionOptions,
} from '@event-driven-io/dumbo/pg';
import type pg from 'pg';
import { describe, expectTypeOf, it } from 'vitest';
import type { ExtractPongoDriverOptions } from '../../../core';
import type { pgDriver } from './index';

type PgPongoDriverOptions = ExtractPongoDriverOptions<typeof pgDriver>;

const _connectionString = 'postgresql://localhost/connected';

describe('typing the PostgreSQL Pongo driver options', () => {
  it('takes the adopted pool type from the Dumbo driver', () => {
    expectTypeOf<
      NonNullable<PgPongoDriverOptions['pool']>
    >().toEqualTypeOf<PgPool>();
  });

  it('takes the connection options from the Dumbo driver', () => {
    expectTypeOf<{
      connectionString: typeof _connectionString;
      connectionOptions: { transactionOptions: PgTransactionOptions };
    }>().toExtend<PgPongoDriverOptions>();

    expectTypeOf<{
      connectionString: typeof _connectionString;
      connectionOptions: { pool: pg.Pool };
    }>().toExtend<PgPongoDriverOptions>();

    expectTypeOf<{
      connectionString: typeof _connectionString;
      connectionOptions: { client: pg.Client };
    }>().toExtend<PgPongoDriverOptions>();

    expectTypeOf<{
      connectionString: typeof _connectionString;
      connectionOptions: { connection: PgConnection };
    }>().toExtend<PgPongoDriverOptions>();
  });

  it('takes a Dumbo pool in the dedicated pool option', () => {
    expectTypeOf<{
      connectionString: typeof _connectionString;
      pool: PgPool;
    }>().toExtend<PgPongoDriverOptions>();
  });

  it('rejects a Dumbo pool passed as connection options', () => {
    expectTypeOf<{
      connectionString: typeof _connectionString;
      connectionOptions: { pool: PgPool };
    }>().not.toExtend<PgPongoDriverOptions>();
  });

  it('rejects a pool combined with connection options', () => {
    expectTypeOf<{
      pool: PgPool;
      connectionOptions: { transactionOptions: PgTransactionOptions };
    }>().not.toExtend<PgPongoDriverOptions>();
  });

  it('rejects a native pg pool in the dedicated pool option', () => {
    expectTypeOf<{ pool: pg.Pool }>().not.toExtend<PgPongoDriverOptions>();
  });

  it('rejects a pool that is not a PostgreSQL one', () => {
    expectTypeOf<{ pool: Dumbo }>().not.toExtend<PgPongoDriverOptions>();
  });
});
