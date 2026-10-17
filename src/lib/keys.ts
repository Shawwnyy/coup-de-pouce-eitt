/**
 * Garde-fou : refuse d'utiliser une clé SECRÈTE (service_role) dans le navigateur, même par erreur de copier-coller.
 * Une clé « anon » est publique par conception ; une clé « service_role » donne un accès total à la base.
 */
export function isSecretKey(key: string): boolean {
  const k = key.trim()
  if (k.startsWith('sb_secret_')) return true // nouveau format de clés Supabase
  const parts = k.split('.')
  if (parts.length !== 3) return false
  try {
    const b64 = parts[1].replace(/-/g, '+').replace(/_/g, '/')
    const json = typeof atob === 'function' ? atob(b64) : Buffer.from(b64, 'base64').toString('utf8')
    const payload = JSON.parse(json) as { role?: string }
    return payload.role === 'service_role'
  } catch {
    return false
  }
}
