import type { HelpStatus, ReportReason, ReportStatus } from '../types.ts'

/** Doit correspondre à private.current_rules_version() dans supabase/migrations. */
export const RULES_VERSION = '2026-10-17'
export const RULES_UPDATED_LABEL = '17 octobre 2026'
/** Passez à true une fois la page « Confidentialité » relue et complétée par l'association (retire le bandeau d'avertissement). */
export const LEGAL_COMPLETED = false
export const EITT_URL = 'https://eitt.webnode.fr'

const env = ((import.meta as unknown as { env?: Record<string, string | undefined> }).env ?? {}) as Record<string, string | undefined>
const MB = 1024 * 1024
/** Les limites du navigateur peuvent seulement être RÉDUITES : le serveur impose 5 Mo (image/GIF) et 20 Mo (vidéo). */
function limitMb(value: string | undefined, serverMax: number): number {
  const n = Number(value)
  return (Number.isFinite(n) && n > 0 ? Math.min(n, serverMax) : serverMax) * MB
}

export const LIMITS = {
  imageBytes: limitMb(env.VITE_MAX_IMAGE_MB, 5),
  gifBytes: limitMb(env.VITE_MAX_GIF_MB, 5),
  videoBytes: limitMb(env.VITE_MAX_VIDEO_MB, 20),
  avatarBytes: 1 * MB,
  messageChars: 2000,
} as const

export const CATEGORIES = [
  { id: 'ordinateur', label: 'Ordinateur', icon: 'laptop' },
  { id: 'smartphone', label: 'Smartphone et tablette', icon: 'phone' },
  { id: 'internet', label: 'Internet et réseaux', icon: 'globe' },
  { id: 'logiciels', label: 'Logiciels et applications', icon: 'apps' },
  { id: 'cybersecurite', label: 'Cybersécurité', icon: 'shield' },
  { id: 'demarches', label: 'Démarches administratives numériques', icon: 'file' },
  { id: 'bureautique', label: 'Bureautique', icon: 'doc' },
  { id: 'programmation', label: 'Programmation', icon: 'code' },
  { id: 'ia', label: 'Intelligence artificielle', icon: 'spark' },
  { id: 'autre', label: 'Autre', icon: 'dots' },
] as const

export function categoryLabel(id: string): string {
  return CATEGORIES.find((c) => c.id === id)?.label ?? 'Autre'
}

export const STATUS_LABEL: Record<HelpStatus, string> = {
  open: 'Ouverte',
  in_progress: 'En cours',
  resolved: 'Résolue',
}

export const REPORT_STATUS_LABEL: Record<ReportStatus, string> = {
  open: 'Ouvert',
  in_review: 'En cours d’examen',
  resolved: 'Traité',
  dismissed: 'Rejeté',
}

export const REPORT_REASONS: { id: ReportReason; label: string }[] = [
  { id: 'harcelement', label: 'Harcèlement, insultes ou menaces' },
  { id: 'arnaque', label: 'Arnaque, phishing ou lien dangereux' },
  { id: 'donnees_personnelles', label: 'Données personnelles ou privées publiées' },
  { id: 'usurpation', label: 'Usurpation d’identité / faux profil' },
  { id: 'contenu_inapproprie', label: 'Contenu inapproprié ou illicite' },
  { id: 'spam', label: 'Spam ou publicité' },
  { id: 'autre', label: 'Autre motif' },
]
