// Host-half tests. They need no model and no Timon: a fake PluginContext
// records the routes and an in-memory kv stands in for ctx.storage.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import zlib from 'node:zlib'
import { T5Tokenizer, makeNoise } from '../lib/tokenizer.js'
import { apply, encodePng } from '../lib/index.js'

function fakeContext({ user = 'alice', kv = new Map(), threads = 0 } = {}) {
  const routes = {}
  const router = new Proxy({}, { get: (_, method) => (route, fn) => { routes[`${method.toUpperCase()} ${route}`] = fn } })
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'avatar-studio-'))
  const ctx = {
    id: 'avatar-studio',
    storage: { dir, kv: { get: async (k) => kv.get(k), set: async (k, v) => { kv.set(k, v) }, del: async (k) => { kv.delete(k) } } },
    settings: { get: (k) => (k === 'threads' ? threads : '') },
    router: () => router,
    log: { info() {}, warn() {}, error() {} },
    user: () => (user ? { id: user } : undefined),
    agents: {},
    setUser(u) { user = u },
  }
  const call = (key, req = {}) => new Promise((resolve) => {
    const res = {
      code: 200,
      status(c) { this.code = c; return this },
      set() { return this },
      type() { return this },
      json(body) { resolve({ status: this.code, body }) },
      send(body) { resolve({ status: this.code, body }) },
    }
    routes[key]({ params: {}, body: {}, ...req }, res)
  })
  return { ctx, dir, kv, routes, call }
}

test('tokenizer: words, unknown pieces and padding', () => {
  const tok = new T5Tokenizer([['<pad>', 0], ['</s>', 0], ['<unk>', 0], ['▁', -2], ['▁cat', -5], ['c', -6], ['a', -6], ['t', -6]])
  assert.deepEqual(tok.encode('cat'), [4, 1])
  assert.deepEqual(tok.encode('  cat   cat '), [4, 4, 1])
  const { ids, mask } = tok.encodePadded('cat', 8)
  assert.deepEqual([...ids], [4n, 1n, 0n, 0n, 0n, 0n, 0n, 0n])
  assert.deepEqual([...mask], [1n, 1n, 0n, 0n, 0n, 0n, 0n, 0n])
  // An unknown character becomes one <unk>, consecutive ones are merged.
  assert.deepEqual(tok.encode('zz'), [3, 2, 1])
})

test('noise: deterministic per seed, standard-normal × 2', () => {
  const a = makeNoise(42, 100_000)
  assert.deepEqual(a, makeNoise(42, 100_000))
  assert.notDeepEqual(a.subarray(0, 10), makeNoise(43, 10))
  let sum = 0, sq = 0
  for (const v of a) { sum += v; sq += v * v }
  const mean = sum / a.length, std = Math.sqrt(sq / a.length - mean * mean)
  assert.ok(Math.abs(mean) < 0.05, `mean ${mean}`)
  assert.ok(Math.abs(std - 2) < 0.05, `std ${std}`)
})

test('routes: registered and status without a model', async () => {
  const { ctx, routes, call } = fakeContext()
  const dispose = apply(ctx)
  for (const r of ['GET /status', 'POST /download', 'POST /generate', 'GET /images', 'GET /images/:id', 'DELETE /images/:id', 'GET /agents', 'POST /agents/avatar']) {
    assert.ok(routes[r], r)
  }
  const { body } = await call('GET /status')
  assert.equal(body.model, false)
  assert.ok(body.threads >= 1)
  assert.equal((await call('POST /generate', { body: { prompt: 'a cat' } })).status, 409)
  assert.equal((await call('POST /generate', { body: { prompt: '   ' } })).status, 400)
  dispose()
})

test('threads setting: explicit value is honoured', async () => {
  const { ctx, call } = fakeContext({ threads: 1 })
  const dispose = apply(ctx)
  assert.equal((await call('GET /status')).body.threads, 1)
  dispose()
})

test('galleries are per account, ids are validated, anonymous is refused', async () => {
  const { ctx, call } = fakeContext()
  const dispose = apply(ctx)
  assert.equal((await call('GET /images/:id', { params: { id: '../../etc/passwd' } })).status, 400)
  ctx.setUser(undefined)
  assert.equal((await call('GET /images')).status, 401)
  dispose()
})

test('legacy shared gallery migrates to its authors', async () => {
  const kv = new Map([['index', [
    { id: 'aaaaaaaaaaaaaaaa', prompt: 'a', seed: 1, ms: 1, valid: true, createdAt: 'x', by: 'alice' },
    { id: 'bbbbbbbbbbbbbbbb', prompt: 'b', seed: 2, ms: 1, valid: true, createdAt: 'x', by: 'bob' },
  ]]])
  const { ctx, dir, call } = fakeContext({ kv })
  fs.mkdirSync(path.join(dir, 'images'), { recursive: true })
  for (const id of ['aaaaaaaaaaaaaaaa', 'bbbbbbbbbbbbbbbb']) fs.writeFileSync(path.join(dir, 'images', `${id}.png`), 'png')
  const dispose = apply(ctx)
  assert.deepEqual((await call('GET /images')).body.items.map((i) => i.id), ['aaaaaaaaaaaaaaaa'])
  assert.equal((await call('GET /images/:id', { params: { id: 'bbbbbbbbbbbbbbbb' } })).status, 404)
  ctx.setUser('bob')
  assert.deepEqual((await call('GET /images')).body.items.map((i) => i.id), ['bbbbbbbbbbbbbbbb'])
  assert.equal((await call('GET /images/:id', { params: { id: 'bbbbbbbbbbbbbbbb' } })).status, 200)
  assert.equal(kv.has('index'), false)
  assert.equal((await call('GET /images')).body.items[0].by, undefined)
  dispose()
})

test('png encoder: valid 512×512 RGB PNG, values clamped', () => {
  const P = 512 * 512
  const chw = new Float32Array(3 * P)
  chw.fill(-5, 0, P)        // red channel below range -> 0
  chw.fill(5, P, 2 * P)     // green above range -> 255
  chw.fill(NaN, 2 * P)      // blue NaN -> 0
  const png = encodePng(chw)
  assert.ok(png.subarray(0, 8).equals(Buffer.from('89504e470d0a1a0a', 'hex')))
  assert.equal(png.toString('ascii', 12, 16), 'IHDR')
  assert.equal(png.readUInt32BE(16), 512)
  assert.equal(png.readUInt32BE(20), 512)
  assert.equal(png[24], 8)  // bit depth
  assert.equal(png[25], 2)  // RGB
  const idatLen = png.readUInt32BE(33)
  assert.equal(png.toString('ascii', 37, 41), 'IDAT')
  const raw = zlib.inflateSync(png.subarray(41, 41 + idatLen))
  assert.equal(raw.length, 512 * (512 * 3 + 1))
  assert.deepEqual([...raw.subarray(0, 4)], [0, 0, 255, 0]) // filter byte, then R G B of the first pixel
  assert.equal(png.toString('ascii', png.length - 8, png.length - 4), 'IEND')
})
