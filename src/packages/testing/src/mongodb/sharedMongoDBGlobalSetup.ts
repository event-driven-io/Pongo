import {
  MongoDBContainer,
  type StartedMongoDBContainer,
} from '@testcontainers/mongodb';
import type { TestProject } from 'vitest/node';

let container: StartedMongoDBContainer | undefined;

export const setup = async (project: TestProject): Promise<void> => {
  container = await new MongoDBContainer('mongo:6.0.12').start();

  project.provide(
    'sharedMongoDBConnectionString',
    container.getConnectionString(),
  );
};

export const teardown = async (): Promise<void> => {
  await container?.stop();
  container = undefined;
};
