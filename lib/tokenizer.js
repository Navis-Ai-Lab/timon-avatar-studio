// T5 Unigram tokenizer (SentencePiece-compatible Viterbi), port of tokenizer.ts
// from cfahlgren1/MiniT2I-B-16-MF-compact-webgpu-int8 (MIT).

const PAD_ID = 0
const EOS_ID = 1
const UNK_ID = 2
const FIRST_PIECE_ID = 3

export class T5Tokenizer {
  constructor(vocab) {
    this.pieces = new Map()
    let maxLength = 0
    let minScore = 0
    vocab.forEach(([piece, score], id) => {
      if (id < FIRST_PIECE_ID) return
      this.pieces.set(piece, [id, score])
      maxLength = Math.max(maxLength, piece.length)
      minScore = Math.min(minScore, score)
    })
    this.maxPieceLength = maxLength
    this.unkScore = minScore - 10
  }

  encode(text) {
    const words = text.normalize('NFKC').split(/\s+/).filter(Boolean)
    const ids = words.flatMap((word) => this.encodeWord('▁' + word))
    ids.push(EOS_ID)
    return ids
  }

  encodePadded(text, length) {
    let tokens = this.encode(text)
    if (tokens.length > length) tokens = [...tokens.slice(0, length - 1), EOS_ID]
    const ids = new BigInt64Array(length).fill(BigInt(PAD_ID))
    const mask = new BigInt64Array(length)
    tokens.forEach((token, i) => { ids[i] = BigInt(token); mask[i] = 1n })
    return { ids, mask }
  }

  encodeWord(word) {
    const n = word.length
    const best = new Array(n + 1).fill(-Infinity)
    const back = new Array(n + 1)
    best[0] = 0
    for (let i = 0; i < n; i++) {
      if (best[i] === -Infinity) continue
      let hasSingleChar = false
      for (let len = 1; len <= this.maxPieceLength && i + len <= n; len++) {
        const entry = this.pieces.get(word.slice(i, i + len))
        if (!entry) continue
        if (len === 1) hasSingleChar = true
        const score = best[i] + entry[1]
        if (score > best[i + len]) { best[i + len] = score; back[i + len] = [i, entry[0]] }
      }
      if (!hasSingleChar && best[i] + this.unkScore > best[i + 1]) {
        best[i + 1] = best[i] + this.unkScore
        back[i + 1] = [i, UNK_ID]
      }
    }
    const out = []
    for (let j = n; j > 0; j = back[j][0]) out.push(back[j][1])
    out.reverse()
    return out.filter((id, k) => !(id === UNK_ID && out[k - 1] === UNK_ID))
  }
}

// Initial noise: same PRNG (mulberry32) + Box-Muller as the original Space, × init_noise_sigma 2.
export function makeNoise(seed, n) {
  let state = seed >>> 0
  const random = () => {
    state = (state + 0x6d2b79f5) | 0
    let t = Math.imul(state ^ (state >>> 15), 1 | state)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
  const out = new Float32Array(n)
  for (let i = 0; i < n; i += 2) {
    const r = 2 * Math.sqrt(-2 * Math.log(1 - random()))
    const a = 2 * Math.PI * random()
    out[i] = r * Math.cos(a)
    out[i + 1] = r * Math.sin(a)
  }
  return out
}
