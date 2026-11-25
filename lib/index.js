/**
 * Avatar Studio — host half.
 *
 * Runs MiniT2I (text-to-image, 512×512, MIT) natively with onnxruntime-node
 * inside the daemon: a few seconds per image on a recent CPU, no GPU needed.
 *
 * Storage (ctx.storage.dir):
 *   model/                 minit2i.onnx, minit2i.onnx.data, vocab.json (shared, downloaded once)
 *   images/<user>/<id>.png generated images, one folder per account
 * Gallery index per account: ctx.storage.kv 'index:<user>'.
 */
import path from 'node:path'
import os from 'node:os'
import fs from 'node:fs/promises'
import { createWriteStream, existsSync, statSync } from 'node:fs'
import zlib from 'node:zlib'
import crypto from 'node:crypto'
import { T5Tokenizer, makeNoise } from './tokenizer.js'

export const name = 'avatar-studio'
export const inject = ['storage', 'settings']

const MODEL_BASE = 'https://huggingface.co/cfahlgren1/MiniT2I-B-16-MF-compact-webgpu-int8/resolve/cfdc0d1ed60ac43d922b7ba8da4f365dd8579feb/'
const MODEL_FILES = [
  ['minit2i.onnx', 2336435],
  ['minit2i.onnx.data', 310480256],
  ['vocab.json', 1136194],
]
const L = 256
const SIZE = 512
const N = 3 * SIZE * SIZE
const IDLE_UNLOAD_MS = 10 * 60_000
const MAX_IMAGES_PER_USER = 200
const MAX_QUEUE = 4
const MAX_PROMPT = 1000

class HttpError extends Error {
  constructor(status, code) { super(code); this.status = status; this.code = code }
}

/** @param {import('@timon-ai/sdk').PluginContext} ctx */
export function apply(ctx) {
  const root = ctx.storage.dir
  const modelDir = path.join(root, 'model')
  const imagesRoot = path.join(root, 'images')

  let engine = null          // Promise<{ ort, session, tokenizer, threads }>
  let idleTimer = null
  let queue = Promise.resolve()
  let pending = 0
  let disposed = false
  const downloadAbort = new AbortController()
  const download = { state: 'idle', ratio: 0, error: null }

  // ---------- settings ----------
  function threadCount() {
    const wanted = Number(ctx.settings.get('threads'))
    const cores = os.availableParallelism?.() ?? os.cpus().length
    if (Number.isFinite(wanted) && wanted > 0) return Math.min(Math.floor(wanted), cores)
    return Math.max(1, cores - 1) // leave one core to the daemon and the agents
  }

  // ---------- model ----------
  const modelPresent = () => MODEL_FILES.every(([f, size]) => {
    const p = path.join(modelDir, f)
    return existsSync(p) && statSync(p).size === size
  })

  function scheduleUnload() {
    clearTimeout(idleTimer)
    idleTimer = setTimeout(() => { void unload() }, IDLE_UNLOAD_MS)
    idleTimer.unref?.()
  }

  async function unload() {
    const current = engine
    engine = null
    if (!current) return
    try { (await current).session.release?.() } catch { /* never loaded */ }
  }

  function loadEngine() {
    if (engine) return engine
    const threads = threadCount()
    engine = (async () => {
      if (!modelPresent()) throw new HttpError(409, 'model_missing')
      const ort = (await import('onnxruntime-node')).default
      // Graph optimisations stay off: onnxruntime's layer-norm fusion pass fails on
      // this int8/fp16 export, and the unoptimised graph is just as fast here.
      const session = await ort.InferenceSession.create(path.join(modelDir, 'minit2i.onnx'), {
        executionProviders: ['cpu'],
        graphOptimizationLevel: 'disabled',
        intraOpNumThreads: threads,
        interOpNumThreads: 1,
      })
      const vocab = JSON.parse(await fs.readFile(path.join(modelDir, 'vocab.json'), 'utf8'))
      return { ort, session, tokenizer: new T5Tokenizer(vocab), threads }
    })()
    engine.catch(() => { engine = null })
    return engine
  }

  async function generate(prompt, seed) {
    // A changed thread setting takes effect on the next image.
    if (engine && (await engine.catch(() => null))?.threads !== threadCount()) await unload()
    const { ort, session, tokenizer } = await loadEngine()
    const { ids, mask } = tokenizer.encodePadded(prompt, L)
    const started = Date.now()
    const out = await session.run({
      input_ids: new ort.Tensor('int64', ids, [1, L]),
      attention_mask: new ort.Tensor('int64', mask, [1, L]),
      noise: new ort.Tensor('float32', makeNoise(seed, N), [1, 3, SIZE, SIZE]),
    })
    const ms = Date.now() - started
    const chw = out.image.data
    out.image.dispose?.()
    scheduleUnload()

    // Quality guard: a constant or NaN output means the computation failed.
    let sum = 0, sq = 0, nan = 0
    for (const v of chw) { if (Number.isNaN(v)) nan++; else { sum += v; sq += v * v } }
    const mean = sum / chw.length
    const std = Math.sqrt(Math.max(0, sq / chw.length - mean * mean))
    return { png: encodePng(chw), ms, valid: nan === 0 && std > 0.02 }
  }

  async function startDownload() {
    if (download.state === 'running') return
    Object.assign(download, { state: 'running', ratio: 0, error: null })
    const total = MODEL_FILES.reduce((s, [, size]) => s + size, 0)
    let done = 0
    try {
      await fs.mkdir(modelDir, { recursive: true })
      for (const [file, size] of MODEL_FILES) {
        const target = path.join(modelDir, file)
        if (existsSync(target) && statSync(target).size === size) { done += size; download.ratio = done / total; continue }
        const res = await ctx.fetch(MODEL_BASE + file, { signal: downloadAbort.signal })
        if (!res.ok || !res.body) throw new Error(`${file}: HTTP ${res.status}`)
        const tmp = target + '.part'
        const sink = createWriteStream(tmp)
        try {
          for await (const chunk of res.body) {
            if (!sink.write(chunk)) await new Promise((r) => sink.once('drain', r))
            done += chunk.length
            download.ratio = Math.min(1, done / total)
          }
          await new Promise((resolve, reject) => sink.end((err) => (err ? reject(err) : resolve())))
        } catch (error) {
          sink.destroy()
          await fs.rm(tmp, { force: true })
          throw error
        }
        if (statSync(tmp).size !== size) { await fs.rm(tmp, { force: true }); throw new Error(`${file}: incomplete download`) }
        await fs.rename(tmp, target)
      }
      Object.assign(download, { state: 'done', ratio: 1 })
    } catch (error) {
      if (disposed) return
      Object.assign(download, { state: 'error', error: String(error?.message || error) })
      ctx.log?.warn?.(`model download failed: ${download.error}`)
    }
  }

  // ---------- per-account gallery ----------
  function caller() {
    const user = ctx.user?.()
    if (!user?.id) throw new HttpError(401, 'unauthenticated')
    return String(user.id)
  }
  const userKey = (uid) => crypto.createHash('sha256').update(uid).digest('hex').slice(0, 24) // safe folder name
  const userDir = (uid) => path.join(imagesRoot, userKey(uid))
  const indexKey = (uid) => `index:${userKey(uid)}`
  const readIndex = async (uid) => (await ctx.storage.kv.get(indexKey(uid))) ?? []
  const writeIndex = (uid, items) => ctx.storage.kv.set(indexKey(uid), items)
  const validId = (id) => typeof id === 'string' && /^[a-f0-9]{16}$/.test(id)

  // 0.0.x kept one shared gallery ('index', images/<id>.png) with the author in `by`.
  // Move each image into its author's gallery; entries without an author are dropped.
  async function migrateLegacy() {
    const legacy = await ctx.storage.kv.get('index')
    if (!Array.isArray(legacy)) return
    const byUser = new Map()
    for (const item of legacy) {
      const from = path.join(imagesRoot, `${item.id}.png`)
      if (!item.by || !validId(item.id) || !existsSync(from)) { await fs.rm(from, { force: true }); continue }
      const uid = String(item.by)
      await fs.mkdir(userDir(uid), { recursive: true })
      await fs.rename(from, path.join(userDir(uid), `${item.id}.png`))
      const { by, ...rest } = item
      if (!byUser.has(uid)) byUser.set(uid, [])
      byUser.get(uid).push(rest)
    }
    for (const [uid, items] of byUser) await writeIndex(uid, [...items, ...(await readIndex(uid))].slice(0, MAX_IMAGES_PER_USER))
    await ctx.storage.kv.del('index')
    ctx.log?.info?.(`migrated ${legacy.length} images to per-account galleries`)
  }
  const migrated = migrateLegacy().catch((error) => ctx.log?.warn?.(`gallery migration failed: ${error?.message || error}`))

  // ---------- routes ----------
  const body = (req) => {
    if (req.body && typeof req.body === 'object') return req.body
    try { return JSON.parse(req.body || '{}') } catch { return {} }
  }
  const handle = (fn) => async (req, res) => {
    try { await migrated; await fn(req, res) } catch (error) {
      const status = Number(error?.status) >= 400 && Number(error?.status) < 500 ? Number(error.status) : 500
      if (status === 500) ctx.log?.error?.(String(error?.stack || error))
      // Errors from ctx.agents carry their own code (invalid, not_found, forbidden, conflict).
      res.status(status).json({ error: error?.code || (status === 500 ? 'internal_error' : 'request_failed') })
    }
  }

  const router = ctx.router()

  router.get('/status', handle(async (_req, res) => {
    res.json({
      model: modelPresent(),
      loaded: Boolean(engine),
      pending,
      threads: threadCount(),
      download,
      canDownload: typeof ctx.fetch === 'function',
    })
  }))

  router.post('/download', handle(async (_req, res) => {
    caller()
    if (modelPresent()) return res.json({ state: 'done' })
    if (typeof ctx.fetch !== 'function') throw new HttpError(403, 'http_outbound_denied')
    void startDownload()
    res.json({ state: 'running' })
  }))

  router.post('/generate', handle(async (req, res) => {
    const uid = caller()
    const { prompt, seed } = body(req)
    const text = String(prompt ?? '').trim().slice(0, MAX_PROMPT)
    if (!text) throw new HttpError(400, 'empty_prompt')
    if (!modelPresent()) throw new HttpError(409, 'model_missing')
    if (pending >= MAX_QUEUE) throw new HttpError(429, 'queue_full')
    const s = Number.isFinite(Number(seed)) ? Number(seed) >>> 0 : crypto.randomInt(2 ** 31)

    pending++
    const job = queue.then(() => generate(text, s))
    queue = job.catch(() => {})
    let result
    try { result = await job } finally { pending-- }

    const id = crypto.randomBytes(8).toString('hex')
    const dir = userDir(uid)
    await fs.mkdir(dir, { recursive: true })
    await fs.writeFile(path.join(dir, `${id}.png`), result.png)
    const item = { id, prompt: text, seed: s, ms: result.ms, valid: result.valid, createdAt: new Date().toISOString() }
    const index = [item, ...(await readIndex(uid))]
    for (const old of index.splice(MAX_IMAGES_PER_USER)) await fs.rm(path.join(dir, `${old.id}.png`), { force: true })
    await writeIndex(uid, index)
    res.json({ item })
  }))

  router.get('/images', handle(async (_req, res) => {
    res.json({ items: await readIndex(caller()) })
  }))

  router.get('/images/:id', handle(async (req, res) => {
    const uid = caller()
    if (!validId(req.params.id)) throw new HttpError(400, 'bad_id')
    const file = path.join(userDir(uid), `${req.params.id}.png`)
    if (!existsSync(file)) throw new HttpError(404, 'not_found')
    res.set('Cache-Control', 'private, max-age=31536000, immutable')
    res.type('image/png').send(await fs.readFile(file))
  }))

  router.delete('/images/:id', handle(async (req, res) => {
    const uid = caller()
    if (!validId(req.params.id)) throw new HttpError(400, 'bad_id')
    await fs.rm(path.join(userDir(uid), `${req.params.id}.png`), { force: true })
    await writeIndex(uid, (await readIndex(uid)).filter((i) => i.id !== req.params.id))
    res.json({ ok: true })
  }))

  router.get('/agents', handle(async (_req, res) => {
    caller()
    const agents = await ctx.agents.list()
    res.json({ agents: agents.map((a) => ({ name: a.name, role: a.role ?? null })) })
  }))

  router.post('/agents/avatar', handle(async (req, res) => {
    const uid = caller()
    const { agent, id } = body(req)
    if (!validId(id) || typeof agent !== 'string' || !agent) throw new HttpError(400, 'bad_request')
    const file = path.join(userDir(uid), `${id}.png`)
    if (!existsSync(file)) throw new HttpError(404, 'not_found')
    // Timon checks that the signed-in account may manage this agent.
    const data = (await fs.readFile(file)).toString('base64')
    const url = await ctx.agents.setAvatar(agent, { mime: 'image/png', data })
    try { await ctx.agents.update(agent, { avatar: 'image' }) } catch { /* the picture is set either way */ }
    res.json({ ok: true, url })
  }))

  return () => {
    disposed = true
    downloadAbort.abort()
    clearTimeout(idleTimer)
    void unload()
  }
}

// ---------- minimal PNG encoder (RGB, 8 bit) ----------
export function encodePng(chw) {
  const P = SIZE * SIZE
  const stride = SIZE * 3 + 1
  const raw = Buffer.alloc(SIZE * stride)
  for (let y = 0; y < SIZE; y++) {
    const row = y * stride // first byte: filter type 0
    for (let x = 0; x < SIZE; x++) {
      const p = y * SIZE + x
      for (let c = 0; c < 3; c++) {
        const v = Math.max(-1, Math.min(1, chw[c * P + p])) * 127.5 + 128
        raw[row + 1 + x * 3 + c] = Number.isNaN(v) ? 0 : Math.min(255, Math.floor(v))
      }
    }
  }
  const chunk = (type, data) => {
    const len = Buffer.alloc(4); len.writeUInt32BE(data.length)
    const td = Buffer.concat([Buffer.from(type, 'ascii'), data])
    const crc = Buffer.alloc(4); crc.writeUInt32BE(zlib.crc32(td) >>> 0)
    return Buffer.concat([len, td, crc])
  }
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(SIZE, 0); ihdr.writeUInt32BE(SIZE, 4)
  ihdr[8] = 8; ihdr[9] = 2 // 8-bit RGB
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', zlib.deflateSync(raw, { level: 6 })),
    chunk('IEND', Buffer.alloc(0)),
  ])
}
