// Pure Deno/remote-import stubs so the Edge functions can be type-checked with Node's tsc.
// Only the Deno APIs the functions really use are declared (grep 'Deno\.' supabase/functions).

declare const Deno: {
  env: { get(key: string): string | undefined }
  serve(handler: (req: Request) => Response | Promise<Response>): unknown
  test(name: string, fn: () => void | Promise<void>): void
}

declare module 'https://deno.land/std@0.168.0/http/server.ts' {
  export function serve(
    handler: (req: Request) => Response | Promise<Response>,
    options?: { port?: number; hostname?: string },
  ): Promise<void>
}

// Real types come from frontend/node_modules via tsconfig `paths`.
declare module 'https://esm.sh/@supabase/supabase-js@2' {
  export * from '@supabase/supabase-js'
}
declare module 'https://esm.sh/@supabase/supabase-js@2.90.0' {
  export * from '@supabase/supabase-js'
}

// STUB GAP: pdf-lib is not installed anywhere in this repo, so only the surface used is declared loosely.
declare module 'https://esm.sh/pdf-lib@1.17.1' {
  export const PDFDocument: any
  export const StandardFonts: any
  export function rgb(r: number, g: number, b: number): any
}
