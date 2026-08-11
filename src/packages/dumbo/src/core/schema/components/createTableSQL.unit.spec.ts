import { describe, expectTypeOf, it } from 'vitest';
import { SQL } from '../../sql';
import { dumboSchema } from '../dumboSchema';
import type { TableRowType } from './tableTypesInference';

type User = {
  email: string;
};

const _documents = dumboSchema.table('documents', {
  columns: {
    _id: dumboSchema.column('_id', SQL.column.type.Text, {
      primaryKey: true,
      notNull: true,
    }),
    data: dumboSchema.column('data', SQL.column.type.JSON<User>(), {
      notNull: true,
    }),
    metadata: dumboSchema.column(
      'metadata',
      SQL.column.type.JSON<Record<string, unknown>>(),
      {
        notNull: true,
        default: SQL.literal('{}'),
      },
    ),
    version: dumboSchema.column('version', SQL.column.type.BigInteger, {
      notNull: true,
      default: 1n,
    }),
    archived: dumboSchema.column('archived', SQL.column.type.Boolean, {
      notNull: true,
      default: false,
    }),
    created: dumboSchema.column('created', SQL.column.type.Timestamptz, {
      notNull: true,
      default: SQL.plain('CURRENT_TIMESTAMP'),
    }),
  },
  primaryKey: ['_id'],
});

describe('creating a table from a Dumbo declaration', () => {
  it('infers portable column values from the declaration', () => {
    expectTypeOf<TableRowType<typeof _documents>>().toEqualTypeOf<{
      _id: string;
      data: User;
      metadata: Record<string, unknown>;
      version: bigint;
      archived: boolean;
      created: Date;
    }>();
  });
});
