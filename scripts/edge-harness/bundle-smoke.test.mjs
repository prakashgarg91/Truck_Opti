import { test } from 'node:test'
import assert from 'node:assert/strict'
import { bundleFunction, listFunctions } from './run.mjs'

// Remote imports the harness cannot satisfy offline. Anything else unresolved is a failure.
const KNOWN_UNRESOLVED = new Set(['https://esm.sh/pdf-lib@1.17.1'])

const functions = listFunctions()

test('the function list is not empty', () => {
  assert.ok(functions.length >= 20, `found ${functions.length}`)
})

for (const name of functions) {
  test(`${name}/index.ts bundles with esbuild`, async () => {
    const result = await bundleFunction(name)
    assert.deepEqual(result.errors, [])
    assert.ok(result.code && result.code.length > 0)
    const unexpected = result.unresolved.filter((u) => !KNOWN_UNRESOLVED.has(u.import))
    assert.deepEqual(unexpected, [])
    for (const u of result.unresolved) {
      process.stdout.write(`# note: ${name} leaves ${u.import} external (offline, not installed)\n`)
    }
  })
}
