import pg from 'pg';
import { RawJSONSerializer } from '../../../core/serializer';

let arePgTypesSet = false;

export const setNodePostgresTypeParser = () => {
  if (arePgTypesSet) return;

  arePgTypesSet = true;

  // BigInt
  pg.types.setTypeParser(20, (val) => BigInt(val));

  // JSONB
  pg.types.setTypeParser(3802, (val) => RawJSONSerializer.deserialize(val));

  // JSON
  pg.types.setTypeParser(114, (val) => RawJSONSerializer.deserialize(val));
};
