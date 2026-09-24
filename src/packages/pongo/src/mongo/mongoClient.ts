import {
  parseConnectionString,
  toDatabaseDriverType,
} from '@event-driven-io/dumbo';
import type {
  ClientSession,
  ClientSessionOptions,
  WithSessionCallback,
} from 'mongodb';
import {
  pongoClient,
  pongoSession,
  PongoError,
  type AnyPongoDriver,
  type PongoClient,
  type PongoClientOptions,
  type PongoClientSchema,
  type PongoSessionOptions,
  type PongoTransactionOptions,
} from '../core';
import { Db } from './mongoDb';

const toPongoSessionOptions = (
  options: ClientSessionOptions | undefined,
): PongoSessionOptions | undefined =>
  options
    ? {
        defaultTransactionOptions: options.defaultTransactionOptions as
          PongoTransactionOptions | undefined,
        defaultTimeoutMS: options.defaultTimeoutMS,
      }
    : undefined;

export class MongoClient<
  DatabaseDriverType extends AnyPongoDriver = AnyPongoDriver,
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
      driver?: AnyPongoDriver;
    },
  );
  constructor(
    connectionStringOrOptions:
      string | PongoClientOptions<DatabaseDriverType, TypedClientSchema>,
    options?: Omit<
      PongoClientOptions<DatabaseDriverType, TypedClientSchema>,
      'connectionString'
    > & {
      driver?: AnyPongoDriver;
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
      pongoDriverRegistry.tryGet(
        toDatabaseDriverType(databaseType, driverName),
      );

    if (driver === null) {
      throw new PongoError(
        `No database driver registered for ${databaseType} with name ${driverName}`,
      );
    }

    this.pongoClient = pongoClient({
      ...(options ?? {}),
      ...{ connectionString: connectionStringOrOptions },
      driver,
    } as unknown as PongoClientOptions<
      PongoClientOptions<DatabaseDriverType, TypedClientSchema>['driver'] &
        AnyPongoDriver,
      TypedClientSchema
    >);
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
  startSession(options?: ClientSessionOptions): ClientSession {
    return pongoSession(
      toPongoSessionOptions(options),
    ) as unknown as ClientSession;
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

    const session = this.startSession(
      typeof optionsOrExecutor === 'function' ? undefined : optionsOrExecutor,
    );

    try {
      return await callback(session);
    } finally {
      await session.endSession();
    }
  }
}
