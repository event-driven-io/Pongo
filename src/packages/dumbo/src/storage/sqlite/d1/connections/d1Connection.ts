import type { Connection } from '../../../../core';
import {
  sqliteAmbientClientConnection,
  type SQLiteConnectionOptions,
  type SQLiteDriverType,
} from '../../core';
import { mapD1Error } from '../errors/errorMapper';
import { d1Transaction, type D1Transaction } from '../transactions';
import {
  d1Client,
  type D1Client,
  type D1ClientOptions,
  type D1SessionOptions,
} from './d1Client';

export type D1DriverType = SQLiteDriverType<'d1'>;
export const D1DriverType: D1DriverType = 'SQLite:d1';

export type D1Connection = Connection<
  D1Connection,
  D1DriverType,
  D1Client,
  D1Transaction
> & {
  d1Session: (constraintOrBookmark?: D1SessionOptions) => Promise<D1Connection>;
  withD1Session: <Result = never>(
    handle: (connection: D1Connection) => Promise<Result>,
    options?: D1SessionOptions,
  ) => Promise<Result>;
};

export type D1ConnectionOptions = SQLiteConnectionOptions<D1Connection> & {
  client?: D1Client;
  connection?: D1Connection;
  transaction?: D1Transaction;
} & D1ClientOptions;

export const d1Connection = (options: D1ConnectionOptions) => {
  const connection = options.connection ??
    options.transaction?.connection ?? {
      ...sqliteAmbientClientConnection<D1Connection>({
        driverType: D1DriverType,
        client: options.client ?? d1Client(options),
        initTransaction: (connection) =>
          d1Transaction(
            connection,
            options.serializer,
            options.transactionOptions,
          ),
        serializer: options.serializer,
        errorMapper: mapD1Error,
      }),
    };

  connection.d1Session = async (
    constraintOrBookmark?: D1SessionOptions,
  ): Promise<D1Connection> => {
    const client = await connection.open();

    const sessionClient = await client.withSession(constraintOrBookmark);

    return d1Connection({
      ...options,
      client: sessionClient,
    });
  };

  connection.withD1Session = async <Result = never>(
    handle: (connection: D1Connection) => Promise<Result>,
    options?: D1SessionOptions,
  ): Promise<Result> => {
    const sessionConnection = await connection.d1Session(options);

    try {
      return await handle(sessionConnection);
    } finally {
      await sessionConnection.close();
    }
  };

  return connection;
};
