import { DurableObject } from 'cloudflare:workers';
import { ConcurrencyError } from '@event-driven-io/dumbo';
import { pongoClient, type PongoCollection } from '@event-driven-io/pongo';
import { cloudflareDurableObjectSQLiteDriver } from '@event-driven-io/pongo/cloudflare';
import pongoConfig from '../pongo.config';
import {
  addProductItem,
  cancel,
  confirm,
  removeProductItem,
  type AddProductItemToShoppingCart,
  type ConfirmShoppingCart,
  type RemoveProductItemFromShoppingCart,
} from './businessLogic';
import type { ShoppingCart } from './shoppingCart';

export class ShoppingCartDurableObject extends DurableObject<CloudflareBindings> {
  readonly #shoppingCarts: PongoCollection<ShoppingCart>;

  constructor(ctx: DurableObjectState, env: CloudflareBindings) {
    super(ctx, env);

    const client = pongoClient({
      driver: cloudflareDurableObjectSQLiteDriver,
      storage: ctx.storage,
      schema: { definition: pongoConfig.schema, autoMigration: 'None' },
      errors: { throwOnOperationFailures: true },
    });
    const db = client.db();
    this.#shoppingCarts = db.collection<ShoppingCart>('shoppingCarts');

    void ctx.blockConcurrencyWhile(async () => {
      await db.schema.migrate();
    });
  }

  getCurrent(clientId: string): Promise<ShoppingCart | null> {
    return this.#shoppingCarts.findOne({
      clientId,
      status: 'Opened',
    });
  }

  getById(shoppingCartId: string): Promise<ShoppingCart | null> {
    return this.#shoppingCarts.findOne({ _id: shoppingCartId });
  }

  async addProductItemToCurrent(
    command: AddProductItemToShoppingCart['data'],
  ): Promise<Readonly<{ cart: ShoppingCart; created: boolean }>> {
    const current = await this.#shoppingCarts.findOne({
      clientId: command.clientId,
      status: 'Opened',
    });
    const shoppingCartId = current?._id ?? command.shoppingCartId;
    const result = await this.#shoppingCarts.handle(
      {
        _id: shoppingCartId,
        expectedVersion: current?._version ?? 'DOCUMENT_DOES_NOT_EXIST',
      },
      (state) => addProductItem({ ...command, shoppingCartId }, state),
    );

    return { cart: result.document!, created: current === null };
  }

  addProductItem(
    command: AddProductItemToShoppingCart['data'],
    expectedVersion: bigint,
  ): Promise<ShoppingCart | null> {
    return this.#handleExistingCart(
      command.shoppingCartId,
      expectedVersion,
      (state) => addProductItem(command, state),
    );
  }

  removeProductItem(
    shoppingCartId: string,
    command: RemoveProductItemFromShoppingCart['data'],
    expectedVersion: bigint,
  ): Promise<ShoppingCart | null> {
    return this.#handleExistingCart(shoppingCartId, expectedVersion, (state) =>
      removeProductItem(command, state),
    );
  }

  confirmShoppingCart(
    shoppingCartId: string,
    command: ConfirmShoppingCart['data'],
    expectedVersion: bigint,
  ): Promise<ShoppingCart | null> {
    return this.#handleExistingCart(shoppingCartId, expectedVersion, (state) =>
      confirm(command, state),
    );
  }

  async cancelShoppingCart(
    shoppingCartId: string,
    expectedVersion?: bigint,
  ): Promise<void> {
    const existing = await this.#shoppingCarts.findOne({
      _id: shoppingCartId,
    });
    if (!existing) return;
    if (expectedVersion === undefined)
      throw new ConcurrencyError(
        'If-Match must contain the current shopping cart ETag',
      );

    await this.#shoppingCarts.handle(
      { _id: shoppingCartId, expectedVersion },
      cancel,
    );
  }

  async #handleExistingCart(
    shoppingCartId: string,
    expectedVersion: bigint,
    handle: (state: ShoppingCart) => ShoppingCart,
  ): Promise<ShoppingCart | null> {
    const existing = await this.#shoppingCarts.findOne({
      _id: shoppingCartId,
    });
    if (!existing) return null;

    const result = await this.#shoppingCarts.handle(
      { _id: shoppingCartId, expectedVersion },
      (state) => handle(state!),
    );
    return result.document;
  }
}
