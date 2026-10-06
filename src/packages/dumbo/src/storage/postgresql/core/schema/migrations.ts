import {
  type MigratorOptions,
  registerDefaultMigratorOptions,
} from '../../../../core';
import { AdvisoryLock } from '../locks';

export const DefaultPostgreSQLMigratorOptions: MigratorOptions = {
  lock: {
    databaseLock: AdvisoryLock,
  },
};

registerDefaultMigratorOptions('PostgreSQL', DefaultPostgreSQLMigratorOptions);
