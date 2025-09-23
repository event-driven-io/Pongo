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

declare global {
  // eslint-disable-next-line no-var
  var defaultProcessorsRegistry: ReturnType<typeof SQLProcessorsRegistry>;
}

export const defaultProcessorsRegistry = (globalThis.defaultProcessorsRegistry =
  globalThis.defaultProcessorsRegistry ??
  SQLProcessorsRegistry().register(
    FormatIdentifierProcessor,
    MapLiteralProcessor,
    ExpandArrayProcessor,
    ExpandSQLInProcessor,
  ));
