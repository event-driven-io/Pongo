import type { ParametrizedSQLBuilder } from '../parametrizedSQL';
import type { SQLToken } from '../tokens';
import type { SQLValueMapper } from '../valueMappers';
import type { SQLProcessorsReadonlyRegistry } from './sqlProcessorRegistry';

export type SQLProcessorContext = {
  mapper: SQLValueMapper;
  builder: ParametrizedSQLBuilder;
  processorsRegistry: SQLProcessorsReadonlyRegistry;
};

export type SQLProcessor<Token extends SQLToken = SQLToken> = {
  canHandle: Token['sqlTokenType'];
  handle: (value: Token, context: SQLProcessorContext) => void;
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type AnySQLProcessor = SQLProcessor<any>;

export type SQLProcessorOptions<Token extends SQLToken = SQLToken> = {
  canHandle: Token['sqlTokenType'];
  handle: (value: Token, context: SQLProcessorContext) => void;
};

export const SQLProcessor = <Token extends SQLToken = SQLToken>(
  options: SQLProcessorOptions<Token>,
): SQLProcessor<Token> => options;
