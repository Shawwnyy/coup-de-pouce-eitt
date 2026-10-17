/**
 * Analyse des liens écrits dans les messages et les demandes d'aide.
 *  - Seuls http et https sont acceptés (jamais javascript:, data:, file: …).
 *  - Rien n'est chargé automatiquement : on affiche le domaine et l'utilisateur décide.
 *  - Les « signes à vérifier » sont des indices simples, PAS une détection fiable des arnaques.
 */
export type LinkKind = 'image' | 'video-file' | 'video-platform' | 'page'

export interface LinkInfo {
  url: string
  host: string
  path: string
  secure: boolean
  kind: LinkKind
  platform?: string
  warnings: string[]
}

export type Segment = { type: 'text'; text: string } | { type: 'link'; raw: string; info: LinkInfo }

const SHORTENERS = new Set([
  'bit.ly', 'tinyurl.com', 't.co', 'goo.gl', 'ow.ly', 'is.gd', 'buff.ly', 'cutt.ly', 'rebrand.ly',
  'shorturl.at', 'tiny.cc', 'rb.gy', 'lnkd.in', 'urlz.fr', 'bl.ink',
])

const PLATFORMS: Record<string, string> = {
  'youtube.com': 'YouTube', 'youtu.be': 'YouTube', 'vimeo.com': 'Vimeo', 'dailymotion.com': 'Dailymotion',
  'dai.ly': 'Dailymotion', 'twitch.tv': 'Twitch', 'tiktok.com': 'TikTok', 'peertube.tv': 'PeerTube',
}

const IMAGE_EXT = /\.(png|jpe?g|gif|webp|avif)$/i
const VIDEO_EXT = /\.(mp4|webm|mov|ogv|m4v)$/i

function platformOf(host: string): string | undefined {
  const h = host.replace(/^(www|m)\./, '')
  return PLATFORMS[h] ?? PLATFORMS[h.split('.').slice(-2).join('.')]
}

function truncate(s: string, n: number): string {
  return s.length > n ? s.slice(0, n - 1) + '…' : s
}

/** Retourne null si ce n'est pas une adresse http(s) valide. */
export function analyzeUrl(raw: string): LinkInfo | null {
  let u: URL
  try {
    u = new URL(raw)
  } catch {
    return null
  }
  if (u.protocol !== 'http:' && u.protocol !== 'https:') return null
  const host = u.hostname.toLowerCase()
  if (!host) return null

  const warnings: string[] = []
  if (u.protocol === 'http:') warnings.push('Ce lien n’est pas chiffré (http).')
  if (u.username || u.password) warnings.push('Le lien contient un identifiant avant le nom du site : technique courante pour tromper.')
  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(host) || host.startsWith('[')) warnings.push('L’adresse est une adresse numérique, pas un nom de site.')
  if (host.split('.').some((l) => l.startsWith('xn--'))) warnings.push('Le nom du site utilise des caractères spéciaux qui peuvent imiter un autre site.')
  if (SHORTENERS.has(host.replace(/^www\./, ''))) warnings.push('Lien raccourci : la vraie destination est masquée.')
  if (host.split('.').length >= 6) warnings.push('Le nom du site comporte beaucoup de sous-domaines.')
  if (u.port && u.port !== '80' && u.port !== '443') warnings.push('Le lien utilise un port inhabituel.')

  const platform = platformOf(host)
  let kind: LinkKind = 'page'
  if (IMAGE_EXT.test(u.pathname)) kind = 'image'
  else if (VIDEO_EXT.test(u.pathname)) kind = 'video-file'
  else if (platform && ['YouTube', 'Vimeo', 'Dailymotion', 'Twitch', 'TikTok', 'PeerTube'].includes(platform)) kind = 'video-platform'

  return {
    url: u.href,
    host,
    path: truncate(u.pathname === '/' && !u.search ? '' : u.pathname + u.search, 60),
    secure: u.protocol === 'https:',
    kind,
    platform,
    warnings,
  }
}

const URL_RE = /https?:\/\/[^\s<>"'`]+/gi
const TRAILING = /[.,;:!?»"'’]+$/

function trimUrl(raw: string): { url: string; rest: string } {
  let url = raw
  let rest = ''
  for (;;) {
    const m = TRAILING.exec(url)
    if (m) {
      rest = m[0] + rest
      url = url.slice(0, m.index)
      continue
    }
    const last = url.slice(-1)
    const open = last === ')' ? '(' : last === ']' ? '[' : last === '}' ? '{' : ''
    if (open && (url.match(new RegExp('\\' + open, 'g')) ?? []).length < (url.match(new RegExp('\\' + last, 'g')) ?? []).length) {
      rest = last + rest
      url = url.slice(0, -1)
      continue
    }
    return { url, rest }
  }
}

/** Découpe un texte en morceaux de texte brut et en liens analysés. */
export function splitText(text: string): Segment[] {
  const out: Segment[] = []
  let last = 0
  for (const m of text.matchAll(URL_RE)) {
    const start = m.index ?? 0
    const { url, rest } = trimUrl(m[0])
    const info = analyzeUrl(url)
    if (!info) continue
    if (start > last) out.push({ type: 'text', text: text.slice(last, start) })
    out.push({ type: 'link', raw: url, info })
    last = start + m[0].length - rest.length
  }
  if (last < text.length) out.push({ type: 'text', text: text.slice(last) })
  return out
}
