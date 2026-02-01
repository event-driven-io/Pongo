import pg from 'pg';
import { JSONSerializer, RawJSONSerializer } from '../../../../core/serializer';

let arePgTypesSet = false;

export const setPgTypeParser = (options?: { force?: boolean }) => {
  if (arePgTypesSet && !options?.force) return;

  arePgTypesSet = true;

  // BigInt
  pg.types.setTypeParser(20, (val) => BigInt(val));

  // JSONB
  // eslint-disable-next-line @typescript-eslint/no-unsafe-return
  pg.types.setTypeParser(3802, (val) => JSONSerializer.deserialize(val));

  // JSON
  // eslint-disable-next-line @typescript-eslint/no-unsafe-return
  pg.types.setTypeParser(114, (val) => JSONSerializer.deserialize(val));
};

export const setPgTypeRawParser = (options?: { force?: boolean }) => {
  if (arePgTypesSet && !options?.force) return;

  arePgTypesSet = true;

  // BigInt
  pg.types.setTypeParser(20, (val) => BigInt(val));

  // JSONB
  // eslint-disable-next-line @typescript-eslint/no-unsafe-return
  pg.types.setTypeParser(3802, (val) => RawJSONSerializer.deserialize(val));

  // JSON
  // eslint-disable-next-line @typescript-eslint/no-unsafe-return
  pg.types.setTypeParser(114, (val) => RawJSONSerializer.deserialize(val));
};
