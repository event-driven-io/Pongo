import {
  parseConnectionString,
  toDatabaseDriverType,
} from '@event-driven-io/dumbo';
import type { ClientSessionOptions } from 'http2';
import type { ClientSession, WithSessionCallback } from 'mongodb';
import {
  pongoClient,
  pongoSession,
  type AnyPongoDatabaseDriver,
  type PongoClient,
  type PongoClientOptions,
  type PongoClientSchema,
} from '../core';
import { Db } from './mongoDb';

export class MongoClient<
  DatabaseDriverType extends AnyPongoDatabaseDriver = AnyPongoDatabaseDriver,
  TypedClientSchema extends PongoClientSchema = PongoClientSchema,
> {
  private pongoClient: PongoClient;

  constructor(
    options: PongoClientOptions<DatabaseDriverType, TypedClientSchema>,
  );
  constructor(
    connectionString: string,
    options?: Omit<
      PongoClientOptions<DatabaseDriverType, TypedClientSchema>,
      'connectionString'
    > & {
      driver?: AnyPongoDatabaseDriver;
    },
  );
  constructor(
    connectionStringOrOptions:
      | string
      | PongoClientOptions<DatabaseDriverType, TypedClientSchema>,
    options?: Omit<
      PongoClientOptions<DatabaseDriverType, TypedClientSchema>,
      'connectionString'
    > & {
      driver?: AnyPongoDatabaseDriver;
    },
  ) {
    if (typeof connectionStringOrOptions !== 'string') {
      this.pongoClient = pongoClient(connectionStringOrOptions);
      return;
    }

    const { databaseType, driverName } = parseConnectionString(
      connectionStringOrOptions,
    );

    const driver =
      options?.driver ??
      pongoDatabaseDriverRegistry.tryGet(
        toDatabaseDriverType(databaseType, driverName),
      );

    if (driver === null) {
      throw new Error(
        `No database driver registered for ${databaseType} with name ${driverName}`,
      );
    }

    this.pongoClient = pongoClient({
      ...(options ?? {}),
      ...{ connectionString: connectionStringOrOptions },
      driver,
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
