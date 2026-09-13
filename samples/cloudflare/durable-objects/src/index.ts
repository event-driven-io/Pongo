import { DurableObject } from 'cloudflare:workers';
import { Hono } from 'hono';

export class ShoppingCartDurableObject extends DurableObject<CloudflareBindings> {}

const app = new Hono<{ Bindings: CloudflareBindings }>();

export default app;
