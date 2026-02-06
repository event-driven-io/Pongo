import type pg from 'pg';
import type { JSONSerializer } from '../../../../core/serializer';

export const setPgTypeParser = (
  client: pg.Client | pg.PoolClient,
  options?: {
    parseBigInts?: boolean;
    serializer: JSONSerializer;
  },
) => {
  // BigInt
  if (options?.parseBigInts === true)
    client.setTypeParser(20, (val) => BigInt(val));

  if (options?.serializer) {
    // JSONB
    // eslint-disable-next-line @typescript-eslint/no-unsafe-return
    client.setTypeParser(3802, (val) => options.serializer.deserialize(val));

    // JSON
    // eslint-disable-next-line @typescript-eslint/no-unsafe-return
    client.setTypeParser(114, (val) => options.serializer.deserialize(val));
  }
};
