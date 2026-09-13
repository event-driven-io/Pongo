import { Hono } from 'hono';

const app = new Hono<{ Bindings: CloudflareBindings }>();

export default app;
