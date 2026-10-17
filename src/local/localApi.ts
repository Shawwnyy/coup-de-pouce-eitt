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

// ---------------------------------------------------------------- Types internes
interface Person { n: number; profile: Profile; settings: Settings }
interface Conv { id: string; a: string; b: string; created_at: string; archived: Record<string, boolean>; read_at: Record<string, string> }
interface BlockRow { blocker_id: string; blocked_id: string; created_at: string }
interface HelpRow { id: string; author_id: string; title: string; description: string; category: string; status: HelpStatus; image_path: string | null; created_at: string }
interface Db {
  v: 1
  seq: number
  last: string | null
  people: Record<string, Person>
  convs: Conv[]
  messages: Message[]
  blocks: BlockRow[]
  reports: ReportRow[]
  help: HelpRow[]
}

export interface OutgoingFile { blob: File; type: Sniffed }
export interface IncomingMessage { id: string; conversation_id: string; sender_id: string; created_at: string }

const KEY = 'cdp.local.v1'
const ACTIVE_KEY = 'cdp.local.active'
const DB_NAME = 'cdp-local-media'

const fresh = (): Db => ({ v: 1, seq: 1, last: null, people: {}, convs: [], messages: [], blocks: [], reports: [], help: [] })
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
      return { ...fresh(), ...d, blocks: d.blocks ?? [], reports: d.reports ?? [], help: d.help ?? [] } as Db
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
  msgListeners.forEach((cb) => cb(evt))
}

// Autre onglet du même navigateur : on recharge les données et on signale les nouveaux messages.
if (typeof window !== 'undefined') {
  window.addEventListener('storage', (e) => {
    if (e.key !== KEY) return
    const known = new Set(db.messages.map((m) => m.id))
    db = load()
    if (activeId && !db.people[activeId]) {
      setActive(null)
      emitAuth()
    }
    db.messages.filter((m) => !known.has(m.id)).forEach(emitMessage)
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
    .map(([id, p]) => ({ id, n: p.n, profile: p.profile, rulesOk: p.settings.rules_version === RULES_VERSION }))
    .sort((a, b) => a.n - b.n)
}
export const nextPublicId = (): string => `User#${pad(db.seq)}`

/** Crée un profil local (User#000N), l'enregistre et l'active. Les numéros supprimés ne sont jamais réutilisés. */
export function createLocalProfile(p: { displayName: string; acceptRules: boolean }): Profile {
  const name = p.displayName.trim().slice(0, 40)
  const n = db.seq
  const id = newId()
  const profile: Profile = { id, public_id: `User#${pad(n)}`, display_name: name || null, avatar_path: null, bio: null, created_at: nowIso() }
  const settings = defaultSettings()
  if (p.acceptRules) {
    settings.rules_version = RULES_VERSION
    settings.rules_accepted_at = nowIso()
  }
  db.people[id] = { n, profile, settings }
  db.seq = n + 1
  db.last = id
  save()
  setActive(id)
  emitAuth()
  return profile
}

export function useLocalProfile(id: string): void {
  if (!db.people[id]) fail('target_not_found')
  db.last = id
  save()
  setActive(id)
  emitAuth()
}

export function wipeAllLocalData(): void {
  db = fresh()
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
export async function searchProfiles(query: string): Promise<SearchResult[]> {
  const my = me()
  const m = /^\s*(?:user)?\s*#?\s*(\d{1,9})\s*$/i.exec(query ?? '')
  if (!m) return []
  const num = Number(m[1])
  return Object.values(db.people)
    .filter((p) => p.n === num && (p.profile.id === my.profile.id || p.settings.searchable))
    .filter((p) => !db.blocks.some((b) => b.blocker_id === p.profile.id && b.blocked_id === my.profile.id))
    .map((p) => ({
      id: p.profile.id,
      public_id: p.profile.public_id,
      display_name: p.profile.display_name,
      avatar_path: p.profile.avatar_path,
      bio: p.profile.bio,
      can_contact: p.profile.id !== my.profile.id && p.settings.allow_contact && !isBlocked(my.profile.id, p.profile.id),
    }))
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
  db.messages.push(msg)
  try {
    save()
  } catch (e) {
    db.messages.pop()
    if (storedPath) await delMedia('chat-media', [storedPath])
    throw e
  }
  emitMessage(msg)
  return msg.id
}

export async function deleteMessage(m: Message): Promise<void> {
  const my = me().profile.id
  const i = db.messages.findIndex((x) => x.id === m.id && x.sender_id === my)
  if (i < 0) fail('not_member')
  const [gone] = db.messages.splice(i, 1)
  save()
  await delMedia('chat-media', gone.message_attachments.map((a) => a.storage_path))
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

export async function listHelp(o: { category?: string; status?: HelpStatus | ''; mine?: string; text?: string; limit: number; offset: number }): Promise<HelpRequest[]> {
  me()
  const text = (o.text ?? '').replace(/[^\p{L}\p{N} '-]/gu, ' ').trim().toLowerCase()
  return db.help
    .filter((h) => (!o.category || h.category === o.category) && (!o.status || h.status === o.status) && (!o.mine || h.author_id === o.mine))
    .filter((h) => !text || h.title.toLowerCase().includes(text) || h.description.toLowerCase().includes(text))
    .sort((x, y) => y.created_at.localeCompare(x.created_at))
    .slice(o.offset, o.offset + o.limit)
    .map(withAuthor)
}

export async function getHelp(id: string): Promise<HelpRequest | null> {
  me()
  const h = db.help.find((x) => x.id === id)
  return h ? withAuthor(h) : null
}

export async function createHelp(uid: string, p: { title: string; description: string; category: string; file?: OutgoingFile | null }): Promise<string> {
  const my = me()
  if (my.profile.id !== uid) fail('not_authenticated')
  if (!rulesOk(my)) fail('rules_required')
  const title = p.title.trim()
  const description = p.description.trim()
  if (title.length < 3 || title.length > 120 || description.length < 5 || description.length > 3000 || !CATEGORIES.some((c) => c.id === p.category)) fail('23514')
  let imagePath: string | null = null
  if (p.file) {
    await recheck(p.file)
    if (p.file.type.kind === 'video') fail('file_type_not_allowed')
    imagePath = `${uid}/${newId()}.${p.file.type.ext}`
    await putMedia('help-images', imagePath, p.file.blob)
  }
  const row: HelpRow = { id: newId(), author_id: uid, title, description, category: p.category, status: 'open', image_path: imagePath, created_at: nextTs() }
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
  db.reports = db.reports.filter((r) => r.reporter?.public_id !== db.people[uid].profile.public_id)
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
