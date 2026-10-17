/** Transforme les erreurs techniques (Supabase, réseau) en messages compréhensibles. */
const MESSAGES: Record<string, string> = {
  rate_limited: 'Vous allez trop vite. Patientez quelques instants avant de réessayer.',
  contact_unavailable: 'Cette personne ne peut pas être contactée pour le moment.',
  rules_required: 'Vous devez d’abord lire et accepter les règles de la communauté.',
  not_member: 'Vous ne faites pas partie de cette conversation.',
  not_authenticated: 'Votre session a expiré. Reconnectez-vous.',
  empty_message: 'Écrivez un message ou joignez un fichier.',
  message_too_long: 'Ce message est trop long (2 000 caractères maximum).',
  file_too_large: 'Ce fichier est trop volumineux.',
  file_type_not_allowed: 'Ce type de fichier n’est pas accepté.',
  too_many_attachments: 'Vous ne pouvez joindre qu’un nombre limité de fichiers.',
  attachment_not_found: 'Le fichier n’a pas pu être vérifié. Réessayez l’envoi.',
  invalid_attachment_path: 'Le fichier n’a pas pu être vérifié. Réessayez l’envoi.',
  invalid_rules_version: 'Les règles ont changé : rechargez la page puis acceptez-les à nouveau.',
  cannot_report_self: 'Vous ne pouvez pas vous signaler vous-même.',
  target_not_found: 'Ce contenu n’est plus disponible.',
  invalid_reason: 'Choisissez un motif de signalement.',
  storage_unavailable: 'Votre navigateur bloque l’enregistrement des fichiers sur cet appareil (navigation privée ?). Rien n’a été envoyé.',
  local_quota: 'L’espace de stockage du navigateur est plein. Supprimez des messages ou des fichiers, puis réessayez. Rien n’a été envoyé.',
  media_missing: 'Ce fichier n’est plus enregistré dans ce navigateur.',
  not_supported_local: 'Cette action n’existe pas dans la version sans compte.',
  bad_code: 'Ce code de partage n’est pas valide. Copiez-le en entier (il commence par CDP1.).',
  already_local: 'Cette personne a déjà un profil sur cet appareil : pas besoin de code.',
  wrong_recipient: 'Ce fichier est destiné à un autre profil. Changez de profil (celui de la personne à qui il est adressé) puis réessayez.',
  bad_package: 'Ce fichier n’est pas un fichier de messages Coup de Pouce valide.',
  nothing_to_export: 'Vous n’avez encore écrit aucun message à cette personne.',
  alert_limit: 'Vous avez déjà une alerte rouge active. Marquez-la « résolue » avant d’en publier une autre.',
  request_sent: 'Demande d’ajout envoyée : vous pourrez écrire dès que la personne l’aura acceptée.',
  request_refused_recently: 'Cette personne a refusé votre demande récemment. Vous pourrez réessayer dans 24 heures.',
  name_too_long: 'Ce nom est trop long (40 caractères maximum).',
  bio_too_long: 'Cette présentation est trop longue (300 caractères maximum).',
  immutable_identifier: 'Cet identifiant ne peut pas être modifié.',
}

interface MaybeError {
  message?: unknown
  code?: unknown
  status?: unknown
  name?: unknown
}

export function errorCode(e: unknown): string {
  const m = (e as MaybeError | null)?.message
  return typeof m === 'string' ? m.trim() : ''
}

export function friendlyError(e: unknown, fallback = 'Une erreur est survenue. Réessayez dans un instant.'): string {
  if (e == null) return fallback
  const err = e as MaybeError
  const msg = errorCode(e)
  if (MESSAGES[msg]) return MESSAGES[msg]
  if (/Failed to fetch|NetworkError|network request failed|Load failed|fetch failed/i.test(msg)) {
    return 'Connexion impossible. Vérifiez votre accès à Internet puis réessayez.'
  }
  if (/Invalid login credentials/i.test(msg)) return 'E-mail ou mot de passe incorrect.'
  if (/Email not confirmed/i.test(msg)) return 'Confirmez votre adresse e-mail grâce au message que nous vous avons envoyé.'
  if (/User already registered|already been registered/i.test(msg)) return 'Un compte existe déjà avec cette adresse e-mail.'
  if (/Password should be at least|password.*(short|weak)/i.test(msg)) return 'Ce mot de passe est trop faible : utilisez au moins 8 caractères.'
  if (/different from the old password|same as the old password/i.test(msg)) return 'Choisissez un mot de passe différent de l’ancien.'
  if (/rate limit|too many requests|over_email_send_rate_limit/i.test(msg)) return 'Trop de tentatives. Patientez quelques minutes avant de réessayer.'
  if (/Payload too large|exceeded the maximum allowed size|too large/i.test(msg)) return 'Ce fichier est trop volumineux.'
  if (/mime type .* is not supported|invalid_mime_type|not allowed/i.test(msg)) return 'Ce type de fichier n’est pas accepté.'
  if (err.code === '42501' || /row-level security|permission denied/i.test(msg)) return 'Action non autorisée.'
  if (err.code === '23505' || /duplicate key/i.test(msg)) return 'Cet élément existe déjà.'
  if (err.code === '23514' || /violates check constraint/i.test(msg)) return 'Certaines informations ne respectent pas les limites autorisées. Vérifiez les champs.'
  return fallback
}
