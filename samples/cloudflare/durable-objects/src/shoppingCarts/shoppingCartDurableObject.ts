import { DurableObject } from 'cloudflare:workers';
import { NotFoundError } from '@event-driven-io/emmett';
import {
  pongoClient,
  type PongoCollection,
  type WithIdAndVersion,
} from '@event-driven-io/pongo';
import { cloudflareDurableObjectSQLiteDriver } from '@event-driven-io/pongo/cloudflare';
import pongoConfig from '../pongo.config';
import {
  addProductItem,
  cancel,
  confirm,
  removeProductItem,
} from './businessLogic';
import type { PricedProductItem, ShoppingCart } from './shoppingCart';

type GetCurrentShoppingCart = { clientId: string };

type GetShoppingCart = { shoppingCartId: string };

type AddProductItemToCurrentShoppingCart = {
  clientId: string;
  productItem: PricedProductItem;
  now: Date;
};

type AddProductItemToShoppingCart = {
  clientId: string;
  shoppingCartId: string;
  expectedVersion: bigint;
  productItem: PricedProductItem;
  now: Date;
};

type RemoveProductItemFromShoppingCart = {
  shoppingCartId: string;
  expectedVersion: bigint;
  productId: string;
  quantity: number;
};

type ChangeShoppingCartStatus = {
  shoppingCartId: string;
  expectedVersion: bigint;
  now: Date;
};

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
    const db = client.database;
    this.#shoppingCarts = db.collection<ShoppingCart>('shoppingCarts');

    void ctx.blockConcurrencyWhile(async () => {
      await db.schema.migrate();
    });
  }

  async getCurrent({ clientId }: GetCurrentShoppingCart) {
    const cart = await this.#shoppingCarts.findOne({
      clientId,
      status: 'Opened',
    });
    if (cart === null)
      throw new NotFoundError({ id: clientId, type: 'Shopping cart' });

    return cart;
  }

  async getById({ shoppingCartId }: GetShoppingCart) {
    const cart = await this.#shoppingCarts.findOne({ _id: shoppingCartId });
    if (cart === null)
      throw new NotFoundError({ id: shoppingCartId, type: 'Shopping cart' });

    return cart;
  }

  async addProductItemToCurrent({
    clientId,
    productItem,
    now,
  }: AddProductItemToCurrentShoppingCart) {
    const current = await this.#shoppingCarts.findOne({
      clientId,
      status: 'Opened',
    });
    const shoppingCartId = current?._id ?? crypto.randomUUID();

    const result = await this.#shoppingCarts.handle(
      {
        _id: shoppingCartId,
        expectedVersion: current?._version ?? 'DOCUMENT_DOES_NOT_EXIST',
      },
      (state) =>
        addProductItem({ clientId, shoppingCartId, productItem, now }, state),
    );

    return {
      cart: result.document as WithIdAndVersion<ShoppingCart>,
      created: current === null,
    };
  }

  async addProductItem({
    clientId,
    shoppingCartId,
    expectedVersion,
    productItem,
    now,
  }: AddProductItemToShoppingCart) {
    await this.getById({ shoppingCartId });

    const result = await this.#shoppingCarts.handle(
      { _id: shoppingCartId, expectedVersion },
      (state) =>
        addProductItem({ clientId, shoppingCartId, productItem, now }, state),
    );

    return result.document as WithIdAndVersion<ShoppingCart>;
  }

  async removeProductItem({
    shoppingCartId,
    expectedVersion,
    productId,
    quantity,
  }: RemoveProductItemFromShoppingCart) {
    await this.getById({ shoppingCartId });

    const result = await this.#shoppingCarts.handle(
      { _id: shoppingCartId, expectedVersion },
      (state) => removeProductItem({ productId, quantity }, state),
    );

    return result.document as WithIdAndVersion<ShoppingCart>;
  }

  async confirm({
    shoppingCartId,
    expectedVersion,
    now,
  }: ChangeShoppingCartStatus) {
    await this.getById({ shoppingCartId });

    const result = await this.#shoppingCarts.handle(
      { _id: shoppingCartId, expectedVersion },
      (state) => confirm({ now }, state),
    );

    return result.document as WithIdAndVersion<ShoppingCart>;
  }

  async cancel({
    shoppingCartId,
    expectedVersion,
    now,
  }: ChangeShoppingCartStatus) {
    await this.getById({ shoppingCartId });

    const result = await this.#shoppingCarts.handle(
      { _id: shoppingCartId, expectedVersion },
      (state) => cancel({ now }, state),
    );

    return result.document as WithIdAndVersion<ShoppingCart>;
  }
}
