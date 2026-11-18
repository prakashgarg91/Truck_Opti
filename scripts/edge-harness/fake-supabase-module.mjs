// Replaces https://esm.sh/@supabase/supabase-js@* inside bundled functions.
// All behaviour lives in the per-test fake (fake.mjs) reached through globalThis.
export function createClient(url, key, options) {
  const fake = globalThis.__edgeHarness && globalThis.__edgeHarness.fake
  if (!fake) throw new Error('edge-harness: no fake Supabase installed')
  return fake.makeClient(url, key, options)
}
