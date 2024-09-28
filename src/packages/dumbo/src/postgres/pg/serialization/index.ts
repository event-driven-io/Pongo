import pg from 'pg';
import { JSONSerializer } from '../../../core/serializer';

export const setNodePostgresTypeParser = (jsonSerializer: JSONSerializer) => {
  // BigInt
  pg.types.setTypeParser(20, (val) => BigInt(val));

  // JSONB
  pg.types.setTypeParser(3802, (val) => jsonSerializer.deserialize(val));

  // JSON
  pg.types.setTypeParser(114, (val) => jsonSerializer.deserialize(val));
};
