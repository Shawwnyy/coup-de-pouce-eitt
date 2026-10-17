import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { isSecretKey } from './keys.ts'

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined

/**
 * Seule la clé « anon » (publique) est utilisée ici. La sécurité des données repose sur les règles
 * RLS de la base (supabase/migrations), jamais sur le secret d'une clé. Ne mettez JAMAIS la clé
 * « service_role » dans ce projet.
 */
/** true si quelqu'un a collé une clé secrète (service_role) à la place de la clé « anon » : on refuse de démarrer. */
export const secretKeyDetected: boolean = Boolean(anonKey && isSecretKey(anonKey))

export const isConfigured: boolean = Boolean(
  url && anonKey && /^https?:\/\//.test(url) && !url.includes('VOTRE-PROJET') && anonKey !== 'votre-cle-anon-publique' && !secretKeyDetected,
)

export const supabase: SupabaseClient | null = isConfigured
  ? createClient(url as string, anonKey as string, {
      auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true, flowType: 'pkce' },
      realtime: { params: { eventsPerSecond: 10 } },
    })
  : null
