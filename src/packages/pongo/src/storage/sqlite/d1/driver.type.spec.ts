import type { D1Database } from '@cloudflare/workers-types';
import type { D1Connection } from '@event-driven-io/dumbo/cloudflare';
import { describe, expectTypeOf, it } from 'vitest';
import type { ExtractPongoDriverOptions } from '../../../core';
import type { d1Driver } from './index';

type D1PongoDriverOptions = ExtractPongoDriverOptions<typeof d1Driver>;

describe('typing the D1 Pongo driver options', () => {
  it('allows an ambient connection without a database option', () => {
    expectTypeOf<{
      driverType: 'SQLite:d1';
      connectionOptions: { connection: D1Connection };
    }>().toExtend<D1PongoDriverOptions>();
  });

  it('allows a database for a driver-created connection', () => {
    expectTypeOf<{
      driverType: 'SQLite:d1';
      connectionOptions: { database: D1Database };
    }>().toExtend<D1PongoDriverOptions>();
  });
});
