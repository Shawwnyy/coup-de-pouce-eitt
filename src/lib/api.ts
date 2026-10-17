/**
 * Couche d'accès aux données : TOUS les appels à Supabase passent par ce fichier.
 * Les contrôles d'accès réels sont dans la base (RLS + fonctions SQL) ; ici on appelle simplement l'API.
 */
import type { Session, SupabaseClient } from '@supabase/supabase-js'
import type {
  BlockedUser, ConversationSummary, HelpRequest, HelpStatus, Message, Profile, ReportKind, ReportReason,
  ReportRow, ReportStatus, SearchResult, Settings,
} from '../types.ts'
import type { Sniffed } from './files.ts'
import { supabase } from './supabase.ts'

function sb(): SupabaseClient {
  if (!supabase) throw new Error('not_configured')
  return supabase
}

interface Res<T> {
  data: T | null
  error: { message: string; code?: string } | null
}

function unwrap<T>(res: Res<T>): T {
  if (res.error) throw res.error
  return res.data as T
}

function check(res: { error: { message: string; code?: string } | null }): void {
  if (res.error) throw res.error
}

// ---------------------------------------------------------------- Authentification
export async function signUp(p: { email: string; password: string; displayName: string; rulesVersion: string }): Promise<{ needsConfirmation: boolean }> {
  const base = window.location.origin + (import.meta.env.BASE_URL || '/')
  const res = await sb().auth.signUp({
    email: p.email,
    password: p.password,
    options: {
      emailRedirectTo: base,
      // Lu par le déclencheur SQL handle_new_user : nom facultatif + version des règles acceptées.
      data: { display_name: p.displayName.trim(), rules_version: p.rulesVersion },
    },
  })
  if (res.error) throw res.error
  return { needsConfirmation: !res.data.session }
}

export async function signIn(email: string, password: string): Promise<void> {
  check(await sb().auth.signInWithPassword({ email, password }))
}

export async function signOut(): Promise<void> {
  check(await sb().auth.signOut())
}

export async function getSession(): Promise<Session | null> {
  const res = await sb().auth.getSession()
  if (res.error) throw res.error
  return res.data.session
}

export function onAuthChange(cb: (s: Session | null) => void): () => void {
  const { data } = sb().auth.onAuthStateChange((_event, session) => cb(session))
  return () => data.subscription.unsubscribe()
}

export async function updatePassword(password: string): Promise<void> {
  check(await sb().auth.updateUser({ password }))
}

/** Envoie le message de réinitialisation. Supabase ne révèle pas si l'adresse existe : l'interface non plus. */
export async function requestPasswordReset(email: string): Promise<void> {
  const base = window.location.origin + (import.meta.env.BASE_URL || '/')
  check(await sb().auth.resetPasswordForEmail(email, { redirectTo: `${base}nouveau-mot-de-passe` }))
}

// ---------------------------------------------------------------- Profils et réglages
const PROFILE_COLS = 'id, public_id, display_name, avatar_path, bio, created_at'
const SETTINGS_COLS = 'theme, theme_custom, notification_preferences, allow_contact, searchable, rules_accepted_at, rules_version'

export async function fetchProfile(id: string): Promise<Profile | null> {
  return unwrap(await sb().from('profiles').select(PROFILE_COLS).eq('id', id).maybeSingle()) as Profile | null
}

export async function fetchSettings(uid: string): Promise<Settings> {
  return unwrap(await sb().from('user_settings').select(SETTINGS_COLS).eq('user_id', uid).single()) as unknown as Settings
}

export async function updateProfile(uid: string, patch: { display_name?: string | null; bio?: string | null; avatar_path?: string | null }): Promise<Profile> {
  return unwrap(await sb().from('profiles').update(patch).eq('id', uid).select(PROFILE_COLS).single()) as Profile
}

export async function updateSettings(uid: string, patch: Partial<Pick<Settings, 'theme' | 'theme_custom' | 'notification_preferences' | 'allow_contact' | 'searchable'>>): Promise<void> {
  check(await sb().from('user_settings').update(patch).eq('user_id', uid))
}

export async function acceptRules(version: string): Promise<void> {
  check(await sb().rpc('accept_rules', { p_version: version }))
}

export function avatarUrl(path: string | null | undefined): string | null {
  if (!path || !supabase) return null
  return supabase.storage.from('avatars').getPublicUrl(path).data.publicUrl
}

export async function uploadAvatar(uid: string, blob: File, type: Sniffed, previousPath: string | null): Promise<Profile> {
  const client = sb()
  const path = `${uid}/${Date.now()}.${type.ext}`
  const up = await client.storage.from('avatars').upload(path, blob, { contentType: type.mime, cacheControl: '31536000', upsert: false })
  if (up.error) throw up.error
  let profile: Profile
  try {
    profile = await updateProfile(uid, { avatar_path: path })
  } catch (e) {
    void client.storage.from('avatars').remove([path])
    throw e
  }
  if (previousPath) void client.storage.from('avatars').remove([previousPath])
  return profile
}

export async function removeAvatar(uid: string, previousPath: string | null): Promise<Profile> {
  const profile = await updateProfile(uid, { avatar_path: null })
  if (previousPath) void sb().storage.from('avatars').remove([previousPath])
  return profile
}

// ---------------------------------------------------------------- Recherche
export async function searchProfiles(query: string): Promise<SearchResult[]> {
  return (unwrap(await sb().rpc('search_profiles', { p_query: query })) ?? []) as SearchResult[]
}

// ---------------------------------------------------------------- Conversations et messages
export async function listConversations(): Promise<ConversationSummary[]> {
  return (unwrap(await sb().rpc('list_conversations')) ?? []) as ConversationSummary[]
}

export async function startConversation(otherId: string): Promise<string> {
  return unwrap(await sb().rpc('start_conversation', { p_other: otherId })) as string
}

const MESSAGE_COLS = 'id, conversation_id, sender_id, content, created_at, message_attachments(id, storage_path, file_name, mime_type, file_size)'

export async function fetchMessages(conversationId: string, opts: { before?: string; limit?: number } = {}): Promise<{ messages: Message[]; hasMore: boolean }> {
  const limit = opts.limit ?? 50
  let q = sb().from('messages').select(MESSAGE_COLS).eq('conversation_id', conversationId).order('created_at', { ascending: false }).limit(limit)
  if (opts.before) q = q.lt('created_at', opts.before)
  const rows = (unwrap(await q) ?? []) as unknown as Message[]
  return { messages: rows.reverse(), hasMore: rows.length === limit }
}

export async function fetchMessage(id: string): Promise<Message | null> {
  return unwrap(await sb().from('messages').select(MESSAGE_COLS).eq('id', id).maybeSingle()) as unknown as Message | null
}

export interface OutgoingFile {
  blob: File
  type: Sniffed
}

/** Envoie un message (et son fichier éventuel). Le serveur revérifie droits, taille et type. */
export async function sendMessage(p: { conversationId: string; content: string; file?: OutgoingFile | null }): Promise<string> {
  const client = sb()
  const attachments: { path: string; name: string }[] = []
  let uploaded: string | null = null
  if (p.file) {
    const path = `${p.conversationId}/${crypto.randomUUID()}.${p.file.type.ext}`
    const up = await client.storage.from('chat-media').upload(path, p.file.blob, {
      contentType: p.file.type.mime,
      cacheControl: '3600',
      upsert: false,
    })
    if (up.error) throw up.error
    uploaded = path
    attachments.push({ path, name: p.file.blob.name || 'fichier' })
  }
  const res = await client.rpc('send_message', { p_conversation: p.conversationId, p_content: p.content, p_attachments: attachments })
  if (res.error) {
    if (uploaded) void client.storage.from('chat-media').remove([uploaded])
    throw res.error
  }
  return res.data as string
}

export async function deleteMessage(m: Message): Promise<void> {
  const client = sb()
  const paths = m.message_attachments.map((a) => a.storage_path)
  if (paths.length) await client.storage.from('chat-media').remove(paths) // erreur ignorée : le message doit pouvoir être supprimé
  check(await client.from('messages').delete().eq('id', m.id))
}

export async function markRead(conversationId: string): Promise<void> {
  check(await sb().rpc('mark_read', { p_conversation: conversationId }))
}

export async function archiveConversation(conversationId: string, archived: boolean): Promise<void> {
  check(await sb().rpc('archive_conversation', { p_conversation: conversationId, p_archived: archived }))
}

// Liens temporaires pour les médias privés (jamais d'URL publique permanente).
const urlCache = new Map<string, { url: string; exp: number }>()
export async function signedUrl(bucket: 'chat-media' | 'help-images', path: string): Promise<string> {
  const key = `${bucket}/${path}`
  const hit = urlCache.get(key)
  if (hit && hit.exp > Date.now() + 60_000) return hit.url
  const res = await sb().storage.from(bucket).createSignedUrl(path, 3600)
  if (res.error || !res.data) throw res.error ?? new Error('signed_url')
  urlCache.set(key, { url: res.data.signedUrl, exp: Date.now() + 3600_000 })
  return res.data.signedUrl
}

// ---------------------------------------------------------------- Blocage et signalement
export async function blockUser(id: string): Promise<void> {
  const res = await sb().from('user_blocks').insert({ blocked_id: id })
  if (res.error && res.error.code !== '23505') throw res.error // déjà bloqué : rien à faire
}

export async function unblockUser(id: string): Promise<void> {
  check(await sb().from('user_blocks').delete().eq('blocked_id', id))
}

export async function isBlockedByMe(id: string): Promise<boolean> {
  const res = await sb().from('user_blocks').select('blocked_id').eq('blocked_id', id).maybeSingle()
  if (res.error) throw res.error
  return Boolean(res.data)
}

export async function listBlocked(): Promise<BlockedUser[]> {
  const rows = unwrap(await sb().from('user_blocks').select('blocked_id, created_at, profile:profiles!blocked_id(id, public_id, display_name, avatar_path)').order('created_at', { ascending: false }))
  return (rows ?? []) as unknown as BlockedUser[]
}

export async function report(kind: ReportKind, targetId: string, reason: ReportReason, details: string): Promise<void> {
  check(await sb().rpc('report_content', { p_kind: kind, p_target: targetId, p_reason: reason, p_details: details.trim() || null }))
}

// ---------------------------------------------------------------- Modération (réservée aux modérateurs, vérifié par la RLS)
/** false si la migration 4 n'est pas installée ou si le compte n'est pas modérateur. */
export async function amIModerator(): Promise<boolean> {
  const res = await sb().rpc('am_i_moderator')
  return !res.error && res.data === true
}

const REPORT_COLS = 'id, reason, details, content_snapshot, status, created_at, reported_public_id, reported_user_id, message_id, help_request_id, reporter:profiles!reporter_id(public_id, display_name)'

export async function listReports(status: ReportStatus | ''): Promise<ReportRow[]> {
  let q = sb().from('reports').select(REPORT_COLS).order('created_at', { ascending: false }).limit(100)
  if (status) q = q.eq('status', status)
  return (unwrap(await q) ?? []) as unknown as ReportRow[]
}

export async function setReportStatus(id: string, status: ReportStatus): Promise<void> {
  check(await sb().from('reports').update({ status }).eq('id', id))
}

// ---------------------------------------------------------------- Demandes d'aide
const HELP_COLS = 'id, author_id, title, description, category, status, image_path, created_at, author:profiles!author_id(public_id, display_name, avatar_path)'

export async function listHelp(o: { category?: string; status?: HelpStatus | ''; mine?: string; text?: string; limit: number; offset: number }): Promise<HelpRequest[]> {
  let q = sb().from('help_requests').select(HELP_COLS).order('created_at', { ascending: false }).range(o.offset, o.offset + o.limit - 1)
  if (o.category) q = q.eq('category', o.category)
  if (o.status) q = q.eq('status', o.status)
  if (o.mine) q = q.eq('author_id', o.mine)
  const text = (o.text ?? '').replace(/[^\p{L}\p{N} '-]/gu, ' ').trim()
  if (text) q = q.or(`title.ilike.%${text}%,description.ilike.%${text}%`)
  return (unwrap(await q) ?? []) as unknown as HelpRequest[]
}

export async function getHelp(id: string): Promise<HelpRequest | null> {
  return unwrap(await sb().from('help_requests').select(HELP_COLS).eq('id', id).maybeSingle()) as unknown as HelpRequest | null
}

export async function createHelp(uid: string, p: { title: string; description: string; category: string; file?: OutgoingFile | null; urgent?: boolean }): Promise<string> {
  // `urgent` (alerte rouge) n'existe que dans la version locale : la base Supabase n'a pas cette colonne, on l'ignore ici.
  const client = sb()
  let imagePath: string | null = null
  if (p.file) {
    imagePath = `${uid}/${crypto.randomUUID()}.${p.file.type.ext}`
    const up = await client.storage.from('help-images').upload(imagePath, p.file.blob, { contentType: p.file.type.mime, cacheControl: '3600', upsert: false })
    if (up.error) throw up.error
  }
  const res = await client.from('help_requests').insert({ title: p.title.trim(), description: p.description.trim(), category: p.category, image_path: imagePath }).select('id').single()
  if (res.error) {
    if (imagePath) void client.storage.from('help-images').remove([imagePath])
    throw res.error
  }
  return (res.data as { id: string }).id
}

export async function updateHelpStatus(id: string, status: HelpStatus): Promise<void> {
  check(await sb().from('help_requests').update({ status }).eq('id', id))
}

export async function deleteHelp(h: HelpRequest): Promise<void> {
  const client = sb()
  if (h.image_path) await client.storage.from('help-images').remove([h.image_path])
  check(await client.from('help_requests').delete().eq('id', h.id))
}

// ---------------------------------------------------------------- Temps réel
export interface IncomingMessage {
  id: string
  conversation_id: string
  sender_id: string
  created_at: string
}

/** Écoute les nouveaux messages des conversations de l'utilisateur (filtrés par la RLS côté serveur). */
export function subscribeMessages(cb: (m: IncomingMessage) => void): () => void {
  const client = sb()
  const channel = client
    .channel(`messages-${crypto.randomUUID()}`)
    .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages' }, (payload) => cb(payload.new as IncomingMessage))
    .subscribe()
  return () => void client.removeChannel(channel)
}

export function subscribeHelp(cb: (h: { id: string; author_id: string; title: string }) => void): () => void {
  const client = sb()
  const channel = client
    .channel(`help-${crypto.randomUUID()}`)
    .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'help_requests' }, (payload) => cb(payload.new as { id: string; author_id: string; title: string }))
    .subscribe()
  return () => void client.removeChannel(channel)
}

// ---------------------------------------------------------------- Export des données personnelles
async function fetchAllMine<T>(build: (from: number, to: number) => PromiseLike<Res<T[]>>): Promise<T[]> {
  const out: T[] = []
  for (let page = 0; page < 100; page++) {
    const rows = unwrap(await build(page * 1000, page * 1000 + 999)) ?? []
    out.push(...rows)
    if (rows.length < 1000) break
  }
  return out
}

/** Rassemble ce que l'utilisateur peut lire de SES données (la RLS limite déjà tout au compte connecté). */
export async function exportMyData(uid: string): Promise<Record<string, unknown>> {
  const c = sb()
  const [profile, settings, help, messages, blocked] = await Promise.all([
    fetchProfile(uid),
    fetchSettings(uid),
    fetchAllMine<Record<string, unknown>>((a, b) => c.from('help_requests').select('id, title, description, category, status, created_at').eq('author_id', uid).order('created_at').range(a, b) as unknown as PromiseLike<Res<Record<string, unknown>[]>>),
    fetchAllMine<Record<string, unknown>>((a, b) => c.from('messages').select('id, conversation_id, content, created_at, message_attachments(file_name, mime_type, file_size)').eq('sender_id', uid).order('created_at').range(a, b) as unknown as PromiseLike<Res<Record<string, unknown>[]>>),
    listBlocked(),
  ])
  return {
    exported_at: new Date().toISOString(),
    note: 'Export de vos données personnelles. Les messages exportés sont ceux que vous avez écrits ; les fichiers joints sont listés par nom (pas inclus). Les signalements que vous avez faits ne sont lisibles que par la modération et ne figurent pas ici.',
    profile,
    settings,
    help_requests: help,
    messages_sent: messages,
    blocked_users: blocked.map((b) => ({ public_id: b.profile?.public_id ?? null, blocked_at: b.created_at })),
  }
}

// ---------------------------------------------------------------- Suppression de compte
async function removeInChunks(bucket: string, paths: string[]): Promise<void> {
  for (let i = 0; i < paths.length; i += 100) await sb().storage.from(bucket).remove(paths.slice(i, i + 100))
}

/** Supprime d'abord les fichiers de l'utilisateur (le stockage ne se purge pas en SQL), puis le compte. */
export async function deleteAccount(uid: string): Promise<void> {
  const client = sb()
  const att = (await client.from('message_attachments').select('storage_path').eq('owner_id', uid)).data as { storage_path: string }[] | null
  if (att?.length) await removeInChunks('chat-media', att.map((a) => a.storage_path))
  for (const bucket of ['help-images', 'avatars']) {
    const files = (await client.storage.from(bucket).list(uid, { limit: 1000 })).data
    if (files?.length) await removeInChunks(bucket, files.map((f) => `${uid}/${f.name}`))
  }
  check(await client.rpc('delete_my_account'))
  await client.auth.signOut().catch(() => undefined)
}

// ---------------------------------------------------------------- Conversation : interlocuteur
export async function getConversationPeer(conversationId: string, me: string): Promise<Profile | null> {
  const row = unwrap(await sb().from('conversations').select('user_a, user_b').eq('id', conversationId).maybeSingle()) as { user_a: string; user_b: string } | null
  if (!row) return null
  return fetchProfile(row.user_a === me ? row.user_b : row.user_a)
}
