// Replaces https://esm.sh/pdf-lib@* inside bundled functions. The harness tests use invoices that already
// have a pdf_url, so PDF rendering is never reached; calling it offline fails loudly instead of rendering.
const offline = () => { throw new Error('edge-harness: pdf-lib is not available offline') }
export const PDFDocument = { create: offline, load: offline }
export const StandardFonts = {}
export function rgb(r, g, b) { return [r, g, b] }
