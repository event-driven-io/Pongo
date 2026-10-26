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
  var defaultProcessorsRegistry: ReturnType<typeof SQLProcessorsRegistry>;
}

const globalDefaultProcessorsRegistry = () =>
  (globalThis.defaultProcessorsRegistry =
    globalThis.defaultProcessorsRegistry ??
    SQLProcessorsRegistry().register(
      FormatIdentifierProcessor,
      MapLiteralProcessor,
      ExpandArrayProcessor,
      ExpandSQLInProcessor,
    ));

export const defaultProcessorsRegistry: SQLProcessorsRegistry = {
  get register() {
    // eslint-disable-next-line @typescript-eslint/unbound-method
    return globalDefaultProcessorsRegistry().register;
  },
  get: (tokenType) => globalDefaultProcessorsRegistry().get(tokenType),
  all: () => globalDefaultProcessorsRegistry().all(),
};
