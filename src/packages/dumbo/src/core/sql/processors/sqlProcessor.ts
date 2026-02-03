import type { JSONSerializer } from '../../serializer';
import type { ParametrizedSQLBuilder } from '../parametrizedSQL';
import type { AnySQLToken } from '../tokens';
import type { SQLValueMapper } from '../valueMappers';
import type { SQLProcessorsReadonlyRegistry } from './sqlProcessorRegistry';

export type SQLProcessorContext = {
  mapper: SQLValueMapper;
  builder: ParametrizedSQLBuilder;
  processorsRegistry: SQLProcessorsReadonlyRegistry;
  serializer: JSONSerializer;
};

export type SQLProcessor<Token extends AnySQLToken = AnySQLToken> = {
  canHandle: Token['sqlTokenType'];
  handle: (value: Token, context: SQLProcessorContext) => void;
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type AnySQLProcessor = SQLProcessor<any>;

export type SQLProcessorOptions<Token extends AnySQLToken = AnySQLToken> = {
  canHandle: Token['sqlTokenType'];
  handle: (value: Token, context: SQLProcessorContext) => void;
};

export const SQLProcessor = <Token extends AnySQLToken = AnySQLToken>(
  options: SQLProcessorOptions<Token>,
): SQLProcessor<Token> => options;
