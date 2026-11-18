// Replaces https://deno.land/std@0.168.0/http/server.ts inside bundled functions.
export function serve(handler) {
  globalThis.__edgeHarness.handler = handler
  return Promise.resolve()
}
