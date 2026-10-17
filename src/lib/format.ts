export function formatBytes(n: number): string {
  if (!Number.isFinite(n) || n < 0) return '—'
  if (n < 1024) return `${n} o`
  if (n < 1024 * 1024) return `${Math.round(n / 1024)} Ko`
  return `${(n / (1024 * 1024)).toFixed(n < 10 * 1024 * 1024 ? 1 : 0).replace('.', ',')} Mo`
}

const dtf = new Intl.DateTimeFormat('fr-FR', { dateStyle: 'long', timeStyle: 'short' })
const df = new Intl.DateTimeFormat('fr-FR', { dateStyle: 'long' })
const tf = new Intl.DateTimeFormat('fr-FR', { hour: '2-digit', minute: '2-digit' })

export const formatDateTime = (iso: string) => dtf.format(new Date(iso))
export const formatDate = (iso: string) => df.format(new Date(iso))
export const formatTime = (iso: string) => tf.format(new Date(iso))

function startOfDay(d: Date): number {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime()
}

/** « Aujourd'hui », « Hier » ou la date complète. */
export function formatDayLabel(iso: string, now: Date = new Date()): string {
  const diff = Math.round((startOfDay(now) - startOfDay(new Date(iso))) / 86_400_000)
  if (diff === 0) return 'Aujourd’hui'
  if (diff === 1) return 'Hier'
  return df.format(new Date(iso))
}

export function dayKey(iso: string): string {
  const d = new Date(iso)
  return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`
}

/** Date courte pour les listes : l'heure aujourd'hui, sinon jour/mois. */
export function formatShort(iso: string, now: Date = new Date()): string {
  const d = new Date(iso)
  if (startOfDay(d) === startOfDay(now)) return tf.format(d)
  return new Intl.DateTimeFormat('fr-FR', { day: 'numeric', month: 'short' }).format(d)
}

export function displayName(p: { display_name: string | null; public_id: string } | null | undefined): string {
  if (!p) return 'Utilisateur'
  return p.display_name?.trim() || p.public_id
}

export function initials(p: { display_name: string | null; public_id: string } | null | undefined): string {
  const base = (p?.display_name?.trim() || p?.public_id || '?').replace(/^User#/i, 'U')
  const parts = base.split(/\s+/).filter(Boolean)
  const s = parts.length > 1 ? parts[0][0] + parts[1][0] : base.slice(0, 2)
  return s.toUpperCase()
}
