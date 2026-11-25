/**
 * Avatar Studio — browser half.
 *
 * Plain ESM, no build step: React and @timon/ui come from the platform, strings
 * ship inline (Timon serves this file alone), data comes from the plugin's own
 * host routes through ctx.api.
 *
 * Surfaces: the /avatars page and its sidebar entry, a "Generate an avatar"
 * entry in every agent's menu, and a settings pane (CPU threads, presets).
 */
import React from 'react'
import {
  NavLink, Button, DropdownMenuItem, confirmAction,
  useAgentMenuItem, createTranslator, formatRelativeTime,
} from '@timon/ui'

const h = React.createElement
const ROUTE = '/avatars'

// ---------------------------------------------------------------- i18n
const MESSAGES = {
  en: {
    nav: 'Avatars',
    title: 'Avatar Studio',
    subtitle: 'Generate avatars for your agents, locally on the CPU. Hover an image to see its prompt and apply it to an agent.',
    forAgent: 'Avatar for {agent}',
    forAgentHint: '"Set as avatar" will apply to this agent.',
    clearAgent: 'Any agent',
    presets: '— Presets —',
    placeholder: 'Describe the avatar (English works best)',
    generate: 'Generate',
    generating: 'Generating…',
    seed: 'Seed',
    newSeed: 'New seed',
    keepSeed: 'keep seed',
    loadingModel: 'Loading the model, then generating (longer the first time)…',
    done: 'Image generated in {seconds} s.',
    empty: 'No images yet.',
    invalid: 'The computation produced an empty image.',
    invalidBadge: '⚠ empty image (failed computation)',
    seedLine: 'seed {seed} · {seconds} s · {when}',
    reuse: 'Reuse',
    save: 'Save',
    delete: 'Delete',
    deleteTitle: 'Delete this image?',
    agentPick: 'Agent…',
    setAvatar: 'Set as avatar',
    avatarSet: 'Avatar applied to {agent}.',
    modelTitle: 'Model to install (313 MB, once)',
    modelText: 'MiniT2I, MIT licence. It is stored in the plugin\'s data folder and shared by every account.',
    modelDownload: 'Download the model',
    modelProgress: 'Downloading… {percent} %',
    modelFailed: 'Download failed: {error}',
    modelManual: 'Or copy minit2i.onnx, minit2i.onnx.data and vocab.json into <TIMON_HOME>/plugins-data/avatar-studio/model/ (see README).',
    queue: '{count, plural, one {# image waiting} other {# images waiting}}',
    threads: 'Running on {count, plural, one {# CPU thread} other {# CPU threads}}.',
    menuItem: 'Generate an avatar',
    'settings.title': 'Avatar Studio',
    'settings.threads': 'CPU threads',
    'settings.threadsHint': '0 = automatic (all cores but one, so Timon stays responsive). Takes effect on the next image.',
    'settings.presets': 'Presets',
    'settings.presetsHint': 'Shown in the preset menu of the page, for every account.',
    'settings.label': 'Label',
    'settings.prompt': 'Prompt',
    'settings.add': 'Add a preset',
    'settings.remove': 'Remove',
    'settings.reset': 'Restore default presets',
    'settings.save': 'Save',
    'settings.saved': 'Saved.',
    'settings.failed': 'Could not save (an administrator may be required).',
    'error.model_missing': 'The model is not installed yet.',
    'error.http_outbound_denied': 'Network access is closed for this plugin. Allow huggingface.co and *.hf.co for avatar-studio, or copy the model by hand (see README).',
    'error.empty_prompt': 'Write a prompt.',
    'error.queue_full': 'Too many images waiting. Try again in a moment.',
    'error.not_found': 'Not found.',
    'error.forbidden': 'Timon refused to change this agent (insufficient rights).',
    'error.invalid': 'Timon refused the image.',
    'error.unauthenticated': 'Please sign in again.',
    'error.http': 'HTTP error {status}',
  },
  fr: {
    nav: 'Avatars',
    title: 'Avatar Studio',
    subtitle: 'Génère des avatars pour tes agents, en local sur le CPU. Survole une image pour voir son prompt et l\'appliquer à un agent.',
    forAgent: 'Avatar pour {agent}',
    forAgentHint: '« Définir comme avatar » s\'appliquera à cet agent.',
    clearAgent: 'N\'importe quel agent',
    presets: '— Préréglages —',
    placeholder: 'Décris l\'avatar (de préférence en anglais)',
    generate: 'Générer',
    generating: 'Génération…',
    seed: 'Graine',
    newSeed: 'Nouvelle graine',
    keepSeed: 'garder la graine',
    loadingModel: 'Chargement du modèle puis génération (plus long la première fois)…',
    done: 'Image générée en {seconds} s.',
    empty: 'Aucune image pour l\'instant.',
    invalid: 'Le calcul a produit une image vide.',
    invalidBadge: '⚠ image vide (calcul raté)',
    seedLine: 'graine {seed} · {seconds} s · {when}',
    reuse: 'Réutiliser',
    save: 'Enregistrer',
    delete: 'Supprimer',
    deleteTitle: 'Supprimer cette image ?',
    agentPick: 'Agent…',
    setAvatar: 'Définir comme avatar',
    avatarSet: 'Avatar appliqué à {agent}.',
    modelTitle: 'Modèle à installer (313 Mo, une seule fois)',
    modelText: 'MiniT2I, licence MIT. Il est stocké dans le dossier de données du plugin et partagé par tous les comptes.',
    modelDownload: 'Télécharger le modèle',
    modelProgress: 'Téléchargement… {percent} %',
    modelFailed: 'Échec du téléchargement : {error}',
    modelManual: 'Ou copie minit2i.onnx, minit2i.onnx.data et vocab.json dans <TIMON_HOME>/plugins-data/avatar-studio/model/ (voir README).',
    queue: '{count, plural, one {# image en attente} other {# images en attente}}',
    threads: 'Calcul sur {count, plural, one {# thread CPU} other {# threads CPU}}.',
    menuItem: 'Générer un avatar',
    'settings.title': 'Avatar Studio',
    'settings.threads': 'Threads CPU',
    'settings.threadsHint': '0 = automatique (tous les cœurs sauf un, pour que Timon reste fluide). Pris en compte à l\'image suivante.',
    'settings.presets': 'Préréglages',
    'settings.presetsHint': 'Affichés dans le menu de préréglages de la page, pour tous les comptes.',
    'settings.label': 'Nom',
    'settings.prompt': 'Prompt',
    'settings.add': 'Ajouter un préréglage',
    'settings.remove': 'Retirer',
    'settings.reset': 'Rétablir les préréglages par défaut',
    'settings.save': 'Enregistrer',
    'settings.saved': 'Enregistré.',
    'settings.failed': 'Enregistrement impossible (droits administrateur requis ?).',
    'error.model_missing': 'Le modèle n\'est pas encore installé.',
    'error.http_outbound_denied': 'Accès réseau fermé pour ce plugin. Autorise huggingface.co et *.hf.co pour avatar-studio, ou copie le modèle à la main (voir README).',
    'error.empty_prompt': 'Écris un prompt.',
    'error.queue_full': 'Trop d\'images en attente. Réessaie dans un instant.',
    'error.not_found': 'Introuvable.',
    'error.forbidden': 'Timon refuse de modifier cet agent (droits insuffisants).',
    'error.invalid': 'Timon a refusé l\'image.',
    'error.unauthenticated': 'Reconnecte-toi.',
    'error.http': 'Erreur HTTP {status}',
  },
}
const t = createTranslator(MESSAGES)

// ---------------------------------------------------------------- presets
const STYLE = ', 80s cartoon style, bold outlines, flat colors, centered portrait, simple background'
export const DEFAULT_PRESETS = [
  { label: 'Mission commander', prompt: 'cartoon robot commander in a trench coat and fedora, standing in front of a mission control board with sticky notes, confident smile' + STYLE },
  { label: 'Detective with magnifier', prompt: 'friendly cartoon robot detective with a magnifying glass, small helper robots around him holding tools' + STYLE },
  { label: 'Inspector with headset', prompt: 'cute robot inspector with an antenna and a headset, holding a clipboard with a checklist, cheerful' + STYLE },
  { label: 'Coder agent', prompt: 'cartoon robot mechanic with goggles and a wrench, typing on a tiny laptop, plain green background' + STYLE },
  { label: 'Reviewer agent', prompt: 'cartoon robot detective examining a scroll of code with a huge magnifying glass, suspicious squint, plain red background' + STYLE },
  { label: 'Planner agent', prompt: 'cartoon robot with a pointer stick in front of a board of colorful sticky notes, organized and proud, plain orange background' + STYLE },
  { label: 'Scheduler agent', prompt: 'cartoon robot with an alarm clock on its head and a pager in hand, alert expression, plain purple background' + STYLE },
  { label: 'Tester agent', prompt: 'cartoon robot scientist in a lab coat holding a test tube, curious face, plain yellow background' + STYLE },
  { label: 'Integrations agent', prompt: 'cartoon robot with many retractable gadget arms holding puzzle pieces, playful, plain teal background' + STYLE },
  { label: 'Chibi sticker', prompt: 'chibi style robot assistant waving hello, oversized head, glowing blue screen face showing a smile, cute sticker style, white outline, simple background' },
  { label: '3D render', prompt: '3d render of a cute robot detective with a magnifying glass, soft studio lighting, big eyes, friendly expression, portrait' },
  { label: 'Pixel art', prompt: 'pixel art avatar of a robot detective with trench coat and hat, 16-bit retro game style, simple background' },
]

function parsePresets(value) {
  if (typeof value !== 'string' || !value.trim()) return DEFAULT_PRESETS
  try {
    const list = JSON.parse(value)
    const clean = Array.isArray(list) ? list.filter((p) => p && typeof p.label === 'string' && typeof p.prompt === 'string' && p.prompt.trim()) : []
    return clean.length ? clean : DEFAULT_PRESETS
  } catch { return DEFAULT_PRESETS }
}

// ---------------------------------------------------------------- styles
const S = {
  // Timon gives a page a fixed-height region: the page scrolls itself.
  scroller: { height: '100%', maxHeight: '100%', flex: '1 1 auto', minHeight: 0, overflowY: 'auto', overflowX: 'hidden' },
  page: { padding: 24, maxWidth: 1200, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 16 },
  card: { border: '1px solid hsl(var(--border))', borderRadius: 12, padding: 16, background: 'hsl(var(--card, var(--background)))' },
  muted: { color: 'hsl(var(--muted-foreground))', fontSize: 13, margin: 0 },
  field: { font: 'inherit', color: 'inherit', background: 'hsl(var(--background))', border: '1px solid hsl(var(--border))', borderRadius: 8, padding: '7px 10px' },
  row: { display: 'flex', flexWrap: 'wrap', gap: 10, alignItems: 'center' },
  grid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 14 },
  fig: { margin: 0, border: '1px solid hsl(var(--border))', borderRadius: 12, overflow: 'hidden', background: 'hsl(var(--card, var(--background)))' },
  pic: { position: 'relative', aspectRatio: '1 / 1', background: 'hsl(var(--muted))', outline: 'none' },
  img: { width: '100%', height: '100%', display: 'block', objectFit: 'cover' },
  overlay: (on) => ({
    position: 'absolute', inset: 0, padding: 12, display: 'flex', flexDirection: 'column', justifyContent: 'flex-end', gap: 6,
    background: 'linear-gradient(to top, rgba(0,0,0,.88), rgba(0,0,0,.4) 60%, rgba(0,0,0,0))', color: '#fff', fontSize: 12, lineHeight: 1.4,
    opacity: on ? 1 : 0, transition: 'opacity .15s', overflow: 'auto', pointerEvents: on ? 'auto' : 'none',
  }),
  chip: { background: 'rgba(255,255,255,.16)', color: '#fff', border: '1px solid rgba(255,255,255,.35)', borderRadius: 6, padding: '3px 8px', fontSize: 11, cursor: 'pointer', font: 'inherit' },
  bar: { height: 8, borderRadius: 4, background: 'hsl(var(--muted))', overflow: 'hidden' },
  error: { color: 'hsl(var(--destructive))', fontSize: 13, margin: 0 },
  banner: { border: '1px solid hsl(var(--primary))', borderRadius: 10, padding: '10px 14px', display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' },
}

function AvatarIcon({ className }) {
  return h('svg', { className, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 1.6, strokeLinecap: 'round', strokeLinejoin: 'round', 'aria-hidden': true },
    h('circle', { cx: 12, cy: 9, r: 4 }),
    h('path', { d: 'M4.5 20c1.2-3.4 4-5 7.5-5s6.3 1.6 7.5 5' }),
    h('path', { d: 'M18.5 3.5l.6 1.4 1.4.6-1.4.6-.6 1.4-.6-1.4-1.4-.6 1.4-.6z' }))
}

const randomSeed = () => Math.floor(Math.random() * 2 ** 31)
const seconds = (ms) => (ms / 1000).toFixed(1)
const agentFromUrl = () => {
  try { return new URLSearchParams(window.location.search).get('agent') || '' } catch { return '' }
}

// ---------------------------------------------------------------- plugin
export function apply(ctx) {
  const urlCache = new Map() // image id -> object URL

  const api = (p, init) => ctx.api(p, init)
  const postJson = (p, data) => api(p, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(data) })
  const errorText = async (res) => {
    let code = ''
    try { code = (await res.json()).error || '' } catch {}
    const key = `error.${code}`
    const text = code ? t(key) : ''
    return text && text !== key ? text : t('error.http', { status: res.status })
  }

  function useImageUrl(id) {
    const [url, setUrl] = React.useState(urlCache.get(id) || null)
    React.useEffect(() => {
      if (urlCache.has(id)) { setUrl(urlCache.get(id)); return }
      let live = true
      api(`images/${id}`).then((r) => (r.ok ? r.blob() : null)).then((b) => {
        if (!b || !live) return
        const u = URL.createObjectURL(b); urlCache.set(id, u); setUrl(u)
      }).catch(() => {})
      return () => { live = false }
    }, [id])
    return url
  }

  function Tile({ item, agents, targetAgent, onReuse, onDelete, notify }) {
    const url = useImageUrl(item.id)
    const [hover, setHover] = React.useState(false)
    const [agent, setAgent] = React.useState(targetAgent || '')
    const [busy, setBusy] = React.useState(false)
    React.useEffect(() => { if (targetAgent) setAgent(targetAgent) }, [targetAgent])

    const applyToAgent = async () => {
      if (!agent) return
      setBusy(true)
      try {
        const r = await postJson('agents/avatar', { agent, id: item.id })
        notify(r.ok ? t('avatarSet', { agent }) : await errorText(r), !r.ok)
      } finally { setBusy(false) }
    }

    return h('figure', { style: S.fig },
      h('div', {
        style: S.pic, tabIndex: 0, 'aria-label': item.prompt,
        onMouseEnter: () => setHover(true), onMouseLeave: () => setHover(false),
        onFocus: () => setHover(true), onBlur: (e) => { if (!e.currentTarget.contains(e.relatedTarget)) setHover(false) },
      },
      url && h('img', { src: url, alt: item.prompt, style: S.img }),
      h('div', { style: S.overlay(hover) },
        h('div', { style: { whiteSpace: 'pre-wrap', wordBreak: 'break-word' } }, item.prompt),
        h('div', { style: { opacity: 0.75 } }, t('seedLine', { seed: item.seed, seconds: seconds(item.ms), when: formatRelativeTime(item.createdAt) })),
        h('div', { style: { ...S.row, gap: 6 } },
          h('button', { type: 'button', style: S.chip, onClick: () => onReuse(item) }, t('reuse')),
          url && h('a', { href: url, download: `avatar-${item.seed}.png`, style: { ...S.chip, textDecoration: 'none' } }, t('save')),
          h('button', { type: 'button', style: S.chip, onClick: () => onDelete(item) }, t('delete'))),
        agents.length > 0 && h('div', { style: { ...S.row, gap: 6 } },
          h('select', { value: agent, onChange: (e) => setAgent(e.target.value), style: { ...S.chip, background: 'rgba(0,0,0,.55)' }, 'aria-label': t('agentPick') },
            h('option', { value: '' }, t('agentPick')),
            agents.map((a) => h('option', { key: a.name, value: a.name }, a.name))),
          h('button', { type: 'button', style: S.chip, disabled: !agent || busy, onClick: applyToAgent }, busy ? '…' : t('setAvatar'))))),
      !item.valid && h('figcaption', { style: { ...S.error, padding: '6px 10px' } }, t('invalidBadge')))
  }

  function ModelCard({ status, onDownload }) {
    const dl = status.download
    return h('section', { style: { ...S.card, display: 'flex', flexDirection: 'column', gap: 8 } },
      h('strong', null, t('modelTitle')),
      h('p', { style: S.muted }, t('modelText')),
      dl?.state === 'running'
        ? h('div', null,
            h('div', { style: S.bar }, h('div', { style: { height: '100%', width: `${(dl.ratio * 100).toFixed(1)}%`, background: 'hsl(var(--primary))' } })),
            h('p', { style: { ...S.muted, marginTop: 6 } }, t('modelProgress', { percent: Math.round(dl.ratio * 100) })))
        : h('div', null, h(Button, { onClick: onDownload }, t('modelDownload'))),
      dl?.state === 'error' && h('p', { style: S.error }, t('modelFailed', { error: dl.error })),
      h('p', { style: S.muted }, t('modelManual')))
  }

  function AvatarStudio() {
    const [status, setStatus] = React.useState(null)
    const [items, setItems] = React.useState([])
    const [agents, setAgents] = React.useState([])
    const [presets, setPresets] = React.useState(DEFAULT_PRESETS)
    const [targetAgent, setTargetAgent] = React.useState(agentFromUrl())
    const [prompt, setPrompt] = React.useState(DEFAULT_PRESETS[0].prompt)
    const [seed, setSeed] = React.useState(randomSeed())
    const [keepSeed, setKeepSeed] = React.useState(false)
    const [busy, setBusy] = React.useState(false)
    const [message, setMessage] = React.useState(null)
    const promptRef = React.useRef(null)

    const notify = (text, error = false) => setMessage({ text, error })
    const refreshStatus = React.useCallback(() => api('status').then((r) => r.json()).then(setStatus).catch(() => {}), [])

    React.useEffect(() => {
      refreshStatus()
      api('images').then((r) => (r.ok ? r.json() : { items: [] })).then((b) => setItems(b.items || [])).catch(() => {})
      api('agents').then((r) => (r.ok ? r.json() : { agents: [] })).then((b) => setAgents(b.agents || [])).catch(() => {})
      ctx.settings.get().then((s) => setPresets(parsePresets(s?.presets))).catch(() => {})
      const onPop = () => setTargetAgent(agentFromUrl())
      window.addEventListener('popstate', onPop)
      return () => window.removeEventListener('popstate', onPop)
    }, [])

    React.useEffect(() => {
      if (status?.download?.state !== 'running') return
      const timer = setInterval(refreshStatus, 1000)
      return () => clearInterval(timer)
    }, [status?.download?.state])

    const startDownload = async () => {
      const r = await api('download', { method: 'POST' })
      if (!r.ok) notify(await errorText(r), true)
      refreshStatus()
    }

    const generate = async () => {
      if (!prompt.trim() || busy) return
      setBusy(true)
      notify(status?.loaded ? t('generating') : t('loadingModel'))
      try {
        const r = await postJson('generate', { prompt, seed })
        if (!r.ok) { notify(await errorText(r), true); return }
        const { item } = await r.json()
        setItems((list) => [item, ...list])
        notify(item.valid ? t('done', { seconds: seconds(item.ms) }) : t('invalid'), !item.valid)
        if (!keepSeed) setSeed(randomSeed())
      } catch (e) {
        notify(String(e?.message || e), true)
      } finally { setBusy(false); refreshStatus() }
    }

    const reuse = (item) => {
      setPrompt(item.prompt); setSeed(item.seed); setKeepSeed(true)
      promptRef.current?.focus(); promptRef.current?.scrollIntoView?.({ behavior: 'smooth', block: 'center' })
    }
    const remove = async (item) => {
      const ok = await confirmAction({ title: t('deleteTitle'), description: item.prompt, confirmLabel: t('delete'), destructive: true })
      if (!ok) return
      const r = await api(`images/${item.id}`, { method: 'DELETE' })
      if (!r.ok) { notify(await errorText(r), true); return }
      setItems((list) => list.filter((i) => i.id !== item.id))
      const u = urlCache.get(item.id); if (u) { URL.revokeObjectURL(u); urlCache.delete(item.id) }
    }

    return h('div', { style: S.scroller }, h('main', { style: S.page },
      h('header', null,
        h('h1', { style: { fontSize: 22, fontWeight: 600, margin: 0 } }, t('title')),
        h('p', { style: S.muted }, t('subtitle'))),
      targetAgent && h('div', { style: S.banner },
        h('strong', null, t('forAgent', { agent: targetAgent })),
        h('span', { style: S.muted }, t('forAgentHint')),
        h(Button, { variant: 'ghost', size: 'sm', onClick: () => { setTargetAgent(''); ctx.navigate(ROUTE) } }, t('clearAgent'))),
      status && !status.model && h(ModelCard, { status, onDownload: startDownload }),
      h('section', { style: { ...S.card, display: 'flex', flexDirection: 'column', gap: 10 } },
        h('select', {
          style: S.field, value: '', 'aria-label': t('presets'),
          onChange: (e) => { const p = presets[Number(e.target.value)]; if (p) setPrompt(p.prompt) },
        },
        h('option', { value: '' }, t('presets')),
        presets.map((p, i) => h('option', { key: i, value: String(i) }, p.label))),
        h('textarea', {
          ref: promptRef, value: prompt, rows: 3, maxLength: 1000,
          style: { ...S.field, resize: 'vertical', width: '100%', boxSizing: 'border-box' },
          placeholder: t('placeholder'), 'aria-label': t('placeholder'),
          onChange: (e) => setPrompt(e.target.value),
          onKeyDown: (e) => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) generate() },
        }),
        h('div', { style: S.row },
          h(Button, { onClick: generate, disabled: busy || !status?.model || !prompt.trim() }, busy ? t('generating') : t('generate')),
          h('label', { style: { ...S.row, gap: 6, ...S.muted } }, t('seed'),
            h('input', { type: 'number', min: 0, value: seed, onChange: (e) => setSeed(Math.max(0, Number(e.target.value) || 0)), style: { ...S.field, width: 130 } })),
          h(Button, { variant: 'outline', onClick: () => setSeed(randomSeed()), title: t('newSeed'), 'aria-label': t('newSeed') }, '🎲'),
          h('label', { style: { ...S.row, gap: 6, ...S.muted } },
            h('input', { type: 'checkbox', checked: keepSeed, onChange: (e) => setKeepSeed(e.target.checked) }), t('keepSeed'))),
        message && h('p', { style: message.error ? S.error : S.muted, role: 'status' }, message.text),
        status?.model && h('p', { style: S.muted },
          t('threads', { count: status.threads }), status.pending > 0 ? ' ' + t('queue', { count: status.pending }) : '')),
      items.length === 0
        ? h('p', { style: S.muted }, t('empty'))
        : h('div', { style: S.grid }, items.map((item) =>
            h(Tile, { key: item.id, item, agents, targetAgent, onReuse: reuse, onDelete: remove, notify })))))
  }

  // ------------------------------------------------------------ settings pane
  function SettingsPane() {
    const [threads, setThreads] = React.useState(0)
    const [presets, setPresets] = React.useState(DEFAULT_PRESETS)
    const [state, setState] = React.useState(null)

    React.useEffect(() => {
      ctx.settings.get().then((s) => {
        setThreads(Number(s?.threads) || 0)
        setPresets(parsePresets(s?.presets))
      }).catch(() => {})
    }, [])

    const edit = (i, field, value) => setPresets((list) => list.map((p, k) => (k === i ? { ...p, [field]: value } : p)))
    const save = async () => {
      const clean = presets.filter((p) => p.label.trim() && p.prompt.trim()).map((p) => ({ label: p.label.trim(), prompt: p.prompt.trim() }))
      const isDefault = JSON.stringify(clean) === JSON.stringify(DEFAULT_PRESETS)
      try {
        const results = await Promise.all([
          ctx.settings.set('threads', Math.max(0, Math.floor(Number(threads) || 0))),
          ctx.settings.set('presets', isDefault ? '' : JSON.stringify(clean)),
        ])
        setState(results.every((r) => r.ok) ? 'saved' : 'failed')
      } catch { setState('failed') }
    }

    return h('div', { style: { display: 'flex', flexDirection: 'column', gap: 18, padding: 4 } },
      h('div', { style: { display: 'flex', flexDirection: 'column', gap: 6 } },
        h('label', { style: { fontWeight: 600 } }, t('settings.threads'),
          h('input', { type: 'number', min: 0, value: threads, onChange: (e) => setThreads(e.target.value), style: { ...S.field, width: 100, marginLeft: 12 } })),
        h('p', { style: S.muted }, t('settings.threadsHint'))),
      h('div', { style: { display: 'flex', flexDirection: 'column', gap: 8 } },
        h('strong', null, t('settings.presets')),
        h('p', { style: S.muted }, t('settings.presetsHint')),
        presets.map((p, i) => h('div', { key: i, style: { display: 'grid', gridTemplateColumns: 'minmax(120px, 200px) 1fr auto', gap: 8, alignItems: 'start' } },
          h('input', { value: p.label, placeholder: t('settings.label'), 'aria-label': t('settings.label'), onChange: (e) => edit(i, 'label', e.target.value), style: S.field }),
          h('textarea', { value: p.prompt, rows: 2, placeholder: t('settings.prompt'), 'aria-label': t('settings.prompt'), onChange: (e) => edit(i, 'prompt', e.target.value), style: { ...S.field, resize: 'vertical' } }),
          h(Button, { variant: 'ghost', size: 'sm', onClick: () => setPresets((list) => list.filter((_, k) => k !== i)) }, t('settings.remove')))),
        h('div', { style: S.row },
          h(Button, { variant: 'outline', size: 'sm', onClick: () => setPresets((list) => [...list, { label: '', prompt: '' }]) }, t('settings.add')),
          h(Button, { variant: 'ghost', size: 'sm', onClick: () => setPresets(DEFAULT_PRESETS) }, t('settings.reset')))),
      h('div', { style: S.row },
        h(Button, { onClick: save }, t('settings.save')),
        state && h('span', { style: state === 'saved' ? S.muted : S.error, role: 'status' }, t(state === 'saved' ? 'settings.saved' : 'settings.failed'))))
  }

  // ------------------------------------------------------------ agent menu entry
  function AgentMenuEntry() {
    const agent = useAgentMenuItem()
    if (!agent) return null
    return h(DropdownMenuItem, { onSelect: () => ctx.navigate(`${ROUTE}?agent=${encodeURIComponent(agent.name)}`) }, t('menuItem'))
  }

  const disposers = [
    ctx.slots.register({ slot: 'page', key: ROUTE }, AvatarStudio),
    ctx.slots.register({ slot: 'nav.item', key: ROUTE }, () => h(NavLink, { href: ROUTE, label: t('nav'), icon: AvatarIcon })),
    ctx.slots.register({ slot: 'agent.menu.item' }, AgentMenuEntry),
    ctx.slots.register({ slot: 'settings.section', key: ctx.id }, SettingsPane),
  ]

  return () => {
    for (const dispose of disposers) dispose()
    for (const u of urlCache.values()) URL.revokeObjectURL(u)
    urlCache.clear()
  }
}
