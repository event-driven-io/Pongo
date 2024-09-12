import type { PongoClientSchema } from '../typing/schema';

export interface PongoSchemaConfig<
  TypedClientSchema extends PongoClientSchema = PongoClientSchema,
> {
  schema: TypedClientSchema;
}
