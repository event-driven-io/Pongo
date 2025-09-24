import { parseConnectionString, toConnectorType } from '@event-driven-io/dumbo';
import { type ClientSessionOptions } from 'http2';
import type { ClientSession, WithSessionCallback } from 'mongodb';
import {
  pongoClient,
  pongoDatabaseDriverRegistry,
  pongoSession,
  type AnyPongoDatabaseDriver,
  type PongoClient,
  type PongoClientOptions,
} from '../core';
import { Db } from './mongoDb';

export class MongoClient {
  private pongoClient: PongoClient;

  constructor(
    connectionString: string,
    options?: Omit<PongoClientOptions, 'connectionString' | 'driver'> & {
      driver?: AnyPongoDatabaseDriver;
    },
  ) {
    const { databaseType, driverName } =
      parseConnectionString(connectionString);

    const driver =
      options?.driver ??
      pongoDatabaseDriverRegistry.tryGet(
        toConnectorType(databaseType, driverName),
      );

    if (driver === null) {
      throw new Error(
        `No database driver registered for ${databaseType} with name ${driverName}`,
      );
    }

    this.pongoClient = pongoClient({
      ...(options ?? {}),
      driver,
      connectionString,
    });
  }

  async connect() {
    await this.pongoClient.connect();
    return this;
  }

  async close() {
    await this.pongoClient.close();
  }

  db(dbName?: string): Db {
    return new Db(this.pongoClient.db(dbName));
  }
  startSession(_options?: ClientSessionOptions): ClientSession {
    return pongoSession() as unknown as ClientSession;
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  withSession<T = any>(_executor: WithSessionCallback<T>): Promise<T>;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  withSession<T = any>(
    _options: ClientSessionOptions,
    _executor: WithSessionCallback<T>,
  ): Promise<T>;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  async withSession<T = any>(
    optionsOrExecutor: ClientSessionOptions | WithSessionCallback<T>,
    executor?: WithSessionCallback<T>,
  ): Promise<T> {
    const callback =
      typeof optionsOrExecutor === 'function' ? optionsOrExecutor : executor!;

    const session = pongoSession() as unknown as ClientSession;

    try {
      return await callback(session);
    } finally {
      await session.endSession();
    }
  }
}
