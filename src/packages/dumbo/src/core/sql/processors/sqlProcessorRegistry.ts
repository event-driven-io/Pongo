import type { AnySQLToken } from '../tokens';
import type { AnySQLProcessor, SQLProcessor } from './sqlProcessor';

export interface SQLProcessorsReadonlyRegistry {
  get<Token extends AnySQLToken = AnySQLToken>(
    tokenType: Token['sqlTokenType'],
  ): SQLProcessor<Token> | null;
  all(): ReadonlyMap<string, AnySQLProcessor>;
}

export interface SQLProcessorsRegistry extends SQLProcessorsReadonlyRegistry {
  register(...processor: AnySQLProcessor[]): SQLProcessorsRegistry;
  register(processor: Record<string, AnySQLProcessor>): SQLProcessorsRegistry;
}

export const SQLProcessorsRegistry = (options?: {
  from: SQLProcessorsRegistry;
}): SQLProcessorsRegistry => {
  const processors = options
    ? new Map<string, AnySQLProcessor>(options.from.all())
    : new Map<string, AnySQLProcessor>();

  function register(...processor: AnySQLProcessor[]): SQLProcessorsRegistry;
  function register(
    processor: Record<string, AnySQLProcessor>,
  ): SQLProcessorsRegistry;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  function register(...args: any[]): SQLProcessorsRegistry {
    if (
      args.length === 1 &&
      typeof args[0] === 'object' &&
      !Array.isArray(args[0])
    ) {
      Object.entries(args[0] as Record<string, AnySQLProcessor>).forEach(
        ([_, processor]) => {
          processors.set(processor.canHandle as string, processor);
        },
      );
    } else {
      args.forEach((p: AnySQLProcessor) =>
        processors.set(p.canHandle as string, p),
      );
    }
    return registry;
  }

  const registry = {
    register,
    get: <Token extends AnySQLToken = AnySQLToken>(
      tokenType: string,
    ): SQLProcessor<Token> | null => {
      return processors.get(tokenType) ?? null;
    },
    all: (): ReadonlyMap<string, AnySQLProcessor> => processors,
  };
  return registry;
};
