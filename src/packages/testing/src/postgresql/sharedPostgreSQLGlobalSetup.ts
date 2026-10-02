import { PostgreSqlContainer } from '@testcontainers/postgresql';
import type { TestProject } from 'vitest/node';
import { acquireContainer, releaseContainer } from '../sharedContainer';

export const setup = async (project: TestProject): Promise<void> => {
  const container = await acquireContainer('postgresql', () =>
    new PostgreSqlContainer('postgres:18.0').start(),
  );

  project.provide(
    'sharedPostgreSQLConnectionString',
    container.getConnectionUri(),
  );
};

export const teardown = (): Promise<void> => releaseContainer('postgresql');
