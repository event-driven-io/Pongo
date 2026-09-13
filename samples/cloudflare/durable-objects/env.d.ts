import 'cloudflare:workers';

declare module 'cloudflare:workers' {
  interface ProvidedEnv extends CloudflareBindings {}
}
