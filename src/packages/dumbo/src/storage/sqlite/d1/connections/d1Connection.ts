import { type Connection } from '../../../../core';
import {
  sqliteAmbientClientConnection,
  type SQLiteConnectionOptions,
  type SQLiteDriverType,
} from '../../core';
import {
  d1Transaction,
  type D1Transaction,
  type D1TransactionOptions,
} from '../transactions';
import { d1Client, type D1Client, type D1ClientOptions } from './d1Client';

export type D1DriverType = SQLiteDriverType<'d1'>;
export const D1DriverType: D1DriverType = 'SQLite:d1';

export type D1Connection = Connection<
  D1Connection,
  D1DriverType,
  D1Client,
  D1Transaction,
  D1TransactionOptions
>;

export type D1ConnectionOptions = SQLiteConnectionOptions & {
  client?: D1Client;
  connection?: D1Connection;
  transaction?: D1Transaction;
} & D1ClientOptions;

export const d1Connection = (options: D1ConnectionOptions) =>
  options.connection ??
  options.transaction?.connection ??
  sqliteAmbientClientConnection<D1Connection>({
    driverType: D1DriverType,
    client: options.client ?? d1Client(options),
    initTransaction: (connection) =>
      d1Transaction(connection, options.allowNestedTransactions ?? false),
  });
