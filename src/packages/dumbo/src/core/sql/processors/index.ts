import {
  ExpandArrayProcessor,
  ExpandSQLInProcessor,
  FormatIdentifierProcessor,
  MapLiteralProcessor,
} from './defaultProcessors';
import { SQLProcessorsRegistry } from './sqlProcessorRegistry';

export * from './columnProcessors';
export * from './defaultProcessors';
export * from './sqlProcessor';
export * from './sqlProcessorRegistry';

export const defaultProcessorsRegistry = SQLProcessorsRegistry().register(
  FormatIdentifierProcessor,
  MapLiteralProcessor,
  ExpandArrayProcessor,
  ExpandSQLInProcessor,
);
