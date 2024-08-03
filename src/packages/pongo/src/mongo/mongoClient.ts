import type { ClientSessionOptions } from 'http2';
import type { ClientSession, WithSessionCallback } from 'mongodb';
import {
  pongoClient,
  type PongoClient,
  type PongoClientOptions,
} from '../core';
import { Db } from './mongoDb';

export class MongoClient {
  private pongoClient: PongoClient;

  constructor(connectionString: string, options: PongoClientOptions = {}) {
    this.pongoClient = pongoClient(connectionString, options);
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
    throw new Error('Not implemented!');
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  withSession<T = any>(_executor: WithSessionCallback<T>): Promise<T>;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  withSession<T = any>(
    _options: ClientSessionOptions,
    _executor: WithSessionCallback<T>,
  ): Promise<T>;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  withSession<T = any>(
    _optionsOrExecutor: ClientSessionOptions | WithSessionCallback<T>,
    _executor?: WithSessionCallback<T>,
  ): Promise<T> {
    return Promise.reject('Not Implemented!');
  }
}
