/**
 * MODE LOCAL (sans compte) : même « surface » que src/lib/api.ts, mais tout est gardé DANS CE NAVIGATEUR.
 *  - textes, profils, conversations, demandes d'aide : localStorage (une seule clé JSON) ;
 *  - images, GIF, vidéos : IndexedDB (jamais dans localStorage, trop petit) ;
 *  - rien ne sort de l'appareil : il n'y a PAS de chat entre deux appareils, seulement entre les profils
 *    créés dans ce navigateur. L'application l'affiche clairement.
 * Aucun envoi n'est simulé : si le navigateur refuse d'enregistrer un fichier, l'envoi échoue avec un message.
 */
import type {
  BlockedUser, ConversationSummary, HelpRequest, HelpStatus, Message, Profile, ReportKind, ReportReason,
  ReportRow, ReportStatus, SearchResult, Settings,
} from '../types.ts'
import { CATEGORIES, LIMITS, RULES_VERSION } from '../lib/config.ts'
import { sniffType, type Sniffed } from '../lib/files.ts'
import {
  DEFAULT_RELAY, cleanPublicKey, decryptText, deriveChannel, encryptText, genKeyPair, mailboxTopic, normalizeRelay, publish, subscribe, verificationCode,
  type Channel, type KeyPair, type RelayEvent, type RelayStatus,
} from './online.ts'

// ---------------------------------------------------------------- Types internes
/** remote = personne d'un AUTRE appareil, ajoutée par code de partage : elle n'a pas de session ici. */
interface Person {
  n: number
  profile: Profile
  settings: Settings
  remote?: boolean
  /** Mode en ligne activé pour ce profil (profils de CET appareil seulement). */
  online?: boolean
  /** La question « activer le mode en ligne ? » a déjà été posée à ce profil (on ne la repose pas). */
  oq?: boolean
  /** Ne pas montrer « est en train d'écrire… » à mes contacts. */
  notyp?: boolean
  /** Clés ECDH du profil (créées à la première activation du mode en ligne). */
  keys?: KeyPair
  /** Personne qui m'a écrit en ligne et que je n'ai pas encore acceptée : invisible dans la recherche et les contacts. */
  pend?: boolean
  /** Clé publique de ce contact en ligne. */
  pk?: JsonWebKey
}
interface Conv { id: string; a: string; b: string; created_at: string; archived: Record<string, boolean>; read_at: Record<string, string>; ch?: Channel }
interface ContactReq { id: string; from: string; to: string; status: 'pending' | 'accepted' | 'refused'; created_at: string; responded_at: string | null; seen_by_from?: boolean; net?: { mid: string; pk: JsonWebKey } }
/** Demande d'ajout que J'AI envoyée en ligne à un numéro (on ne connaît pas encore la personne). */
interface NetReq { id: string; local: string; to_public_id: string; created_at: string; status: 'pending' | 'accepted' | 'refused'; responded_at: string | null; seen_by_from?: boolean; person?: string; label?: string }
/** Envois en attente de connexion : un message ou une réponse n'est jamais perdu en silence. */
interface Outbox { id: string; profile: string; topic: string; body: string; msg?: string }
interface BlockRow { blocker_id: string; blocked_id: string; created_at: string }
interface HelpRow { id: string; author_id: string; title: string; description: string; category: string; status: HelpStatus; image_path: string | null; urgent?: boolean; created_at: string }
interface Db {
  v: 1
  seq: number
  last: string | null
  /** Numéros déjà attribués puis supprimés : jamais réutilisés. */
  retired: number[]
  people: Record<string, Person>
  convs: Conv[]
  messages: Message[]
  blocks: BlockRow[]
  requests: ContactReq[]
  reports: ReportRow[]
  help: HelpRow[]
  netreq: NetReq[]
  outbox: Outbox[]
  /** Identifiants des messages en ligne déjà traités (le relais peut renvoyer les mêmes). */
  seenNet: string[]
  /** Adresse d'un relais personnalisé (null = relais par défaut). */
  relay: string | null
  /** Dernier message reçu du relais, par profil (secondes). */
  cursor: Record<string, number>
}

export interface OutgoingFile { blob: File; type: Sniffed }
export interface IncomingMessage { id: string; conversation_id: string; sender_id: string; created_at: string }

const KEY = 'cdp.local.v1'
const ACTIVE_KEY = 'cdp.local.active'
const DB_NAME = 'cdp-local-media'

const fresh = (): Db => ({ v: 1, seq: 1, last: null, retired: [], people: {}, convs: [], messages: [], blocks: [], requests: [], reports: [], help: [], netreq: [], outbox: [], seenNet: [], relay: null, cursor: {} })
function fail(code: string): never {
  throw new Error(code)
}
const nowIso = () => new Date().toISOString()
const newId = () => (typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : `id-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`)

// ---------------------------------------------------------------- Stockage texte (localStorage)
let memoryOnly = false
let memoryCopy: string | null = null
let db: Db = load()

function read(): string | null {
  try {
    return window.localStorage.getItem(KEY)
  } catch {
    memoryOnly = true
    return memoryCopy
  }
}

function load(): Db {
  try {
    const raw = read()
    if (!raw) return fresh()
    const d = JSON.parse(raw) as Partial<Db>
    if (d && d.v === 1 && d.people && Array.isArray(d.convs) && Array.isArray(d.messages)) {
      return { ...fresh(), ...d, retired: d.retired ?? [], blocks: d.blocks ?? [], requests: d.requests ?? [], reports: d.reports ?? [], help: d.help ?? [], netreq: d.netreq ?? [], outbox: d.outbox ?? [], seenNet: d.seenNet ?? [], relay: d.relay ?? null, cursor: d.cursor ?? {} } as Db
    }
  } catch {
    /* données illisibles : on repart de zéro sans planter */
  }
  return fresh()
}

function save(): void {
  const raw = JSON.stringify(db)
  memoryCopy = raw
  try {
    window.localStorage.setItem(KEY, raw)
    memoryOnly = false
  } catch (e) {
    const name = (e as { name?: string } | null)?.name ?? ''
    if (/quota/i.test(name)) fail('local_quota')
    memoryOnly = true // stockage bloqué (ex. navigation privée) : on garde en mémoire, l'interface l'indique
  }
}

/** false si le navigateur refuse d'enregistrer : les données disparaîtront à la fermeture de l'onglet. */
export function isStorageDurable(): boolean {
  return !memoryOnly
}

// ---------------------------------------------------------------- Stockage des fichiers (IndexedDB)
let dbPromise: Promise<IDBDatabase> | null = null
function openMedia(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise
  dbPromise = new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') return reject(new Error('storage_unavailable'))
    let req: IDBOpenDBRequest
    try {
      req = indexedDB.open(DB_NAME, 1)
    } catch {
      return reject(new Error('storage_unavailable'))
    }
    req.onupgradeneeded = () => req.result.createObjectStore('media')
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(new Error('storage_unavailable'))
    req.onblocked = () => reject(new Error('storage_unavailable'))
  })
  dbPromise.catch(() => { dbPromise = null })
  return dbPromise
}

function tx<T>(mode: IDBTransactionMode, run: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  return openMedia().then(
    (d) =>
      new Promise<T>((resolve, reject) => {
        let t: IDBTransaction
        try {
          t = d.transaction('media', mode)
        } catch {
          return reject(new Error('storage_unavailable'))
        }
        const r = run(t.objectStore('media'))
        t.oncomplete = () => resolve(r.result)
        t.onabort = t.onerror = () => {
          const n = (t.error as { name?: string } | null)?.name ?? ''
          reject(new Error(/quota/i.test(n) ? 'local_quota' : 'storage_unavailable'))
        }
      }),
  )
}

const mediaKey = (bucket: string, path: string) => `${bucket}/${path}`
const putMedia = (bucket: string, path: string, blob: Blob) => tx('readwrite', (s) => s.put(blob, mediaKey(bucket, path))).then(() => undefined)
const getMedia = (bucket: string, path: string) => tx<Blob | undefined>('readonly', (s) => s.get(mediaKey(bucket, path)))
async function delMedia(bucket: string, paths: string[]): Promise<void> {
  for (const p of paths) await tx('readwrite', (s) => s.delete(mediaKey(bucket, p))).catch(() => undefined)
}

function toDataUrl(b: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader()
    r.onload = () => resolve(String(r.result))
    r.onerror = () => reject(new Error('read_failed'))
    r.readAsDataURL(b)
  })
}

// ---------------------------------------------------------------- Profil actif (propre à chaque onglet)
let activeId: string | null = initialActive()
function initialActive(): string | null {
  let id: string | null = null
  try {
    id = window.sessionStorage.getItem(ACTIVE_KEY) || db.last
  } catch {
    id = db.last
  }
  return id && db.people[id] ? id : null
}
function setActive(id: string | null): void {
  activeId = id
  try {
    if (id) window.sessionStorage.setItem(ACTIVE_KEY, id)
    else window.sessionStorage.removeItem(ACTIVE_KEY)
  } catch { /* ignoré */ }
  void syncOnline()
}

type Sess = { user: { id: string; email: string | null } } | null
const authListeners = new Set<(s: Sess) => void>()
const msgListeners = new Set<(m: IncomingMessage) => void>()
const helpListeners = new Set<(h: { id: string; author_id: string; title: string }) => void>()
const session = (): Sess => (activeId && db.people[activeId] ? { user: { id: activeId, email: null } } : null)
const emitAuth = () => authListeners.forEach((cb) => cb(session()))

function emitMessage(m: Message): void {
  const c = db.convs.find((x) => x.id === m.conversation_id)
  if (!c || !activeId || (c.a !== activeId && c.b !== activeId)) return
  const evt = { id: m.id, conversation_id: m.conversation_id, sender_id: m.sender_id, created_at: m.created_at }
  if (m.sender_id !== activeId && typingUntil.delete(m.conversation_id)) typingListeners.forEach((cb) => cb())
  msgListeners.forEach((cb) => cb(evt))
}

// ---------------------------------------------------------------- Modifications, suppressions et « écrit… » : abonnements
export interface MessageChange { kind: 'edit' | 'delete'; id: string; conversation_id: string }
const changeListeners = new Set<(c: MessageChange) => void>()
const emitChange = (c: MessageChange) => changeListeners.forEach((cb) => cb(c))
export function subscribeMessageChanges(cb: (c: MessageChange) => void): () => void {
  changeListeners.add(cb)
  return () => void changeListeners.delete(cb)
}

const TYPING_KEY = 'cdp.local.typing'
const TYPING_SHOWN_MS = 9000
const typingUntil = new Map<string, number>()
const typingListeners = new Set<() => void>()
const typingSentAt = new Map<string, number>()
function setTyping(convId: string): void {
  typingUntil.set(convId, Date.now() + TYPING_SHOWN_MS)
  typingListeners.forEach((cb) => cb())
}
export function isPeerTyping(convId: string): boolean {
  return (typingUntil.get(convId) ?? 0) > Date.now()
}
export function subscribeTyping(cb: () => void): () => void {
  typingListeners.add(cb)
  return () => void typingListeners.delete(cb)
}
function onTypingFromStorage(raw: string): void {
  try {
    const d = JSON.parse(raw) as { c?: unknown; f?: unknown; t?: unknown }
    if (!activeId || typeof d.c !== 'string' || typeof d.f !== 'string' || typeof d.t !== 'number' || d.f === activeId || Date.now() - d.t > 15000) return
    const live = (() => {
      const r = read()
      return r && r !== memoryCopy ? JSON.parse(r) as Db : db
    })()
    const c = live.convs.find((x) => x.id === d.c && memberOf(x, activeId as string) && memberOf(x, d.f as string))
    if (c && !live.blocks.some((b) => (b.blocker_id === activeId && b.blocked_id === d.f) || (b.blocker_id === d.f && b.blocked_id === activeId))) setTyping(c.id)
  } catch { /* indicateur facultatif */ }
}

/** « Je suis en train d'écrire » : au plus une fois toutes les 8 s par conversation, jamais mis en file d'attente, jamais d'erreur visible. */
export function sendTyping(conversationId: string): void {
  const my = activeId
  const mine = my ? db.people[my] : undefined
  if (!my || !mine || mine.notyp) return
  const c = db.convs.find((x) => x.id === conversationId && memberOf(x, my))
  if (!c) return
  const otherId = c.a === my ? c.b : c.a
  const other = db.people[otherId]
  if (!other || isBlocked(my, otherId)) return
  const now = Date.now()
  if (now - (typingSentAt.get(c.id) ?? 0) < 8000) return
  if (!other.remote) {
    typingSentAt.set(c.id, now)
    try {
      window.localStorage.setItem(TYPING_KEY, JSON.stringify({ c: c.id, f: my, t: now, n: Math.random() }))
    } catch { /* ignoré */ }
    return
  }
  if (c.ch && relayStatus === 'online') {
    typingSentAt.set(c.id, now)
    void (async () => {
      try {
        const { iv, ct } = await encryptText(c.ch!.key, c.ch!.topic, JSON.stringify({ s: my, t: now }))
        await publish(getRelay(), c.ch!.topic, JSON.stringify({ cdp: 1, t: 'typ', mid: newId(), iv, ct }))
      } catch { /* l'indicateur est facultatif */ }
    })()
  }
}

export function getTypingEnabled(): boolean {
  return !(activeId && db.people[activeId]?.notyp)
}
export function setTypingEnabled(on: boolean): void {
  const p = me()
  p.notyp = on ? undefined : true
  save()
}

// Autre onglet du même navigateur : on recharge les données et on signale les nouveaux messages.
if (typeof window !== 'undefined') {
  window.addEventListener('storage', (e) => {
    if (e.key === TYPING_KEY && e.newValue) {
      onTypingFromStorage(e.newValue)
      return
    }
    if (e.key !== KEY) return
    const known = new Set(db.messages.map((m) => m.id))
    const before = new Map(db.messages.map((m) => [m.id, m]))
    const knownHelp = new Set(db.help.map((h) => h.id))
    db = load()
    const now = new Map(db.messages.map((m) => [m.id, m]))
    before.forEach((m, id) => {
      const n = now.get(id)
      if (!n) emitChange({ kind: 'delete', id, conversation_id: m.conversation_id })
      else if (n.content !== m.content || (n.edited_at ?? null) !== (m.edited_at ?? null)) emitChange({ kind: 'edit', id, conversation_id: n.conversation_id })
    })
    db.help.filter((h) => !knownHelp.has(h.id)).forEach((h) => helpListeners.forEach((cb) => cb({ id: h.id, author_id: h.author_id, title: h.title })))
    if (activeId && !db.people[activeId]) {
      setActive(null)
      emitAuth()
    }
    db.messages.filter((m) => !known.has(m.id)).forEach(emitMessage)
    void syncOnline()
  })
}

let lastTs = 0
function nextTs(): string {
  lastTs = Math.max(Date.now(), lastTs + 1)
  return new Date(lastTs).toISOString()
}

function me(): Person {
  const p = activeId ? db.people[activeId] : undefined
  return p ?? fail('not_authenticated')
}
const pad = (n: number) => String(n).padStart(4, '0')
const isBlocked = (a: string, b: string) => db.blocks.some((x) => (x.blocker_id === a && x.blocked_id === b) || (x.blocker_id === b && x.blocked_id === a))
const memberOf = (c: Conv, id: string) => c.a === id || c.b === id
const mini = (p: Profile) => ({ public_id: p.public_id, display_name: p.display_name, avatar_path: p.avatar_path })

const defaultSettings = (): Settings => ({
  theme: 'eitt', theme_custom: {}, notification_preferences: {}, allow_contact: true, searchable: true, rules_accepted_at: null, rules_version: null,
})

// ---------------------------------------------------------------- « Authentification » : choix du profil, pas de mot de passe
export interface LocalProfileInfo { id: string; n: number; profile: Profile; rulesOk: boolean }

export function listLocalProfiles(): LocalProfileInfo[] {
  return Object.entries(db.people)
    .filter(([, p]) => !p.remote)
    .map(([id, p]) => ({ id, n: p.n, profile: p.profile, rulesOk: p.settings.rules_version === RULES_VERSION }))
    .sort((a, b) => a.n - b.n)
}
export const publicIdOf = (n: number): string => `User#${pad(n)}`

function randomInt(max: number): number {
  const buf = new Uint32Array(1)
  if (typeof crypto !== 'undefined' && crypto.getRandomValues) crypto.getRandomValues(buf)
  else buf[0] = Math.floor(Math.random() * 0xffffffff)
  return buf[0] % max
}

const takenNumbers = (): Set<number> => new Set([...Object.values(db.people).map((p) => p.n), ...db.retired])

/** Tire un numéro au hasard (1 à 9999, puis 5 chiffres si presque tout est pris), jamais déjà attribué ni supprimé. */
export function pickRandomNumber(): number {
  const taken = takenNumbers()
  const range = taken.size > 8000 ? 99999 : 9999
  for (let i = 0; i < 300; i++) {
    const n = 1 + randomInt(range)
    if (!taken.has(n)) return n
  }
  let n = 1
  while (taken.has(n)) n++
  return n
}

/** Crée un profil local avec un identifiant tiré au hasard (User#4827…), l'enregistre et l'active. Un numéro supprimé n'est jamais réutilisé. */
export function createLocalProfile(p: { displayName: string; acceptRules: boolean; number?: number; online?: boolean }): Profile {
  const name = p.displayName.trim().slice(0, 40)
  const n = p.number && Number.isInteger(p.number) && p.number > 0 && !takenNumbers().has(p.number) ? p.number : pickRandomNumber()
  const id = newId()
  const profile: Profile = { id, public_id: `User#${pad(n)}`, display_name: name || null, avatar_path: null, bio: null, created_at: nowIso() }
  const settings = defaultSettings()
  if (p.acceptRules) {
    settings.rules_version = RULES_VERSION
    settings.rules_accepted_at = nowIso()
  }
  db.people[id] = { n, profile, settings, oq: true }
  if (p.online && p.acceptRules) {
    // Mode en ligne choisi à la création : le profil « écoute » sa boîte de demandes. Rien n'est publié tant qu'on n'agit pas.
    db.people[id].online = true
    void genKeyPair().then((k) => {
      const me2 = db.people[id]
      if (me2 && !me2.keys) {
        me2.keys = k
        save()
      }
    })
  }
  db.seq = Math.max(db.seq, n + 1)
  db.last = id
  save()
  setActive(id)
  emitAuth()
  return profile
}

/** Vrai tant qu'on n'a pas encore demandé à ce profil s'il veut passer en ligne (profils créés avant ce mode). */
export function onlinePromptDue(): boolean {
  const p = activeId ? db.people[activeId] : undefined
  return Boolean(p && !p.remote && !p.online && !p.oq && rulesOk(p))
}

/** Réponse à la question : activer maintenant, ou plus tard (posée une seule fois ; l'interrupteur reste dans la barre). */
export async function answerOnlinePrompt(enable: boolean): Promise<void> {
  const p = activeId ? db.people[activeId] : undefined
  if (!p) return
  p.oq = true
  save()
  if (enable) await setOnline(true)
}

export function useLocalProfile(id: string): void {
  if (!db.people[id] || db.people[id].remote) fail('target_not_found')
  db.last = id
  save()
  setActive(id)
  emitAuth()
}

export function wipeAllLocalData(): void {
  db = fresh()
  stopOnlineNow()
  lastTs = 0
  try { window.localStorage.removeItem(KEY) } catch { /* ignoré */ }
  memoryCopy = null
  urlCache.clear()
  if (typeof indexedDB !== 'undefined') {
    try { indexedDB.deleteDatabase(DB_NAME) } catch { /* ignoré */ }
  }
  dbPromise = null
  setActive(null)
  emitAuth()
}

export async function signUp(): Promise<{ needsConfirmation: boolean }> { return fail('not_supported_local') }
export async function signIn(): Promise<void> { return fail('not_supported_local') }
export async function updatePassword(): Promise<void> { return fail('not_supported_local') }
export async function requestPasswordReset(): Promise<void> { return fail('not_supported_local') }

/** « Se déconnecter » = ne plus utiliser de profil dans cet onglet (les profils restent enregistrés). */
export async function signOut(): Promise<void> {
  db.last = null
  save()
  setActive(null)
  emitAuth()
}
export async function getSession(): Promise<Sess> { return session() }
export function onAuthChange(cb: (s: Sess) => void): () => void {
  authListeners.add(cb)
  return () => void authListeners.delete(cb)
}

// ---------------------------------------------------------------- Profils et réglages
export async function fetchProfile(id: string): Promise<Profile | null> { return db.people[id]?.profile ?? null }
export async function fetchSettings(uid: string): Promise<Settings> { return (db.people[uid] ?? fail('target_not_found')).settings }

export async function updateProfile(uid: string, patch: { display_name?: string | null; bio?: string | null; avatar_path?: string | null }): Promise<Profile> {
  const p = db.people[uid] ?? fail('target_not_found')
  const next = { ...p.profile }
  if ('display_name' in patch) {
    const v = (patch.display_name ?? '').trim()
    if (v.length > 40) fail('name_too_long')
    next.display_name = v || null
  }
  if ('bio' in patch) {
    const v = (patch.bio ?? '').trim()
    if (v.length > 300) fail('bio_too_long')
    next.bio = v || null
  }
  if ('avatar_path' in patch) next.avatar_path = patch.avatar_path ?? null
  p.profile = next
  save()
  return next
}

export async function updateSettings(uid: string, patch: Partial<Pick<Settings, 'theme' | 'theme_custom' | 'notification_preferences' | 'allow_contact' | 'searchable'>>): Promise<void> {
  const p = db.people[uid] ?? fail('target_not_found')
  p.settings = { ...p.settings, ...patch }
  save()
}

export async function acceptRules(version: string): Promise<void> {
  const p = me()
  if (version !== RULES_VERSION) fail('invalid_rules_version')
  p.settings = { ...p.settings, rules_version: version, rules_accepted_at: nowIso() }
  save()
}

/** Les avatars sont réduits (256 px) et gardés directement dans le profil sous forme d'image « data: ». */
export function avatarUrl(path: string | null | undefined): string | null {
  return path && /^data:image\/(jpeg|png|webp);base64,/.test(path) ? path : null
}

async function makeAvatar(b: Blob): Promise<string> {
  const src = await toDataUrl(b)
  const img = new Image()
  await new Promise<void>((ok, ko) => {
    img.onload = () => ok()
    img.onerror = () => ko(new Error('file_type_not_allowed'))
    img.src = src
  })
  const S = 256
  const c = document.createElement('canvas')
  c.width = S
  c.height = S
  const ctx = c.getContext('2d')
  if (!ctx) return fail('storage_unavailable')
  const side = Math.min(img.width, img.height)
  ctx.drawImage(img, (img.width - side) / 2, (img.height - side) / 2, side, side, 0, 0, S, S)
  return c.toDataURL('image/jpeg', 0.85)
}

export async function uploadAvatar(uid: string, blob: File, _type: Sniffed, _previousPath: string | null): Promise<Profile> {
  return updateProfile(uid, { avatar_path: await makeAvatar(blob) })
}
export async function removeAvatar(uid: string, _previousPath: string | null): Promise<Profile> {
  return updateProfile(uid, { avatar_path: null })
}

// ---------------------------------------------------------------- Recherche (identifiant exact uniquement)
const normName = (s: string): string => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim()

/**
 * Deux façons de retrouver quelqu'un parmi les profils de CET appareil :
 *  - par identifiant exact (User#4827, user 4827, #4827) ;
 *  - par nom (début ou morceau du nom, sans tenir compte des accents ni des majuscules : « leo g » trouve « Léo.G »).
 */
export async function searchProfiles(query: string): Promise<SearchResult[]> {
  const my = me()
  const visible = (p: Person) => !db.blocks.some((b) => b.blocker_id === p.profile.id && b.blocked_id === my.profile.id)
  const toResult = (p: Person): SearchResult => ({
    id: p.profile.id,
    public_id: p.profile.public_id,
    display_name: p.profile.display_name,
    avatar_path: p.profile.avatar_path,
    bio: p.profile.bio,
    can_contact: p.profile.id !== my.profile.id && p.settings.allow_contact && !isBlocked(my.profile.id, p.profile.id),
  })
  const m = /^\s*(?:user)?\s*#?\s*(\d{1,9})\s*$/i.exec(query ?? '')
  if (m) {
    const num = Number(m[1])
    return Object.values(db.people)
      .filter((p) => !p.pend && p.n === num && (p.profile.id === my.profile.id || p.settings.searchable) && visible(p))
      .map(toResult)
  }
  const q = normName((query ?? '').replace(/^\s*user\s*#?/i, ''))
  if (q.length < 2) return []
  return Object.values(db.people)
    .filter((p) => !p.pend && p.profile.id !== my.profile.id && p.settings.searchable && visible(p) && p.profile.display_name)
    .map((p) => ({ p, name: normName(p.profile.display_name as string) }))
    .filter((x) => x.name.includes(q))
    .sort((a, b) => Number(b.name === q) - Number(a.name === q) || Number(b.name.startsWith(q)) - Number(a.name.startsWith(q)) || a.p.n - b.p.n)
    .slice(0, 20)
    .map((x) => toResult(x.p))
}

// ---------------------------------------------------------------- Conversations et messages
const rulesOk = (p: Person) => p.settings.rules_version === RULES_VERSION
const convOf = (id: string): Conv => {
  const my = me()
  const c = db.convs.find((x) => x.id === id)
  if (!c || !memberOf(c, my.profile.id)) return fail('not_member')
  return c
}

export async function listConversations(): Promise<ConversationSummary[]> {
  const my = me().profile.id
  const out: ConversationSummary[] = []
  for (const c of db.convs) {
    if (!memberOf(c, my) || c.archived[my]) continue
    const otherId = c.a === my ? c.b : c.a
    const other = db.people[otherId]?.profile
    if (!other) continue
    const msgs = db.messages.filter((m) => m.conversation_id === c.id)
    const last = msgs[msgs.length - 1]
    const readAt = c.read_at[my] ?? ''
    out.push({
      conversation_id: c.id,
      other_id: otherId,
      other_public_id: other.public_id,
      other_display_name: other.display_name,
      other_avatar_path: other.avatar_path,
      last_message_at: last?.created_at ?? null,
      last_message_content: last?.content ?? null,
      last_message_sender: last?.sender_id ?? null,
      last_has_attachment: Boolean(last?.message_attachments.length),
      unread_count: msgs.filter((m) => m.sender_id !== my && m.created_at > readAt).length,
      blocked_by_me: db.blocks.some((b) => b.blocker_id === my && b.blocked_id === otherId),
    })
  }
  return out.sort((x, y) => (y.last_message_at ?? '').localeCompare(x.last_message_at ?? ''))
}

export async function startConversation(otherId: string): Promise<string> {
  const my = me()
  if (!rulesOk(my)) fail('rules_required')
  const other = db.people[otherId]
  if (!other || otherId === my.profile.id || !other.settings.allow_contact || isBlocked(my.profile.id, otherId)) fail('contact_unavailable')
  const found = db.convs.find((c) => memberOf(c, my.profile.id) && memberOf(c, otherId))
  if (found) {
    if (found.archived[my.profile.id]) {
      found.archived[my.profile.id] = false
      save()
    }
    return found.id
  }
  // Personne de CET appareil : il faut d'abord une demande d'ajout ACCEPTÉE (les contacts d'un autre appareil sont déjà choisis par code).
  if (!other.remote || other.pend) {
    if (sendContactRequest(otherId) !== 'accepted') fail('request_sent')
    const made = db.convs.find((c) => memberOf(c, my.profile.id) && memberOf(c, otherId))
    if (made) return made.id
  }
  const c: Conv = { id: newId(), a: my.profile.id, b: otherId, created_at: nowIso(), archived: {}, read_at: {} }
  db.convs.push(c)
  save()
  return c.id
}

export async function fetchMessages(conversationId: string, opts: { before?: string; limit?: number } = {}): Promise<{ messages: Message[]; hasMore: boolean }> {
  convOf(conversationId)
  const limit = opts.limit ?? 50
  let rows = db.messages.filter((m) => m.conversation_id === conversationId && (!opts.before || m.created_at < opts.before))
  rows = rows.sort((x, y) => x.created_at.localeCompare(y.created_at))
  const page = rows.slice(-limit)
  return { messages: page, hasMore: rows.length > limit }
}

export async function fetchMessage(id: string): Promise<Message | null> {
  const my = me().profile.id
  const m = db.messages.find((x) => x.id === id)
  const c = m && db.convs.find((x) => x.id === m.conversation_id)
  return m && c && memberOf(c, my) ? m : null
}

function checkFileSize(t: Sniffed, size: number): void {
  const max = t.kind === 'video' ? LIMITS.videoBytes : t.kind === 'gif' ? LIMITS.gifBytes : LIMITS.imageBytes
  if (size > max) fail('file_too_large')
}

/** Revérifie le fichier comme le ferait un serveur : signature réelle des octets + taille. */
async function recheck(f: OutgoingFile): Promise<void> {
  const real = sniffType(new Uint8Array(await f.blob.slice(0, 64).arrayBuffer()))
  if (!real || real.mime !== f.type.mime) fail('file_type_not_allowed')
  checkFileSize(real, f.blob.size)
}

const cleanName = (n: string) => (n.split(/[\\/]/).pop() || 'fichier').replace(/[\u0000-\u001f<>"|?*]/g, '').slice(0, 100) || 'fichier'

export async function sendMessage(p: { conversationId: string; content: string; file?: OutgoingFile | null }): Promise<string> {
  const my = me()
  const c = convOf(p.conversationId)
  if (!rulesOk(my)) fail('rules_required')
  const content = p.content.trim()
  if (!content && !p.file) fail('empty_message')
  if (content.length > LIMITS.messageChars) fail('message_too_long')
  const otherId = c.a === my.profile.id ? c.b : c.a
  if (!db.people[otherId] || isBlocked(my.profile.id, otherId)) fail('contact_unavailable')
  await chPending.get(c.id) // canal chiffré en cours de création (acceptation d'une demande en ligne)
  const attachments: Message['message_attachments'] = []
  let storedPath: string | null = null
  if (p.file) {
    await recheck(p.file)
    const path = `${c.id}/${newId()}.${p.file.type.ext}`
    await putMedia('chat-media', path, p.file.blob) // si le navigateur refuse : l'erreur remonte, rien n'est « envoyé »
    storedPath = path
    attachments.push({ id: newId(), storage_path: path, file_name: cleanName(p.file.blob.name), mime_type: p.file.type.mime, file_size: p.file.blob.size })
  }
  const msg: Message = { id: newId(), conversation_id: c.id, sender_id: my.profile.id, content, created_at: nextTs(), message_attachments: attachments }
  const remote = Boolean(db.people[otherId].remote)
  const viaRelay = remote && Boolean(c.ch)
  if (viaRelay) msg.net = attachments.length ? 'file' : 'queued'
  else if (remote) msg.net = 'local' // contact d'un autre appareil sans lien en ligne : le message reste ici, et on le dit
  db.messages.push(msg)
  try {
    save()
  } catch (e) {
    db.messages.pop()
    if (storedPath) await delMedia('chat-media', [storedPath])
    throw e
  }
  emitMessage(msg)
  if (viaRelay && !attachments.length) void netSend(my.profile.id, c.id, msg.id)
  return msg.id
}

export async function deleteMessage(m: Message): Promise<void> {
  const my = me().profile.id
  const i = db.messages.findIndex((x) => x.id === m.id && x.sender_id === my)
  if (i < 0) fail('not_member')
  const [gone] = db.messages.splice(i, 1)
  const hadOutbox = db.outbox.some((o) => o.msg === gone.id)
  db.outbox = db.outbox.filter((o) => o.msg !== gone.id) // jamais parti : rien à effacer chez l'autre
  save()
  await delMedia('chat-media', gone.message_attachments.map((a) => a.storage_path))
  emitChange({ kind: 'delete', id: gone.id, conversation_id: gone.conversation_id })
  const c = db.convs.find((x) => x.id === gone.conversation_id)
  const other = c && db.people[c.a === my ? c.b : c.a]
  if (c?.ch && other?.remote && !hadOutbox && !gone.message_attachments.length && gone.net !== 'local' && gone.net !== 'file') void netDelete(my, c.id, gone.id)
}

/** Modifie le texte d'un de MES messages. En ligne, la modification est envoyée (chiffrée) ; en mode fichier, elle reste ici. */
export async function editMessage(messageId: string, content: string): Promise<Message> {
  const my = me()
  if (!rulesOk(my)) fail('rules_required')
  const m = db.messages.find((x) => x.id === messageId && x.sender_id === my.profile.id) ?? fail('not_member')
  const text = content.trim()
  if (!text && !m.message_attachments.length) fail('empty_message')
  if (text.length > LIMITS.messageChars) fail('message_too_long')
  if (text === m.content) return m
  const c = convOf(m.conversation_id)
  const otherId = c.a === my.profile.id ? c.b : c.a
  if (!db.people[otherId] || isBlocked(my.profile.id, otherId)) fail('contact_unavailable')
  m.content = text
  m.edited_at = nextTs()
  save()
  emitChange({ kind: 'edit', id: m.id, conversation_id: m.conversation_id })
  if (c.ch && db.people[otherId].remote && !m.message_attachments.length && m.net !== 'local' && m.net !== 'file') {
    const waiting = db.outbox.filter((o) => o.msg === m.id)
    if (waiting.length) {
      // Pas encore parti : on remplace le message en attente par la nouvelle version (le contact ne verra jamais l'ancienne).
      db.outbox = db.outbox.filter((o) => o.msg !== m.id)
      m.net = 'queued'
      save()
      void netSend(my.profile.id, c.id, m.id)
    } else if (m.net === 'failed') {
      m.net = 'queued'
      save()
      void netSend(my.profile.id, c.id, m.id)
    } else {
      void netEdit(my.profile.id, c.id, m.id)
    }
  }
  return m
}

export async function markRead(conversationId: string): Promise<void> {
  const c = convOf(conversationId)
  c.read_at[me().profile.id] = nowIso()
  save()
}

export async function archiveConversation(conversationId: string, archived: boolean): Promise<void> {
  const c = convOf(conversationId)
  c.archived[me().profile.id] = archived
  save()
}

// Les fichiers sont relus depuis IndexedDB et donnés sous forme d'URL « data: » : les URL « blob: » sont refusées quand la page est ouverte en double-clic (file://).
const urlCache = new Map<string, string>()
export async function signedUrl(bucket: 'chat-media' | 'help-images', path: string): Promise<string> {
  const key = mediaKey(bucket, path)
  const hit = urlCache.get(key)
  if (hit) return hit
  if (bucket === 'chat-media') {
    const my = activeId
    const c = db.convs.find((x) => path.startsWith(`${x.id}/`))
    if (!my || !c || !memberOf(c, my)) fail('not_member')
  }
  const blob = await getMedia(bucket, path)
  if (!blob) return fail('media_missing')
  const url = await toDataUrl(blob)
  urlCache.set(key, url)
  return url
}

// ---------------------------------------------------------------- Blocage et signalement
export async function blockUser(id: string): Promise<void> {
  const my = me().profile.id
  if (id === my || !db.people[id]) fail('target_not_found')
  if (!db.blocks.some((b) => b.blocker_id === my && b.blocked_id === id)) {
    db.blocks.push({ blocker_id: my, blocked_id: id, created_at: nowIso() })
    db.requests = db.requests.filter((r) => !(r.status === 'pending' && ((r.from === my && r.to === id) || (r.from === id && r.to === my))))
    save()
  }
}
export async function unblockUser(id: string): Promise<void> {
  const my = me().profile.id
  db.blocks = db.blocks.filter((b) => !(b.blocker_id === my && b.blocked_id === id))
  save()
}
export async function isBlockedByMe(id: string): Promise<boolean> {
  const my = me().profile.id
  return db.blocks.some((b) => b.blocker_id === my && b.blocked_id === id)
}
export async function listBlocked(): Promise<BlockedUser[]> {
  const my = me().profile.id
  return db.blocks
    .filter((b) => b.blocker_id === my)
    .sort((x, y) => y.created_at.localeCompare(x.created_at))
    .map((b) => {
      const p = db.people[b.blocked_id]?.profile
      return { blocked_id: b.blocked_id, created_at: b.created_at, profile: p ? { id: p.id, public_id: p.public_id, display_name: p.display_name, avatar_path: p.avatar_path } : null }
    })
}

const REASONS: ReportReason[] = ['harcelement', 'arnaque', 'donnees_personnelles', 'contenu_inapproprie', 'spam', 'usurpation', 'autre']
/** Le signalement est seulement ENREGISTRÉ sur cet appareil : en mode local, personne ne le reçoit. */
export async function report(kind: ReportKind, targetId: string, reason: ReportReason, details: string): Promise<void> {
  const my = me().profile
  if (!REASONS.includes(reason)) fail('invalid_reason')
  let reported: string | null = null
  let snapshot: string | null = null
  let messageId: string | null = null
  let helpId: string | null = null
  if (kind === 'profile') {
    if (targetId === my.id) fail('cannot_report_self')
    reported = db.people[targetId]?.profile.public_id ?? fail('target_not_found')
  } else if (kind === 'message') {
    const m = db.messages.find((x) => x.id === targetId) ?? fail('target_not_found')
    if (m.sender_id === my.id) fail('cannot_report_self')
    reported = db.people[m.sender_id]?.profile.public_id ?? null
    snapshot = m.content.slice(0, 500)
    messageId = m.id
  } else {
    const h = db.help.find((x) => x.id === targetId) ?? fail('target_not_found')
    if (h.author_id === my.id) fail('cannot_report_self')
    reported = db.people[h.author_id]?.profile.public_id ?? null
    snapshot = `${h.title}\n${h.description}`.slice(0, 500)
    helpId = h.id
  }
  db.reports.push({
    id: newId(), reason, details: details.trim() || null, content_snapshot: snapshot, status: 'open', created_at: nowIso(),
    reported_public_id: reported, reported_user_id: null, message_id: messageId, help_request_id: helpId,
    reporter: { public_id: my.public_id, display_name: my.display_name },
  })
  save()
}

// ---------------------------------------------------------------- Modération : n'existe pas en mode local
export async function amIModerator(): Promise<boolean> { return false }
export async function listReports(_status: ReportStatus | ''): Promise<ReportRow[]> { return [] }
export async function setReportStatus(_id: string, _status: ReportStatus): Promise<void> { return fail('not_supported_local') }

// ---------------------------------------------------------------- Demandes d'aide
const withAuthor = (h: HelpRow): HelpRequest => {
  const a = db.people[h.author_id]?.profile
  return { ...h, author: a ? mini(a) : null }
}

const isRedAlert = (h: HelpRow): boolean => Boolean(h.urgent) && h.status !== 'resolved'

/** Alertes rouges encore actives (demandes urgentes non résolues), les plus récentes d'abord. */
export function listRedAlerts(exceptAuthor?: string): HelpRequest[] {
  return db.help.filter((h) => isRedAlert(h) && h.author_id !== exceptAuthor).sort((x, y) => y.created_at.localeCompare(x.created_at)).map(withAuthor)
}

export async function listHelp(o: { category?: string; status?: HelpStatus | ''; mine?: string; text?: string; limit: number; offset: number }): Promise<HelpRequest[]> {
  me()
  const text = (o.text ?? '').replace(/[^\p{L}\p{N} '-]/gu, ' ').trim().toLowerCase()
  return db.help
    .filter((h) => (!o.category || h.category === o.category) && (!o.status || h.status === o.status) && (!o.mine || h.author_id === o.mine))
    .filter((h) => !text || h.title.toLowerCase().includes(text) || h.description.toLowerCase().includes(text))
    .sort((x, y) => Number(isRedAlert(y)) - Number(isRedAlert(x)) || y.created_at.localeCompare(x.created_at))
    .slice(o.offset, o.offset + o.limit)
    .map(withAuthor)
}

export async function getHelp(id: string): Promise<HelpRequest | null> {
  me()
  const h = db.help.find((x) => x.id === id)
  return h ? withAuthor(h) : null
}

export async function createHelp(uid: string, p: { title: string; description: string; category: string; file?: OutgoingFile | null; urgent?: boolean }): Promise<string> {
  const my = me()
  if (my.profile.id !== uid) fail('not_authenticated')
  if (!rulesOk(my)) fail('rules_required')
  const title = p.title.trim()
  const description = p.description.trim()
  if (title.length < 3 || title.length > 120 || description.length < 5 || description.length > 3000 || !CATEGORIES.some((c) => c.id === p.category)) fail('23514')
  // Anti-abus : une seule alerte rouge active à la fois par profil.
  if (p.urgent && db.help.some((h) => h.author_id === uid && isRedAlert(h))) fail('alert_limit')
  let imagePath: string | null = null
  if (p.file) {
    await recheck(p.file)
    if (p.file.type.kind === 'video') fail('file_type_not_allowed')
    imagePath = `${uid}/${newId()}.${p.file.type.ext}`
    await putMedia('help-images', imagePath, p.file.blob)
  }
  const row: HelpRow = { id: newId(), author_id: uid, title, description, category: p.category, status: 'open', image_path: imagePath, urgent: p.urgent ? true : undefined, created_at: nextTs() }
  db.help.push(row)
  try {
    save()
  } catch (e) {
    db.help.pop()
    if (imagePath) await delMedia('help-images', [imagePath])
    throw e
  }
  helpListeners.forEach((cb) => cb({ id: row.id, author_id: uid, title }))
  return row.id
}

export async function updateHelpStatus(id: string, status: HelpStatus): Promise<void> {
  const my = me().profile.id
  const h = db.help.find((x) => x.id === id && x.author_id === my) ?? fail('target_not_found')
  h.status = status
  save()
}

export async function deleteHelp(h: HelpRequest): Promise<void> {
  const my = me().profile.id
  const i = db.help.findIndex((x) => x.id === h.id && x.author_id === my)
  if (i < 0) fail('target_not_found')
  const [gone] = db.help.splice(i, 1)
  save()
  if (gone.image_path) await delMedia('help-images', [gone.image_path])
}

// ---------------------------------------------------------------- Temps réel (entre onglets du même navigateur)
export function subscribeMessages(cb: (m: IncomingMessage) => void): () => void {
  msgListeners.add(cb)
  return () => void msgListeners.delete(cb)
}
export function subscribeHelp(cb: (h: { id: string; author_id: string; title: string }) => void): () => void {
  helpListeners.add(cb)
  return () => void helpListeners.delete(cb)
}

// ---------------------------------------------------------------- Export et suppression
export async function exportMyData(uid: string): Promise<Record<string, unknown>> {
  const p = db.people[uid] ?? fail('target_not_found')
  return {
    exported_at: nowIso(),
    note: 'Export de vos données locales. Elles n’existent que dans ce navigateur. Les fichiers joints sont listés par nom (pas inclus).',
    profile: { ...p.profile, avatar_path: p.profile.avatar_path ? '(image enregistrée dans le profil)' : null },
    settings: p.settings,
    help_requests: db.help.filter((h) => h.author_id === uid).map((h) => ({ id: h.id, title: h.title, description: h.description, category: h.category, status: h.status, created_at: h.created_at })),
    messages_sent: db.messages.filter((m) => m.sender_id === uid).map((m) => ({
      id: m.id, conversation_id: m.conversation_id, content: m.content, created_at: m.created_at,
      message_attachments: m.message_attachments.map((a) => ({ file_name: a.file_name, mime_type: a.mime_type, file_size: a.file_size })),
    })),
    blocked_users: db.blocks.filter((b) => b.blocker_id === uid).map((b) => ({ public_id: db.people[b.blocked_id]?.profile.public_id ?? null, blocked_at: b.created_at })),
  }
}

/** Supprime le profil ET tout ce qui lui est lié (conversations, messages, fichiers, demandes d'aide). */
export async function deleteAccount(uid: string): Promise<void> {
  if (!db.people[uid]) fail('target_not_found')
  const goneConvs = new Set(db.convs.filter((c) => memberOf(c, uid)).map((c) => c.id))
  const chatPaths = db.messages.filter((m) => goneConvs.has(m.conversation_id)).flatMap((m) => m.message_attachments.map((a) => a.storage_path))
  const helpPaths = db.help.filter((h) => h.author_id === uid && h.image_path).map((h) => h.image_path as string)
  db.messages = db.messages.filter((m) => !goneConvs.has(m.conversation_id))
  db.convs = db.convs.filter((c) => !goneConvs.has(c.id))
  db.help = db.help.filter((h) => h.author_id !== uid)
  db.blocks = db.blocks.filter((b) => b.blocker_id !== uid && b.blocked_id !== uid)
  db.requests = db.requests.filter((r) => r.from !== uid && r.to !== uid)
  db.netreq = db.netreq.filter((x) => x.local !== uid && x.person !== uid)
  db.outbox = db.outbox.filter((o) => o.profile !== uid)
  delete db.cursor[uid]
  db.reports = db.reports.filter((r) => r.reporter?.public_id !== db.people[uid].profile.public_id)
  if (!db.people[uid].remote) db.retired.push(db.people[uid].n)
  delete db.people[uid]
  if (db.last === uid) db.last = null
  save()
  await delMedia('chat-media', chatPaths)
  await delMedia('help-images', helpPaths)
  urlCache.clear()
  if (activeId === uid) {
    setActive(null)
    emitAuth()
  }
}

export async function getConversationPeer(conversationId: string, my: string): Promise<Profile | null> {
  const c = db.convs.find((x) => x.id === conversationId)
  if (!c || !memberOf(c, my)) return null
  return db.people[c.a === my ? c.b : c.a]?.profile ?? null
}

// ================================================================ Échange entre appareils SANS serveur
// Un navigateur ne peut pas voir un autre appareil sans service en ligne. On échange donc à la main :
//  1) un « code de partage » (profil) pour pouvoir se retrouver par nom ou numéro ;
//  2) un fichier de messages (texte, liens, images, vidéos) à envoyer par WhatsApp, e-mail, clé USB…
// Tout ce qui est importé est revalidé (formats, tailles, signature réelle des fichiers) et jamais interprété comme du code.

const SAFE_ID = /^[\w-]{8,64}$/
const PUBLIC_ID = /^User#(\d{1,6})$/
const stripCtl = (s: string) => s.replace(/[\u0000-\u001f\u007f<>]/g, '').trim()

interface Card { id: string; public_id: string; display_name: string | null }

const toB64Url = (s: string): string => {
  const bytes = new TextEncoder().encode(s)
  let bin = ''
  bytes.forEach((b) => (bin += String.fromCharCode(b)))
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}
const fromB64Url = (s: string): string => {
  const b = atob(s.replace(/-/g, '+').replace(/_/g, '/'))
  return new TextDecoder().decode(Uint8Array.from(b, (c) => c.charCodeAt(0)))
}

function parseCard(raw: unknown): Card {
  const c = raw as Partial<Card> | null
  if (!c || typeof c.id !== 'string' || !SAFE_ID.test(c.id) || typeof c.public_id !== 'string' || !PUBLIC_ID.test(c.public_id)) fail('bad_code')
  const name = typeof c!.display_name === 'string' ? stripCtl(c!.display_name).slice(0, 40) : ''
  return { id: c!.id as string, public_id: c!.public_id as string, display_name: name || null }
}

/** Ajoute ou met à jour une personne d'un autre appareil. Refuse de remplacer un profil de CET appareil. */
function upsertRemote(card: Card, bio = 'Contact ajouté par code (autre appareil)', pend = false): Person {
  const existing = db.people[card.id]
  if (existing && !existing.remote) fail('already_local')
  const n = Number(PUBLIC_ID.exec(card.public_id)?.[1] ?? 0)
  const profile: Profile = { id: card.id, public_id: card.public_id, display_name: card.display_name, avatar_path: null, bio, created_at: existing?.profile.created_at ?? nowIso() }
  const person: Person = { n, profile, settings: { ...defaultSettings(), rules_version: RULES_VERSION, rules_accepted_at: nowIso() }, remote: true }
  if (pend) person.pend = true
  if (existing?.pk) person.pk = existing.pk
  db.people[card.id] = person
  return person
}

/** Code à donner à quelqu'un pour qu'il puisse vous retrouver (ne contient ni e-mail, ni mot de passe, ni message). */
export function makeShareCode(): string {
  const p = me().profile
  return 'CDP1.' + toB64Url(JSON.stringify({ id: p.id, public_id: p.public_id, display_name: p.display_name }))
}

export function importShareCode(code: string): Profile {
  me()
  const t = (code ?? '').trim()
  if (!t.startsWith('CDP1.') || t.length > 2000) fail('bad_code')
  let card: Card
  try {
    card = parseCard(JSON.parse(fromB64Url(t.slice(5))))
  } catch (e) {
    if ((e as Error).message === 'already_local') throw e
    return fail('bad_code')
  }
  if (card.id === activeId) fail('already_local')
  const person = upsertRemote(card)
  save()
  return person.profile
}

export function listContacts(): Profile[] {
  return Object.values(db.people).filter((p) => p.remote && !p.pend).sort((a, b) => a.n - b.n).map((p) => p.profile)
}

const messagePackage = (from: Profile, to: string) => ({ cdp: 'messages', v: 1, from: { id: from.id, public_id: from.public_id, display_name: from.display_name }, to })

/** Fichier (texte JSON) contenant MES messages à cette personne, médias compris. L'envoi du fichier se fait à la main. */
export async function exportMessagesFor(contactId: string): Promise<{ text: string; count: number }> {
  const my = me().profile
  if (!db.people[contactId]?.remote) fail('target_not_found')
  const conv = db.convs.find((c) => memberOf(c, my.id) && memberOf(c, contactId))
  const mine = conv ? db.messages.filter((m) => m.conversation_id === conv.id && m.sender_id === my.id).sort((a, b) => a.created_at.localeCompare(b.created_at)) : []
  if (!mine.length) fail('nothing_to_export')
  const messages = []
  for (const m of mine) {
    const attachments = []
    for (const a of m.message_attachments) {
      const blob = await getMedia('chat-media', a.storage_path)
      if (!blob) continue
      attachments.push({ file_name: a.file_name, data: await toDataUrl(blob) })
    }
    messages.push({ id: m.id, content: m.content, created_at: m.created_at, attachments })
  }
  return { text: JSON.stringify({ ...messagePackage(my, contactId), messages }), count: messages.length }
}

function dataUrlToBlob(u: unknown): Blob {
  if (typeof u !== 'string') return fail('bad_package')
  const i = u.indexOf(';base64,')
  if (!u.startsWith('data:') || i < 0) return fail('bad_package')
  let bin: string
  try {
    bin = atob(u.slice(i + 8))
  } catch {
    return fail('bad_package')
  }
  const bytes = new Uint8Array(bin.length)
  for (let k = 0; k < bin.length; k++) bytes[k] = bin.charCodeAt(k)
  return new Blob([bytes])
}

/** Importe un fichier de messages reçu. Retourne le nombre de NOUVEAUX messages (les doublons sont ignorés). */
export async function importMessages(text: string): Promise<{ added: number; skipped: number; from: Profile }> {
  const my = me()
  let pkg: { cdp?: string; v?: number; from?: unknown; to?: unknown; messages?: unknown }
  try {
    pkg = JSON.parse(text)
  } catch {
    return fail('bad_package')
  }
  if (!pkg || pkg.cdp !== 'messages' || pkg.v !== 1 || !Array.isArray(pkg.messages) || pkg.messages.length > 5000) fail('bad_package')
  if (pkg.to !== my.profile.id) fail('wrong_recipient')
  const card = parseCard(pkg.from)
  if (card.id === my.profile.id) fail('already_local')
  const sender = upsertRemote(card)
  let conv = db.convs.find((c) => memberOf(c, my.profile.id) && memberOf(c, card.id))
  if (!conv) {
    conv = { id: newId(), a: my.profile.id, b: card.id, created_at: nowIso(), archived: {}, read_at: {} }
    db.convs.push(conv)
  }
  conv.archived[my.profile.id] = false
  const known = new Set(db.messages.map((m) => m.id))
  const added: Message[] = []
  const stored: string[] = []
  let skipped = 0
  try {
    for (const raw of pkg.messages as { id?: unknown; content?: unknown; created_at?: unknown; attachments?: unknown }[]) {
      if (!raw || typeof raw.id !== 'string' || !SAFE_ID.test(raw.id) || typeof raw.content !== 'string' || typeof raw.created_at !== 'string') {
        skipped++
        continue
      }
      if (known.has(raw.id)) {
        skipped++
        continue
      }
      const when = new Date(raw.created_at)
      const content = raw.content.slice(0, LIMITS.messageChars).trim()
      const atts = Array.isArray(raw.attachments) ? (raw.attachments as { file_name?: unknown; data?: unknown }[]).slice(0, 3) : []
      const message_attachments: Message['message_attachments'] = []
      for (const a of atts) {
        const blob = dataUrlToBlob(a?.data)
        const real = sniffType(new Uint8Array(await blob.slice(0, 64).arrayBuffer()))
        if (!real) fail('file_type_not_allowed')
        checkFileSize(real, blob.size)
        const path = `${conv.id}/${newId()}.${real.ext}`
        await putMedia('chat-media', path, new Blob([blob], { type: real.mime }))
        stored.push(path)
        message_attachments.push({ id: newId(), storage_path: path, file_name: cleanName(typeof a.file_name === 'string' ? a.file_name : 'fichier'), mime_type: real.mime, file_size: blob.size })
      }
      if (!content && !message_attachments.length) {
        skipped++
        continue
      }
      const m: Message = { id: raw.id, conversation_id: conv.id, sender_id: card.id, content, created_at: Number.isNaN(when.getTime()) ? nowIso() : when.toISOString(), message_attachments }
      known.add(m.id)
      added.push(m)
    }
    db.messages.push(...added)
    save()
  } catch (e) {
    await delMedia('chat-media', stored)
    throw e
  }
  added.forEach(emitMessage)
  return { added: added.length, skipped, from: sender.profile }
}

// ================================================================ Demandes d'ajout (accepter / refuser)
export type ContactStatus = 'self' | 'none' | 'pending_out' | 'pending_in' | 'accepted' | 'refused'
const REFUSAL_COOLDOWN_MS = 24 * 3600 * 1000

function latestRequest(a: string, b: string): ContactReq | undefined {
  return db.requests.filter((r) => (r.from === a && r.to === b) || (r.from === b && r.to === a)).sort((x, y) => y.created_at.localeCompare(x.created_at))[0]
}

/** Où en est la relation entre moi et cette personne (sert à choisir le bouton à afficher). */
export function contactStatus(otherId: string): ContactStatus {
  const my = me().profile.id
  if (otherId === my) return 'self'
  const other = db.people[otherId]
  if (!other) return 'none'
  if ((other.remote && !other.pend) || db.convs.some((c) => memberOf(c, my) && memberOf(c, otherId))) return 'accepted'
  const r = latestRequest(my, otherId)
  if (!r) return 'none'
  if (r.status === 'pending') return r.from === my ? 'pending_out' : 'pending_in'
  if (r.status === 'accepted') return 'accepted'
  return r.from === my && Date.now() - new Date(r.responded_at ?? r.created_at).getTime() < REFUSAL_COOLDOWN_MS ? 'refused' : 'none'
}

function ensureConversation(a: string, b: string): Conv {
  let c = db.convs.find((x) => memberOf(x, a) && memberOf(x, b))
  if (!c) {
    c = { id: newId(), a, b, created_at: nowIso(), archived: {}, read_at: {} }
    db.convs.push(c)
  }
  return c
}

/** Envoie une demande d'ajout. Si l'autre personne m'en avait déjà envoyé une, elle est acceptée tout de suite. */
export function sendContactRequest(otherId: string): 'pending' | 'accepted' {
  const my = me()
  if (!rulesOk(my)) fail('rules_required')
  const other = db.people[otherId]
  if (!other || otherId === my.profile.id || !other.settings.allow_contact || isBlocked(my.profile.id, otherId)) fail('contact_unavailable')
  const st = contactStatus(otherId)
  if (st === 'accepted') return 'accepted'
  if (st === 'pending_out') return 'pending'
  if (st === 'refused') fail('request_refused_recently')
  if (st === 'pending_in') {
    const r = db.requests.find((x) => x.from === otherId && x.to === my.profile.id && x.status === 'pending') as ContactReq
    respondContactRequest(r.id, true)
    return 'accepted'
  }
  if (db.requests.filter((r) => r.from === my.profile.id && r.status === 'pending').length >= 20) fail('rate_limited')
  db.requests.push({ id: newId(), from: my.profile.id, to: otherId, status: 'pending', created_at: nowIso(), responded_at: null })
  save()
  return 'pending'
}

/** Seule la personne qui reçoit la demande peut l'accepter ou la refuser. */
export function respondContactRequest(id: string, accept: boolean): void {
  const my = me().profile.id
  const r = db.requests.find((x) => x.id === id && x.to === my && x.status === 'pending') ?? fail('target_not_found')
  r.status = accept ? 'accepted' : 'refused'
  r.responded_at = nowIso()
  const conv = accept ? ensureConversation(r.from, r.to) : null
  const person = db.people[r.from]
  if (r.net && person) {
    const other = { id: r.from, public_id: person.profile.public_id }
    // Demande reçue EN LIGNE : on répond par le relais (acceptation avec ma clé publique, ou refus).
    if (accept) {
      person.pend = false
      person.pk = r.net.pk
      person.profile.bio = 'Contact ajouté en ligne'
    } else if (person.pend) {
      delete db.people[r.from] // refusée et inconnue : on ne garde rien
    }
    save()
    const task = netRespond(my, accept, r.net.mid, r.net.pk, other).catch(() => undefined)
    if (conv) chPending.set(conv.id, task.finally(() => void chPending.delete(conv.id)))
    return
  }
  save()
}

export interface ContactNotices {
  incoming: { id: string; from: Profile; created_at: string }[]
  answers: { id: string; other: Profile; accepted: boolean }[]
  outgoing: { id: string; to: Profile; status: ContactReq['status']; created_at: string }[]
}

/** Tout ce que le profil actif doit voir : demandes reçues en attente, réponses non lues, demandes envoyées. */
export function contactNotices(): ContactNotices {
  const my = activeId
  if (!my || !db.people[my]) return { incoming: [], answers: [], outgoing: [] }
  const prof = (id: string) => db.people[id]?.profile
  const incoming = db.requests.filter((r) => r.to === my && r.status === 'pending' && prof(r.from)).sort((a, b) => b.created_at.localeCompare(a.created_at)).map((r) => ({ id: r.id, from: prof(r.from) as Profile, created_at: r.created_at }))
  const netOf = (x: NetReq): Profile => (x.person && prof(x.person)) || { id: `net-${x.id}`, public_id: x.to_public_id, display_name: x.label ?? null, avatar_path: null, bio: null, created_at: x.created_at }
  const mine = db.netreq.filter((x) => x.local === my)
  const answers = [
    ...db.requests.filter((r) => r.from === my && r.status !== 'pending' && !r.seen_by_from && prof(r.to)).map((r) => ({ id: r.id, other: prof(r.to) as Profile, accepted: r.status === 'accepted' })),
    ...mine.filter((x) => x.status !== 'pending' && !x.seen_by_from).map((x) => ({ id: x.id, other: netOf(x), accepted: x.status === 'accepted' })),
  ]
  const outgoing = [
    ...db.requests.filter((r) => r.from === my && prof(r.to)).map((r) => ({ id: r.id, to: prof(r.to) as Profile, status: r.status, created_at: r.created_at })),
    ...mine.map((x) => ({ id: x.id, to: netOf(x), status: x.status, created_at: x.created_at })),
  ].sort((a, b) => b.created_at.localeCompare(a.created_at))
  return { incoming, answers, outgoing }
}

export function markAnswerSeen(id: string): void {
  const r = db.requests.find((x) => x.id === id && x.from === activeId) ?? db.netreq.find((x) => x.id === id && x.local === activeId)
  if (r) {
    r.seen_by_from = true
    save()
  }
}

// ================================================================ Mode EN LIGNE (relais public) — voir online.ts
// Désactivé au départ. Rien ne sort de l'appareil tant que l'interrupteur « En ligne » n'est pas activé pour le profil.
//  - demande d'ajout par numéro : publiée dans la boîte (publique) du numéro visé ;
//  - acceptation : les deux appareils calculent un secret commun → sujet + clé de conversation ;
//  - messages TEXTE : chiffrés (AES-GCM) puis publiés sur le sujet de la conversation. Images/vidéos : fichier d'échange.

interface NetMsg { cdp?: unknown; t?: unknown; mid?: unknown; to?: unknown; from?: unknown; pk?: unknown; re?: unknown; iv?: unknown; ct?: unknown }

let relayStatus: RelayStatus = 'off'
let stopSub: (() => void) | null = null
let subKey = ''
let syncSeq = 0
let subSeq = 0
let chain: Promise<void> = Promise.resolve()
const chPending = new Map<string, Promise<unknown>>()
const onlineListeners = new Set<() => void>()
const emitOnline = () => onlineListeners.forEach((cb) => cb())

export function subscribeOnlineStatus(cb: () => void): () => void {
  onlineListeners.add(cb)
  return () => void onlineListeners.delete(cb)
}

export function getRelay(): string {
  return (db.relay && normalizeRelay(db.relay)) || DEFAULT_RELAY
}

/** Change le relais (adresse https). Vide = relais par défaut. */
export function setRelay(url: string): void {
  const t = (url ?? '').trim()
  const clean = t ? normalizeRelay(t) : DEFAULT_RELAY
  if (!clean) fail('bad_relay')
  db.relay = clean === DEFAULT_RELAY ? null : clean
  save()
  void syncOnline()
}

export interface OnlineInfo { enabled: boolean; status: RelayStatus; relay: string; custom: boolean; queued: number }

export function getOnline(): OnlineInfo {
  const p = activeId ? db.people[activeId] : undefined
  const enabled = Boolean(p?.online)
  return { enabled, status: enabled ? relayStatus : 'off', relay: getRelay(), custom: getRelay() !== DEFAULT_RELAY, queued: db.outbox.filter((o) => o.profile === activeId).length }
}

/** Active ou coupe le mode en ligne du profil actif. Activer crée les clés de chiffrement du profil (une seule fois). */
export async function setOnline(enabled: boolean): Promise<void> {
  const id = me().profile.id
  if (enabled && !rulesOk(db.people[id])) fail('rules_required')
  const keys = enabled && !db.people[id].keys ? await genKeyPair() : null
  const p = db.people[id] ?? fail('not_authenticated')
  p.online = enabled
  if (keys && !p.keys) p.keys = keys
  save()
  await syncOnline()
  if (enabled) void flushOutbox()
}

function stopOnlineNow(): void {
  stopSub?.()
  stopSub = null
  subKey = ''
  relayStatus = 'off'
  emitOnline()
}

async function wantedTopics(profileId: string): Promise<string[]> {
  const topics = [await mailboxTopic(db.people[profileId].profile.public_id)]
  for (const c of db.convs) if (memberOf(c, profileId) && c.ch) topics.push(c.ch.topic)
  return [...new Set(topics)]
}

/** Ouvre (ou ferme, ou met à jour) la connexion au relais selon le profil actif, l'interrupteur, le relais et les conversations. */
async function syncOnline(): Promise<void> {
  const seq = ++syncSeq
  const id = activeId
  const p = id ? db.people[id] : undefined
  if (!id || !p || p.remote || !p.online) {
    if (stopSub || relayStatus !== 'off') stopOnlineNow()
    return
  }
  const topics = await wantedTopics(id)
  if (seq !== syncSeq) return
  const relay = getRelay()
  const key = [id, relay, ...topics].join('|')
  if (key === subKey && stopSub) return
  stopSub?.()
  subKey = key
  relayStatus = 'connecting'
  emitOnline()
  const mine = ++subSeq
  const cursor = db.cursor[id]
  stopSub = subscribe({
    relay,
    topics,
    since: cursor ? Math.max(0, cursor - 30) : 'all',
    onStatus: (s) => {
      if (mine !== subSeq) return
      relayStatus = s
      emitOnline()
      if (s === 'online') void flushOutbox()
    },
    onEvent: (ev) => {
      if (mine !== subSeq) return
      chain = chain.then(() => handleRelayEvent(id, ev)).catch(() => undefined)
    },
  })
}

/** Un autre onglet a peut-être écrit : on repart de ce qui est enregistré. */
function syncFromStorage(): void {
  const raw = read()
  if (raw && raw !== memoryCopy) db = load()
}

function setNet(msgId: string, state: NonNullable<Message['net']>): void {
  const m = db.messages.find((x) => x.id === msgId)
  if (m && m.net !== state) {
    m.net = state
    save()
  }
}

/** Publie tout de suite ; si le relais est injoignable, met en file d'attente (la personne voit « en attente »). */
async function post(profileId: string, topic: string, body: string, msgId?: string): Promise<void> {
  if (db.people[profileId]?.online) {
    try {
      await publish(getRelay(), topic, body)
      if (msgId) setNet(msgId, 'sent')
      return
    } catch (e) {
      if ((e as Error).message === 'online_too_long') {
        if (msgId) setNet(msgId, 'failed')
        throw e
      }
    }
  }
  db.outbox.push({ id: newId(), profile: profileId, topic, body, msg: msgId })
  if (msgId) setNet(msgId, 'queued')
  else save()
}

let flushing = false
async function flushOutbox(): Promise<void> {
  const id = activeId
  if (flushing || !id || !db.people[id]?.online) return
  flushing = true
  try {
    for (const item of db.outbox.filter((o) => o.profile === id)) {
      try {
        await publish(getRelay(), item.topic, item.body)
      } catch (e) {
        if ((e as Error).message !== 'online_too_long') break
        if (item.msg) setNet(item.msg, 'failed')
      }
      db.outbox = db.outbox.filter((o) => o.id !== item.id)
      if (item.msg) setNet(item.msg, 'sent')
      else save()
    }
  } finally {
    flushing = false
  }
}

async function netSend(profileId: string, convId: string, msgId: string): Promise<void> {
  const c = db.convs.find((x) => x.id === convId)
  const m = db.messages.find((x) => x.id === msgId)
  if (!c?.ch || !m) return
  try {
    const { iv, ct } = await encryptText(c.ch.key, c.ch.topic, JSON.stringify({ id: m.id, c: m.content, s: profileId }))
    await post(profileId, c.ch.topic, JSON.stringify({ cdp: 1, t: 'msg', mid: m.id, iv, ct }), m.id)
  } catch {
    setNet(msgId, 'failed')
  }
}

async function netEdit(profileId: string, convId: string, msgId: string): Promise<void> {
  const c = db.convs.find((x) => x.id === convId)
  const m = db.messages.find((x) => x.id === msgId)
  if (!c?.ch || !m) return
  try {
    const { iv, ct } = await encryptText(c.ch.key, c.ch.topic, JSON.stringify({ id: m.id, c: m.content, s: profileId, e: m.edited_at }))
    await post(profileId, c.ch.topic, JSON.stringify({ cdp: 1, t: 'edit', mid: newId(), iv, ct }))
  } catch { /* hors ligne : mis en file d'attente par post(), sinon la modification reste locale */ }
}

async function netDelete(profileId: string, convId: string, msgId: string): Promise<void> {
  const c = db.convs.find((x) => x.id === convId)
  if (!c?.ch) return
  try {
    const { iv, ct } = await encryptText(c.ch.key, c.ch.topic, JSON.stringify({ id: msgId, s: profileId }))
    await post(profileId, c.ch.topic, JSON.stringify({ cdp: 1, t: 'del', mid: newId(), iv, ct }))
  } catch { /* idem */ }
}

async function netRespond(profileId: string, accept: boolean, mid: string, pk: JsonWebKey, other: { id: string; public_id: string }): Promise<void> {
  const mine = db.people[profileId]
  if (!mine) return
  const topic = await mailboxTopic(other.public_id)
  const from = { id: profileId, public_id: mine.profile.public_id, display_name: mine.profile.display_name }
  if (!accept) {
    await post(profileId, topic, JSON.stringify({ cdp: 1, t: 'ref', mid: newId(), re: mid, to: other.public_id, from }))
    return
  }
  const keys = mine.keys ?? (await genKeyPair())
  const ch = await deriveChannel(keys.priv, pk, profileId, other.id)
  const p = db.people[profileId]
  if (p && !p.keys) p.keys = keys
  const conv = ensureConversation(profileId, other.id)
  conv.ch = ch
  save()
  await syncOnline()
  await post(profileId, topic, JSON.stringify({ cdp: 1, t: 'acc', mid: newId(), re: mid, to: other.public_id, from, pk: keys.pub }))
  releaseLocalMessages(profileId, conv.id)
}

/** Le lien en ligne vient d'être créé : les textes écrits avant (restés « sur cet appareil ») partent maintenant, dans l'ordre. */
function releaseLocalMessages(profileId: string, convId: string): void {
  const c = db.convs.find((x) => x.id === convId)
  if (!c?.ch) return
  const list = db.messages
    .filter((m) => m.conversation_id === convId && m.sender_id === profileId && (m.net === 'local' || m.net === undefined))
    .sort((a, b) => a.created_at.localeCompare(b.created_at))
  if (!list.length) return
  for (const m of list) m.net = m.message_attachments.length ? 'file' : 'queued'
  save()
  const texts = list.filter((m) => m.net === 'queued').slice(-30)
  for (const m of list) if (m.net === 'queued' && !texts.includes(m)) m.net = 'local'
  void (async () => {
    for (const m of texts) await netSend(profileId, convId, m.id)
  })()
}

/** « User#42 », « 42 », « #0042 »… → « User#0042 » (ou null si ça n'y ressemble pas). */
export function onlineTarget(query: string): string | null {
  const m = /^\s*(?:user)?\s*#?\s*(\d{1,6})\s*$/i.exec(query ?? '')
  return m ? publicIdOf(Number(m[1])) : null
}

/** Envoie une demande d'ajout EN LIGNE à un numéro. Échoue clairement si le relais est injoignable (pas de demande « fantôme »). */
export async function sendOnlineRequest(query: string, label = ''): Promise<void> {
  const my = me()
  const pid = onlineTarget(query) ?? fail('bad_target')
  if (!rulesOk(my)) fail('rules_required')
  if (!my.online) fail('online_off')
  if (pid === my.profile.public_id) fail('contact_unavailable')
  if (Object.values(db.people).some((p) => !p.remote && p.profile.public_id === pid)) fail('already_local')
  const id = my.profile.id
  // Déjà en ligne avec cette personne : rien à demander. Un contact ajouté seulement par code (fichier) peut, lui, passer en ligne.
  const known = Object.values(db.people).find((p) => p.remote && !p.pend && p.profile.public_id === pid && db.convs.some((c) => memberOf(c, id) && memberOf(c, p.profile.id) && c.ch))
  if (known) fail('already_contact')
  const mineReqs = db.netreq.filter((x) => x.local === id && x.to_public_id === pid)
  const waiting = mineReqs.find((x) => x.status === 'pending')
  if (mineReqs.some((x) => x.status === 'refused' && Date.now() - new Date(x.responded_at ?? x.created_at).getTime() < REFUSAL_COOLDOWN_MS)) fail('request_refused_recently')
  if (!waiting && db.netreq.filter((x) => x.local === id && x.status === 'pending').length >= 20) fail('rate_limited')
  const keys = my.keys ?? (await genKeyPair())
  const p = db.people[id] ?? fail('not_authenticated')
  if (!p.keys) p.keys = keys
  // Demande déjà en attente : on la RENVOIE telle quelle (même identifiant, donc sans doublon chez l'autre) au cas où le relais l'aurait perdue.
  const nick = stripCtl(label).slice(0, 40)
  const nr: NetReq = waiting ?? { id: newId(), local: id, to_public_id: pid, created_at: nowIso(), status: 'pending', responded_at: null, ...(nick ? { label: nick } : {}) }
  if (waiting && nick && !waiting.label) waiting.label = nick
  const body = JSON.stringify({ cdp: 1, t: 'req', mid: nr.id, to: pid, from: { id, public_id: p.profile.public_id, display_name: p.profile.display_name }, pk: p.keys?.pub, ts: nr.created_at })
  await publish(getRelay(), await mailboxTopic(pid), body)
  if (!waiting) {
    db.netreq.push(nr)
    save()
  }
}

/** Où en est ma demande en ligne vers ce numéro (pour l'afficher dans la conversation). */
export function onlineRequestState(publicId: string): 'none' | 'pending' | 'refused' {
  const mine = db.netreq.filter((x) => x.local === activeId && x.to_public_id === publicId).sort((a, b) => b.created_at.localeCompare(a.created_at))[0]
  if (!mine) return 'none'
  if (mine.status === 'pending') return 'pending'
  return mine.status === 'refused' && Date.now() - new Date(mine.responded_at ?? mine.created_at).getTime() < REFUSAL_COOLDOWN_MS ? 'refused' : 'none'
}

// ---- Réception
async function handleRelayEvent(profileId: string, ev: RelayEvent): Promise<void> {
  syncFromStorage()
  const mine = db.people[profileId]
  if (!mine || !mine.online || activeId !== profileId) return
  let m: NetMsg
  try {
    m = JSON.parse(ev.message) as NetMsg
  } catch {
    return
  }
  if (!m || typeof m !== 'object' || m.cdp !== 1 || typeof m.t !== 'string' || typeof m.mid !== 'string' || !SAFE_ID.test(m.mid)) return
  const mid = m.mid
  if (m.t === 'typ') {
    await onNetTyping(profileId, ev.topic, m, ev.time) // éphémère : ni curseur, ni liste « déjà vus »
    return
  }
  let moved = (db.cursor[profileId] ?? 0) < ev.time
  if (moved) db.cursor[profileId] = ev.time
  if (!db.seenNet.includes(mid)) {
    const mailbox = await mailboxTopic(mine.profile.public_id)
    let done = false
    if (ev.topic === mailbox) {
      if (m.t === 'req') done = onNetRequest(profileId, m, mid)
      else if (m.t === 'acc') done = await onNetAccept(profileId, m)
      else if (m.t === 'ref') done = onNetRefuse(profileId, m)
    } else if (m.t === 'msg') {
      done = await onNetMessage(profileId, ev.topic, m)
    } else if (m.t === 'edit') {
      done = await onNetEdit(profileId, ev.topic, m)
    } else if (m.t === 'del') {
      done = await onNetDelete(profileId, ev.topic, m)
    }
    if (done) {
      db.seenNet.push(mid)
      if (db.seenNet.length > 800) db.seenNet.splice(0, db.seenNet.length - 800)
      moved = true
    }
  }
  if (moved) save()
}

function onNetRequest(profileId: string, m: NetMsg, mid: string): boolean {
  const my = db.people[profileId]
  if (m.to !== my.profile.public_id) return false
  let card: Card
  try {
    card = parseCard(m.from)
  } catch {
    return false
  }
  const pk = cleanPublicKey(m.pk)
  if (!pk || card.id === profileId) return false
  const known = db.people[card.id]
  if (known && !known.remote) return false // un profil de CET appareil : pas de demande en ligne
  if (isBlocked(profileId, card.id)) return false
  const waiting = db.requests.filter((r) => r.to === profileId && r.status === 'pending' && r.net)
  if (waiting.length >= 30 || waiting.some((r) => r.from === card.id)) return false
  if (!known) upsertRemote(card, 'Demande reçue en ligne', true)
  db.requests.push({ id: newId(), from: card.id, to: profileId, status: 'pending', created_at: nowIso(), responded_at: null, net: { mid, pk } })
  return true
}

async function onNetAccept(profileId: string, m: NetMsg): Promise<boolean> {
  const nr = db.netreq.find((x) => x.id === m.re && x.local === profileId && x.status === 'pending')
  const keys = db.people[profileId]?.keys
  if (!nr || !keys) return false
  let card: Card
  try {
    card = parseCard(m.from)
  } catch {
    return false
  }
  const pk = cleanPublicKey(m.pk)
  if (!pk || card.public_id !== nr.to_public_id || card.id === profileId) return false
  const known = db.people[card.id]
  if (known && !known.remote) return false
  let ch: Channel
  try {
    ch = await deriveChannel(keys.priv, pk, profileId, card.id)
  } catch {
    return false
  }
  syncFromStorage()
  const again = db.netreq.find((x) => x.id === nr.id && x.status === 'pending')
  if (!again) return false
  const person = upsertRemote(card, 'Contact ajouté en ligne')
  person.pk = pk
  const conv = ensureConversation(profileId, card.id)
  conv.ch = ch
  again.status = 'accepted'
  again.responded_at = nowIso()
  again.person = card.id
  save()
  void syncOnline().then(() => releaseLocalMessages(profileId, conv.id))
  return true
}

function onNetRefuse(profileId: string, m: NetMsg): boolean {
  const nr = db.netreq.find((x) => x.id === m.re && x.local === profileId && x.status === 'pending')
  const from = m.from as { public_id?: unknown } | null
  if (!nr || !from || from.public_id !== nr.to_public_id) return false
  nr.status = 'refused'
  nr.responded_at = nowIso()
  return true
}

async function onNetMessage(profileId: string, topic: string, m: NetMsg): Promise<boolean> {
  const conv = db.convs.find((c) => c.ch?.topic === topic && memberOf(c, profileId))
  if (!conv?.ch || typeof m.iv !== 'string' || typeof m.ct !== 'string') return false
  const otherId = conv.a === profileId ? conv.b : conv.a
  if (isBlocked(profileId, otherId) || !db.people[otherId]) return false
  let body: { id?: unknown; c?: unknown; s?: unknown }
  try {
    body = JSON.parse(await decryptText(conv.ch.key, conv.ch.topic, m.iv, m.ct))
  } catch {
    return false
  }
  syncFromStorage()
  if (!body || typeof body.id !== 'string' || !SAFE_ID.test(body.id) || body.id !== m.mid || body.s !== otherId || typeof body.c !== 'string') return false
  if (db.messages.some((x) => x.id === body.id)) return true
  const content = body.c.slice(0, LIMITS.messageChars).trim()
  if (!content) return false
  const live = db.convs.find((c) => c.id === conv.id)
  if (!live) return false
  live.archived[profileId] = false
  const msg: Message = { id: body.id, conversation_id: conv.id, sender_id: otherId, content, created_at: nextTs(), message_attachments: [] }
  db.messages.push(msg)
  save()
  emitMessage(msg)
  return true
}

/** Enveloppe chiffrée reçue sur le sujet d'une conversation : retrouve la conversation, le contact et le contenu (ou null). */
async function openEnvelope(profileId: string, topic: string, m: NetMsg): Promise<{ conv: Conv; otherId: string; body: Record<string, unknown> } | null> {
  const conv = db.convs.find((c) => c.ch?.topic === topic && memberOf(c, profileId))
  if (!conv?.ch || typeof m.iv !== 'string' || typeof m.ct !== 'string') return null
  const otherId = conv.a === profileId ? conv.b : conv.a
  if (isBlocked(profileId, otherId) || !db.people[otherId]) return null
  try {
    const body = JSON.parse(await decryptText(conv.ch.key, conv.ch.topic, m.iv, m.ct)) as Record<string, unknown>
    return body && typeof body === 'object' && body.s === otherId ? { conv, otherId, body } : null
  } catch {
    return null
  }
}

async function onNetTyping(profileId: string, topic: string, m: NetMsg, time: number): Promise<void> {
  if (Date.now() / 1000 - time > 15) return // vieux (rattrapage) : on ne montre pas « écrit… » pour du passé
  const o = await openEnvelope(profileId, topic, m)
  if (o) setTyping(o.conv.id)
}

async function onNetEdit(profileId: string, topic: string, m: NetMsg): Promise<boolean> {
  const o = await openEnvelope(profileId, topic, m)
  if (!o || typeof o.body.id !== 'string' || !SAFE_ID.test(o.body.id) || typeof o.body.c !== 'string') return false
  syncFromStorage()
  const msg = db.messages.find((x) => x.id === o.body.id && x.conversation_id === o.conv.id && x.sender_id === o.otherId)
  if (!msg) return false // le message d'origine n'est pas encore arrivé : on réessaiera au prochain rattrapage
  const e = typeof o.body.e === 'string' && !Number.isNaN(Date.parse(o.body.e)) ? new Date(o.body.e).toISOString() : nowIso()
  if (msg.edited_at && msg.edited_at >= e) return true // une version plus récente est déjà là
  const text = o.body.c.slice(0, LIMITS.messageChars).trim()
  if (!text) return false
  msg.content = text
  msg.edited_at = e
  save()
  emitChange({ kind: 'edit', id: msg.id, conversation_id: msg.conversation_id })
  return true
}

async function onNetDelete(profileId: string, topic: string, m: NetMsg): Promise<boolean> {
  const o = await openEnvelope(profileId, topic, m)
  if (!o || typeof o.body.id !== 'string' || !SAFE_ID.test(o.body.id)) return false
  syncFromStorage()
  const i = db.messages.findIndex((x) => x.id === o.body.id && x.conversation_id === o.conv.id && x.sender_id === o.otherId)
  if (i < 0) return true // déjà supprimé ou jamais reçu
  const [gone] = db.messages.splice(i, 1)
  save()
  await delMedia('chat-media', gone.message_attachments.map((a) => a.storage_path))
  emitChange({ kind: 'delete', id: gone.id, conversation_id: gone.conversation_id })
  return true
}

// ---- Informations pour l'interface
export interface ConversationLink { mode: 'local' | 'file' | 'online'; online: boolean; peerPublicId?: string }

/** Comment cette conversation circule : entre profils de cet appareil, par fichier, ou en ligne (chiffrée). */
export function conversationLink(conversationId: string): ConversationLink {
  const my = activeId
  const c = db.convs.find((x) => x.id === conversationId)
  if (!my || !c || !memberOf(c, my)) return { mode: 'local', online: false }
  const other = db.people[c.a === my ? c.b : c.a]
  if (!other?.remote) return { mode: 'local', online: false }
  return { mode: c.ch ? 'online' : 'file', online: Boolean(db.people[my]?.online), peerPublicId: other.profile.public_id }
}

/** Code à 8 chiffres identique chez les deux personnes : à comparer par un autre moyen pour être sûr de parler à la bonne. */
export async function conversationVerification(conversationId: string): Promise<string | null> {
  const c = db.convs.find((x) => x.id === conversationId)
  return c?.ch ? verificationCode(c.ch) : null
}

export function messageNet(id: string): Message['net'] | undefined {
  const m = db.messages.find((x) => x.id === id)
  if (!m) return undefined
  if (m.net) return m.net
  if (!activeId || m.sender_id !== activeId) return undefined
  const c = db.convs.find((x) => x.id === m.conversation_id)
  const other = c && db.people[c.a === activeId ? c.b : c.a]
  return other?.remote && !c?.ch ? 'local' : undefined // message écrit avant la mise à jour : lui aussi n'est jamais parti
}

if (typeof window !== 'undefined') {
  window.setInterval(() => {
    if (relayStatus === 'online') void flushOutbox()
  }, 20000)
  void syncOnline()
}
