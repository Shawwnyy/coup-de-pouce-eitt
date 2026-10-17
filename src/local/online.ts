/**
 * MODE « EN LIGNE » (facultatif, désactivé au départ).
 *
 * Un site sans serveur ne voit pas les autres appareils. Pour que « ajouter quelqu'un avec son User# » marche,
 * on passe par un RELAIS PUBLIC de type ntfy (par défaut https://ntfy.sh, gratuit, sans compte) :
 *  - publier = une requête HTTP POST sur un « sujet » (topic) ;
 *  - recevoir = un flux HTTP (/json) ouvert sur ces sujets, avec rattrapage (« since ») pour ce qui est arrivé hors ligne.
 *
 * Ce que cela implique, dit sans détour :
 *  - la « boîte de demandes » d'un numéro (User#0042) est PUBLIQUE : n'importe qui connaissant le numéro peut y écrire
 *    (c'est ce qui permet de ne rien configurer) et n'importe qui peut la lire. Elle ne contient que des informations
 *    déjà publiques : numéro, nom affiché, clé publique. Aucun secret n'y passe.
 *  - dès qu'une demande est acceptée, les deux appareils calculent un secret commun (ECDH P-256) qui n'est jamais envoyé ;
 *    la conversation utilise un sujet dérivé de ce secret et chaque message est chiffré (AES-GCM) : le relais ne voit que
 *    des données illisibles, la taille, l'heure et le nom (illisible) du sujet.
 *  - sans comparaison du « code de vérification » en dehors de l'appli, un attaquant actif qui écrirait dans la boîte
 *    publique à votre place pourrait se faire passer pour votre contact au moment de l'acceptation. Il n'y a pas de modération.
 *  - le relais gratuit limite le nombre de messages par jour, garde les messages peu de temps (environ 12 h) et peut tomber.
 *  - seuls les TEXTES passent en ligne (4 Ko maximum par message). Images et vidéos : fichier d'échange (page « Autre appareil »).
 */

export const DEFAULT_RELAY = 'https://ntfy.sh'
/** Le relais refuse les messages de plus de 4096 octets : on garde de la marge. */
export const MAX_BODY_BYTES = 3800

export type RelayStatus = 'off' | 'connecting' | 'online' | 'error'

// ---------------------------------------------------------------- Adresse du relais
/** Valide l'adresse d'un relais : https obligatoire (http seulement pour localhost, utile aux essais), pas d'identifiants. */
export function normalizeRelay(input: string): string | null {
  let u: URL
  try {
    u = new URL((input ?? '').trim())
  } catch {
    return null
  }
  const local = u.hostname === 'localhost' || u.hostname === '127.0.0.1' || u.hostname === '[::1]'
  if (u.protocol !== 'https:' && !(u.protocol === 'http:' && local)) return null
  if (u.username || u.password || u.search || u.hash) return null
  const path = u.pathname.replace(/\/+$/, '')
  return u.origin + path
}

// ---------------------------------------------------------------- Outils binaires
const enc = new TextEncoder()
const dec = new TextDecoder()

export function toHex(b: ArrayBuffer | Uint8Array): string {
  const a = b instanceof Uint8Array ? b : new Uint8Array(b)
  let s = ''
  a.forEach((x) => (s += x.toString(16).padStart(2, '0')))
  return s
}

export function toB64(b: ArrayBuffer | Uint8Array): string {
  const a = b instanceof Uint8Array ? b : new Uint8Array(b)
  let s = ''
  a.forEach((x) => (s += String.fromCharCode(x)))
  return btoa(s)
}

export function fromB64(s: string): Uint8Array<ArrayBuffer> {
  const bin = atob(s)
  const out = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i)
  return out
}

// ---------------------------------------------------------------- Sujets
/** Boîte de demandes d'un numéro : publique par construction (elle se calcule à partir du numéro). */
export async function mailboxTopic(publicId: string): Promise<string> {
  const d = await crypto.subtle.digest('SHA-256', enc.encode('cdp1|mailbox|' + publicId.trim().toLowerCase()))
  return 'cdp1-in-' + toHex(d).slice(0, 32)
}

// ---------------------------------------------------------------- Clés et canal chiffré
const CURVE = { name: 'ECDH', namedCurve: 'P-256' } as const

export interface KeyPair { pub: JsonWebKey; priv: JsonWebKey }
export interface Channel { topic: string; key: string }

export async function genKeyPair(): Promise<KeyPair> {
  const k = await crypto.subtle.generateKey(CURVE, true, ['deriveBits'])
  return { pub: await crypto.subtle.exportKey('jwk', k.publicKey), priv: await crypto.subtle.exportKey('jwk', k.privateKey) }
}

/** Ne garde que les champs d'une clé publique P-256 et refuse tout le reste (données reçues d'un inconnu). */
export function cleanPublicKey(raw: unknown): JsonWebKey | null {
  const k = raw as Partial<Record<'kty' | 'crv' | 'x' | 'y', unknown>> | null
  if (!k || k.kty !== 'EC' || k.crv !== 'P-256') return null
  const ok = (v: unknown): v is string => typeof v === 'string' && /^[\w-]{40,50}$/.test(v)
  if (!ok(k.x) || !ok(k.y)) return null
  return { kty: 'EC', crv: 'P-256', x: k.x, y: k.y }
}

/** Secret commun (jamais transmis) → sujet de conversation + clé AES. Même résultat des deux côtés. */
export async function deriveChannel(priv: JsonWebKey, theirPub: JsonWebKey, idA: string, idB: string): Promise<Channel> {
  const pub = cleanPublicKey(theirPub)
  if (!pub) throw new Error('bad_key')
  const mine = await crypto.subtle.importKey('jwk', { kty: priv.kty, crv: priv.crv, x: priv.x, y: priv.y, d: priv.d }, CURVE, false, ['deriveBits'])
  const theirs = await crypto.subtle.importKey('jwk', pub, CURVE, false, [])
  const shared = await crypto.subtle.deriveBits({ name: 'ECDH', public: theirs }, mine, 256)
  const hk = await crypto.subtle.importKey('raw', shared, 'HKDF', false, ['deriveBits'])
  const out = new Uint8Array(
    await crypto.subtle.deriveBits({ name: 'HKDF', hash: 'SHA-256', salt: enc.encode([idA, idB].sort().join('|')), info: enc.encode('cdp1-channel') }, hk, 384),
  )
  return { topic: 'cdp1-c-' + toHex(out.slice(0, 16)), key: toB64(out.slice(16, 48)) }
}

async function aesKey(keyB64: string, usage: 'encrypt' | 'decrypt'): Promise<CryptoKey> {
  return crypto.subtle.importKey('raw', fromB64(keyB64), 'AES-GCM', false, [usage])
}

export async function encryptText(keyB64: string, topic: string, plain: string): Promise<{ iv: string; ct: string }> {
  const iv = crypto.getRandomValues(new Uint8Array(12))
  const ct = await crypto.subtle.encrypt({ name: 'AES-GCM', iv, additionalData: enc.encode(topic) }, await aesKey(keyB64, 'encrypt'), enc.encode(plain))
  return { iv: toB64(iv), ct: toB64(ct) }
}

export async function decryptText(keyB64: string, topic: string, iv: string, ct: string): Promise<string> {
  const ivBytes = fromB64(iv)
  if (ivBytes.length !== 12) throw new Error('bad_iv')
  const plain = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: ivBytes, additionalData: enc.encode(topic) }, await aesKey(keyB64, 'decrypt'), fromB64(ct))
  return dec.decode(plain)
}

/** Code de vérification à comparer à voix haute ou par un autre moyen (même valeur des deux côtés). 8 chiffres. */
export async function verificationCode(channel: Channel): Promise<string> {
  const d = new Uint8Array(await crypto.subtle.digest('SHA-256', enc.encode('cdp1|verify|' + channel.key)))
  const n = ((d[0] << 24) | (d[1] << 16) | (d[2] << 8) | d[3]) >>> 0
  const s = String(n % 100000000).padStart(8, '0')
  return `${s.slice(0, 4)}-${s.slice(4)}`
}

// ---------------------------------------------------------------- Publier
/** Publie un texte sur un sujet. Erreurs : online_too_long, relay_rate_limited, relay_unreachable, relay_error. */
export async function publish(relay: string, topic: string, body: string): Promise<void> {
  if (enc.encode(body).length > MAX_BODY_BYTES) throw new Error('online_too_long')
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), 15000)
  let res: Response
  try {
    res = await fetch(`${relay}/${topic}`, { method: 'POST', body, signal: ctrl.signal, headers: { 'Content-Type': 'text/plain; charset=utf-8' } })
  } catch {
    throw new Error('relay_unreachable')
  } finally {
    clearTimeout(timer)
  }
  if (res.status === 429) throw new Error('relay_rate_limited')
  if (!res.ok) throw new Error('relay_error')
}

// ---------------------------------------------------------------- Recevoir
export interface RelayEvent { id: string; time: number; topic: string; message: string }

export interface SubscribeOptions {
  relay: string
  topics: string[]
  /** 'all' (tout ce que le relais a gardé), ou une date en secondes (ce qui est arrivé depuis). */
  since: string | number
  onEvent: (e: RelayEvent) => void
  onStatus: (s: RelayStatus) => void
}

/** Ouvre un flux sur les sujets et le rouvre tout seul s'il tombe. Retourne la fonction qui l'arrête. */
export function subscribe(o: SubscribeOptions): () => void {
  let stopped = false
  let ctrl: AbortController | null = null
  let last: string | number = o.since
  let delay = 1000
  const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms))

  function handle(line: string): void {
    let ev: { id?: unknown; time?: unknown; event?: unknown; topic?: unknown; message?: unknown }
    try {
      ev = JSON.parse(line)
    } catch {
      return
    }
    if (ev.event === 'open') {
      delay = 1000
      o.onStatus('online')
    } else if (ev.event === 'message' && typeof ev.id === 'string' && typeof ev.time === 'number' && typeof ev.topic === 'string' && typeof ev.message === 'string') {
      last = Math.max(typeof last === 'number' ? last : 0, ev.time)
      o.onEvent({ id: ev.id, time: ev.time, topic: ev.topic, message: ev.message })
    }
  }

  async function run(): Promise<void> {
    while (!stopped) {
      ctrl = new AbortController()
      o.onStatus('connecting')
      try {
        const res = await fetch(`${o.relay}/${o.topics.join(',')}/json?since=${encodeURIComponent(String(last))}`, { signal: ctrl.signal, cache: 'no-store' })
        if (!res.ok || !res.body) throw new Error('relay_error')
        const reader = res.body.getReader()
        const td = new TextDecoder()
        let buf = ''
        for (;;) {
          const { done, value } = await reader.read()
          if (done) break
          buf += td.decode(value, { stream: true })
          let i: number
          while ((i = buf.indexOf('\n')) >= 0) {
            const line = buf.slice(0, i).trim()
            buf = buf.slice(i + 1)
            if (line) handle(line)
          }
        }
      } catch {
        if (stopped) return
      }
      if (stopped) return
      o.onStatus('error')
      await sleep(delay)
      delay = Math.min(delay * 2, 15000)
    }
  }

  void run()
  return () => {
    stopped = true
    ctrl?.abort()
  }
}
