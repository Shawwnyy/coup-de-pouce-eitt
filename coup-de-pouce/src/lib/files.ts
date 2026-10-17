import { formatBytes } from './format.ts'

/**
 * Validation des fichiers côté navigateur.
 * On lit les premiers octets (« signature » du fichier) : l'extension et le type annoncé par
 * le navigateur ne suffisent pas. Le serveur refait ses propres contrôles de taille et de type
 * (voir supabase/migrations) — la validation ici sert à guider l'utilisateur sans attendre.
 */
export type Mime = 'image/png' | 'image/jpeg' | 'image/webp' | 'image/gif' | 'video/mp4' | 'video/webm'
export type FileKind = 'image' | 'gif' | 'video'

export interface Sniffed {
  mime: Mime
  ext: 'png' | 'jpg' | 'webp' | 'gif' | 'mp4' | 'webm'
  kind: FileKind
}

const MP4_BRANDS = new Set(['isom', 'iso2', 'iso4', 'iso5', 'iso6', 'mp41', 'mp42', 'avc1', 'dash', 'MSNV', 'M4V ', 'f4v '])

const ascii = (b: Uint8Array, from: number, to: number): string => String.fromCharCode(...b.slice(from, to))

export function sniffType(b: Uint8Array): Sniffed | null {
  if (b.length >= 8 && b[0] === 0x89 && ascii(b, 1, 4) === 'PNG' && b[4] === 0x0d && b[5] === 0x0a && b[6] === 0x1a && b[7] === 0x0a) {
    return { mime: 'image/png', ext: 'png', kind: 'image' }
  }
  if (b.length >= 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return { mime: 'image/jpeg', ext: 'jpg', kind: 'image' }
  if (b.length >= 6 && (ascii(b, 0, 6) === 'GIF87a' || ascii(b, 0, 6) === 'GIF89a')) return { mime: 'image/gif', ext: 'gif', kind: 'gif' }
  if (b.length >= 12 && ascii(b, 0, 4) === 'RIFF' && ascii(b, 8, 12) === 'WEBP') return { mime: 'image/webp', ext: 'webp', kind: 'image' }
  if (b.length >= 12 && ascii(b, 4, 8) === 'ftyp' && MP4_BRANDS.has(ascii(b, 8, 12))) return { mime: 'video/mp4', ext: 'mp4', kind: 'video' }
  if (b.length >= 4 && b[0] === 0x1a && b[1] === 0x45 && b[2] === 0xdf && b[3] === 0xa3 && ascii(b, 0, Math.min(b.length, 64)).includes('webm')) {
    return { mime: 'video/webm', ext: 'webm', kind: 'video' }
  }
  return null
}

export interface FilePolicy {
  allow: readonly Mime[]
  maxBytes: Record<FileKind, number>
}

export type Validation = { ok: true; type: Sniffed; size: number } | { ok: false; error: string }

const LABELS: Record<Mime, string> = {
  'image/png': 'PNG', 'image/jpeg': 'JPEG', 'image/webp': 'WebP', 'image/gif': 'GIF', 'video/mp4': 'MP4', 'video/webm': 'WebM',
}

const norm = (m: string): string => (m === 'image/jpg' ? 'image/jpeg' : m)

export async function validateFile(file: Blob & { name?: string }, policy: FilePolicy): Promise<Validation> {
  const allowedText = policy.allow.map((m) => LABELS[m]).join(', ')
  if (!file.size) return { ok: false, error: 'Ce fichier est vide.' }
  const biggest = Math.max(...policy.allow.map((m) => policy.maxBytes[m.startsWith('video') ? 'video' : m === 'image/gif' ? 'gif' : 'image']))
  if (file.size > biggest) {
    return { ok: false, error: `Ce fichier est trop volumineux (${formatBytes(file.size)}). Maximum autorisé : ${formatBytes(biggest)}.` }
  }
  let head: Uint8Array
  try {
    head = new Uint8Array(await file.slice(0, 64).arrayBuffer())
  } catch {
    return { ok: false, error: 'Impossible de lire ce fichier.' }
  }
  const type = sniffType(head)
  if (!type || !policy.allow.includes(type.mime)) {
    return { ok: false, error: `Ce type de fichier n’est pas accepté. Formats autorisés : ${allowedText}.` }
  }
  if (file.type && norm(file.type) !== type.mime) {
    return { ok: false, error: 'Le contenu de ce fichier ne correspond pas à son type annoncé. Il a été refusé par précaution.' }
  }
  const max = policy.maxBytes[type.kind]
  if (file.size > max) {
    return { ok: false, error: `Ce fichier est trop volumineux (${formatBytes(file.size)}). Maximum pour ce format : ${formatBytes(max)}.` }
  }
  return { ok: true, type, size: file.size }
}

/**
 * URL d'aperçu d'un fichier choisi. Ouvert en double-clic (file://), les URL « blob: » sont refusées par le navigateur :
 * on passe alors par une URL « data: » (même résultat, un peu plus lourde).
 */
export function previewUrl(b: Blob): Promise<string> {
  if (typeof window === 'undefined' || window.location.protocol !== 'file:') return Promise.resolve(URL.createObjectURL(b))
  return new Promise((resolve, reject) => {
    const r = new FileReader()
    r.onload = () => resolve(String(r.result))
    r.onerror = () => reject(new Error('read_failed'))
    r.readAsDataURL(b)
  })
}
