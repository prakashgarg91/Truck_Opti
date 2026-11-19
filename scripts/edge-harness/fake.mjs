// Programmable fake Supabase client. Every call is recorded in fake.calls.
const CHAIN_OPS = ['select', 'eq', 'neq', 'in', 'not', 'is', 'order', 'limit', 'range', 'insert', 'update', 'upsert', 'delete', 'maybeSingle', 'single', 'gte', 'lte']

export function createFake() {
  const rpcHandlers = new Map()
  const fromHandlers = new Map()
  const invokeHandlers = new Map()
  let getUserHandler = () => ({ data: { user: null }, error: { message: 'no session scripted' } })

  const fake = {
    calls: [],
    clients: [],
    onRpc(name, fn) { rpcHandlers.set(name, fn); return fake },
    onFrom(table, fn) { fromHandlers.set(table, fn); return fake },
    onInvoke(name, fn) { invokeHandlers.set(name, fn); return fake },
    onGetUser(fn) { getUserHandler = fn; return fake },
    rpcCalls(name) { return fake.calls.filter((c) => c.kind === 'rpc' && (!name || c.name === name)) },
    fromCalls(table) { return fake.calls.filter((c) => c.kind === 'from' && (!table || c.table === table)) },
    makeClient(url, key, options) {
      const client = { url, key, options }
      fake.clients.push(client)
      client.auth = {
        async getUser(token) {
          fake.calls.push({ kind: 'auth.getUser', token, key })
          return getUserHandler(token)
        },
      }
      client.rpc = (name, args) => {
        fake.calls.push({ kind: 'rpc', name, args, key })
        const handler = rpcHandlers.get(name)
        if (!handler) {
          return Promise.resolve({ data: null, error: { message: 'unscripted rpc ' + name, code: 'UNSCRIPTED' } })
        }
        return Promise.resolve().then(() => handler(args))
      }
      client.from = (table) => {
        const record = { kind: 'from', table, ops: [], key }
        fake.calls.push(record)
        const chain = {}
        for (const op of CHAIN_OPS) {
          chain[op] = (...args) => { record.ops.push([op, ...args]); return chain }
        }
        chain.then = (resolve, reject) => {
          const handler = fromHandlers.get(table)
          const out = handler
            ? Promise.resolve().then(() => handler(record))
            : Promise.resolve({ data: null, error: { message: 'unscripted table ' + table, code: 'UNSCRIPTED' } })
          return out.then(resolve, reject)
        }
        return chain
      }
      client.functions = {
        async invoke(name, opts) {
          fake.calls.push({ kind: 'invoke', name, opts, key })
          const handler = invokeHandlers.get(name)
          return handler ? handler(opts) : { data: null, error: { message: 'unscripted function ' + name } }
        },
      }
      return client
    },
  }
  return fake
}
