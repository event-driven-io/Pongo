import pg from 'pg';
import { JSONSerializer } from '../../../../core/serializer';

export const setNodePostgresTypeParser = (jsonSerializer: JSONSerializer) => {
  // BigInt
  pg.types.setTypeParser(20, (val) => BigInt(val));

  // JSONB
  // eslint-disable-next-line @typescript-eslint/no-unsafe-return
  pg.types.setTypeParser(3802, (val) => jsonSerializer.deserialize(val));

  // JSON
  // eslint-disable-next-line @typescript-eslint/no-unsafe-return
  pg.types.setTypeParser(114, (val) => jsonSerializer.deserialize(val));
};
