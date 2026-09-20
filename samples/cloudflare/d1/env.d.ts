import 'cloudflare:workers';

declare module 'cloudflare:workers' {
  interface ProvidedEnv extends CloudflareBindings {}
}

declare global {
  namespace Cloudflare {
    interface Env {
      MIGRATION_TOKEN?: string;
    }
  }
}
