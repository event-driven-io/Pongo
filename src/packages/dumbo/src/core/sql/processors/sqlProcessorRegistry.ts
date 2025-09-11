import type { SQLToken } from '../tokens';
import type { AnySQLProcessor, SQLProcessor } from './sqlProcessor';

export interface SQLProcessorsReadonlyRegistry {
  get<Token extends SQLToken = SQLToken>(
    tokenType: Token['sqlTokenType'],
  ): SQLProcessor<Token> | null;
}

export interface SQLProcessorsRegistry extends SQLProcessorsReadonlyRegistry {
  register(...processor: AnySQLProcessor[]): SQLProcessorsRegistry;
}

export const SQLProcessorsRegistry = (): SQLProcessorsRegistry => {
  const processors = new Map<string, AnySQLProcessor>();

  const registry = {
    register: (...processor: AnySQLProcessor[]): SQLProcessorsRegistry => {
      processor.forEach((p) => processors.set(p.canHandle as string, p));
      return registry;
    },
    get: <Token extends SQLToken = SQLToken>(
      tokenType: string,
    ): SQLProcessor<Token> | null => {
      return processors.get(tokenType) ?? null;
    },
  };
  return registry;
};
