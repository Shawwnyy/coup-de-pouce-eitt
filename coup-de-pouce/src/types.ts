export type ThemeName = 'light' | 'dark' | 'eitt' | 'custom'
export type BgStyle = 'none' | 'grid' | 'aurora' | 'gradient' | 'image'

export interface CustomTheme {
  primary: string
  secondary: string
  background: string
  card: string
  text: string
  bgStyle: BgStyle
}

export interface NotificationPrefs {
  inapp_indicator: boolean
  event_messages: boolean
  event_help_requests: boolean
  sound: boolean
  visual_alerts: boolean
  browser: boolean
  email: boolean
}

export interface Profile {
  id: string
  public_id: string
  display_name: string | null
  avatar_path: string | null
  bio: string | null
  created_at: string
}

export interface Settings {
  theme: ThemeName
  theme_custom: Partial<CustomTheme>
  notification_preferences: Partial<NotificationPrefs>
  allow_contact: boolean
  searchable: boolean
  rules_accepted_at: string | null
  rules_version: string | null
}

export interface SearchResult {
  id: string
  public_id: string
  display_name: string | null
  avatar_path: string | null
  bio: string | null
  can_contact: boolean
}

export interface ConversationSummary {
  conversation_id: string
  other_id: string
  other_public_id: string
  other_display_name: string | null
  other_avatar_path: string | null
  last_message_at: string | null
  last_message_content: string | null
  last_message_sender: string | null
  last_has_attachment: boolean
  unread_count: number
  blocked_by_me: boolean
}

export interface Attachment {
  id: string
  storage_path: string
  file_name: string
  mime_type: string
  file_size: number
}

export interface Message {
  id: string
  conversation_id: string
  sender_id: string
  content: string
  created_at: string
  message_attachments: Attachment[]
}

export type HelpStatus = 'open' | 'in_progress' | 'resolved'

export interface HelpRequest {
  id: string
  author_id: string
  title: string
  description: string
  category: string
  status: HelpStatus
  image_path: string | null
  /** « Alerte rouge » : demande marquée urgente (version locale uniquement). */
  urgent?: boolean
  created_at: string
  author: Pick<Profile, 'public_id' | 'display_name' | 'avatar_path'> | null
}

export type ReportKind = 'message' | 'profile' | 'help_request'
export type ReportReason =
  | 'harcelement'
  | 'arnaque'
  | 'donnees_personnelles'
  | 'contenu_inapproprie'
  | 'spam'
  | 'usurpation'
  | 'autre'

export interface BlockedUser {
  blocked_id: string
  created_at: string
  profile: Pick<Profile, 'id' | 'public_id' | 'display_name' | 'avatar_path'> | null
}

export type ReportStatus = 'open' | 'in_review' | 'resolved' | 'dismissed'

export interface ReportRow {
  id: string
  reason: ReportReason
  details: string | null
  content_snapshot: string | null
  status: ReportStatus
  created_at: string
  reported_public_id: string | null
  reported_user_id: string | null
  message_id: string | null
  help_request_id: string | null
  reporter: { public_id: string; display_name: string | null } | null
}
