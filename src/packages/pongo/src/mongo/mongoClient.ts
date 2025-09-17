import type {
  DatabaseConnectionString,
  InferConnectorDatabaseType,
} from '@event-driven-io/dumbo/src';
import { type ClientSessionOptions } from 'http2';
import type { ClientSession, WithSessionCallback } from 'mongodb';
import {
  pongoClient,
  pongoSession,
  type PongoClient,
  type PongoClientOptions,
} from '../core';
import type {
  AnyPongoDatabaseDriver,
  ExtractDatabaseTypeFromDriver,
} from '../core/plugins';
import { Db } from './mongoDb';

export class MongoClient<
  DatabaseDriver extends AnyPongoDatabaseDriver = AnyPongoDatabaseDriver,
  ConnectionString extends DatabaseConnectionString<
    InferConnectorDatabaseType<DatabaseDriver['connector']>
  > = DatabaseConnectionString<
    InferConnectorDatabaseType<DatabaseDriver['connector']>
  >,
> {
  private pongoClient: PongoClient<
    DatabaseDriver['connector'],
    ExtractDatabaseTypeFromDriver<DatabaseDriver>
  >;

  constructor(options: PongoClientOptions<DatabaseDriver, ConnectionString>) {
    this.pongoClient = pongoClient(options);
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
