// Shared Worker environment bindings. Imported by both the entrypoint
// (index.ts) and the Durable Object (session.ts) so the Env type stays
// in one place.

export interface Env {
  ASSETS: Fetcher;
  SWEEP_SESSION: DurableObjectNamespace;
}
