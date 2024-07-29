// src/MongoClientShim.ts
import pg from 'pg';
import { pongoClient, type PongoClient } from '../main';
import { Db } from './mongoDb';

export class MongoClient {
  private pongoClient: PongoClient;

  constructor(
    connectionString: string,
    options: { client?: pg.PoolClient | pg.Client } = {},
  ) {
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
}
