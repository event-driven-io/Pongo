import {
  PostgreSQLConnectionString,
  type PostgresConnector,
} from '@event-driven-io/dumbo/pg';
import { type PongoDbClientOptions } from '../../core';

export type PostgresDbClientOptions = PongoDbClientOptions<
  PostgreSQLConnectionString,
  PostgresConnector
>;
