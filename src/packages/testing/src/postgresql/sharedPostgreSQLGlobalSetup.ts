import {
  PostgreSqlContainer,
  type StartedPostgreSqlContainer,
} from '@testcontainers/postgresql';
import type { TestProject } from 'vitest/node';

let container: StartedPostgreSqlContainer | undefined;

export const setup = async (project: TestProject): Promise<void> => {
  container = await new PostgreSqlContainer('postgres:18.0').start();

  project.provide(
    'sharedPostgreSQLConnectionString',
    container.getConnectionUri(),
  );
};

export const teardown = async (): Promise<void> => {
  await container?.stop();
  container = undefined;
};
