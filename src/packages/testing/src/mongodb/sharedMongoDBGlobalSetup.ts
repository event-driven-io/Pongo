import { MongoDBContainer } from '@testcontainers/mongodb';
import type { TestProject } from 'vitest/node';
import { acquireContainer, releaseContainer } from '../sharedContainer';

export const setup = async (project: TestProject): Promise<void> => {
  const container = await acquireContainer('mongodb', () =>
    new MongoDBContainer('mongo:6.0.12').start(),
  );

  project.provide(
    'sharedMongoDBConnectionString',
    container.getConnectionString(),
  );
};

export const teardown = (): Promise<void> => releaseContainer('mongodb');
