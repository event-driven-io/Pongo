import type { DbSQLExecutor, JSONSerializer } from '../../../../core';
import type {
  CloudflareDurableObjectSQLiteClient,
  CloudflareDurableObjectSQLiteDriverType,
} from '../connections';
import { CloudflareDurableObjectSQLiteDriverType as driverType } from '../connections';
import { sqliteSQLExecutor } from '../../core';

export type CloudflareDurableObjectSQLiteSQLExecutor = DbSQLExecutor<
  CloudflareDurableObjectSQLiteDriverType,
  CloudflareDurableObjectSQLiteClient
>;

export const cloudflareDurableObjectSQLiteSQLExecutor = (
  serializer: JSONSerializer,
): CloudflareDurableObjectSQLiteSQLExecutor =>
  sqliteSQLExecutor(driverType, serializer);
