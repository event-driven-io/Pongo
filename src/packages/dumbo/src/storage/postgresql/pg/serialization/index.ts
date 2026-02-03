import pg from 'pg';
import { jsonSerializer } from '../../../../core/serializer';

let arePgTypesSet = false;

export const setPgTypeParser = (options?: {
  force?: boolean;
  parseBigInts?: boolean;
  parseDates?: boolean;
  parseJSON?: boolean;
}) => {
  if (arePgTypesSet && !options?.force) return;

  arePgTypesSet = true;

  // BigInt
  if (options?.parseBigInts === true)
    pg.types.setTypeParser(20, (val) => BigInt(val));

  if (options?.parseJSON === true) {
    const serializer = jsonSerializer(options);

    // JSONB
    // eslint-disable-next-line @typescript-eslint/no-unsafe-return
    pg.types.setTypeParser(3802, (val) => serializer.deserialize(val));

    // JSON
    // eslint-disable-next-line @typescript-eslint/no-unsafe-return
    pg.types.setTypeParser(114, (val) => serializer.deserialize(val));
  }
};
