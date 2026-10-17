import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import type { Profile, Settings } from '../types'
import * as api from '../lib/api'
import { RULES_VERSION } from '../lib/config'
import { friendlyError } from '../lib/errors'
import { isConfigured } from '../lib/supabase'

interface AuthValue {
  status: 'loading' | 'anon' | 'authed' | 'error'
  userId: string | null
  email: string | null
  profile: Profile | null
  settings: Settings | null
  rulesOk: boolean
  isModerator: boolean
  errorMessage: string | null
  reload: () => void
  patchProfile: (p: Profile) => void
  patchSettings: (s: Partial<Settings>) => void
  acceptRules: () => Promise<void>
  signOut: () => Promise<void>
}

const Ctx = createContext<AuthValue | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [checked, setChecked] = useState(!isConfigured)
  const [userId, setUserId] = useState<string | null>(null)
  const [email, setEmail] = useState<string | null>(null)
  const [profile, setProfile] = useState<Profile | null>(null)
  const [settings, setSettings] = useState<Settings | null>(null)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [isModerator, setIsModerator] = useState(false)
  const [tick, setTick] = useState(0)

  useEffect(() => {
    if (!isConfigured) return
    let alive = true
    api.getSession().then(
      (s) => {
        if (!alive) return
        setUserId(s?.user.id ?? null)
        setEmail(s?.user.email ?? null)
        setChecked(true)
      },
      () => alive && setChecked(true),
    )
    // Ne rien « await » dans ce rappel (risque de blocage connu de supabase-js) : on met seulement l'état à jour.
    const off = api.onAuthChange((s) => {
      setUserId(s?.user.id ?? null)
      setEmail(s?.user.email ?? null)
      setChecked(true)
    })
    return () => {
      alive = false
      off()
    }
  }, [])

  useEffect(() => {
    if (!userId) {
      setProfile(null)
      setSettings(null)
      setIsModerator(false)
      setErrorMessage(null)
      return
    }
    let alive = true
    setErrorMessage(null)
    Promise.all([api.fetchProfile(userId), api.fetchSettings(userId)]).then(
      ([p, s]) => {
        if (!alive) return
        if (!p) setErrorMessage('Votre profil est introuvable. Déconnectez-vous puis reconnectez-vous.')
        setProfile(p)
        setSettings(s)
        // Sert uniquement à afficher le lien « Modération » ; la sécurité réelle est dans la base (RLS).
        api.amIModerator().then((m) => alive && setIsModerator(m), () => alive && setIsModerator(false))
      },
      (e: unknown) => alive && setErrorMessage(friendlyError(e, 'Impossible de charger votre profil.')),
    )
    return () => {
      alive = false
    }
  }, [userId, tick])

  const reload = useCallback(() => setTick((t) => t + 1), [])
  const patchProfile = useCallback((p: Profile) => setProfile(p), [])
  const patchSettings = useCallback((s: Partial<Settings>) => setSettings((prev) => (prev ? { ...prev, ...s } : prev)), [])

  const acceptRules = useCallback(async () => {
    await api.acceptRules(RULES_VERSION)
    setSettings((prev) => (prev ? { ...prev, rules_version: RULES_VERSION, rules_accepted_at: new Date().toISOString() } : prev))
  }, [])

  const signOut = useCallback(async () => {
    await api.signOut()
    setUserId(null)
    setEmail(null)
  }, [])

  const status: AuthValue['status'] = !checked ? 'loading' : !userId ? 'anon' : errorMessage ? 'error' : profile && settings ? 'authed' : 'loading'

  const value = useMemo<AuthValue>(
    () => ({
      status, userId, email, profile, settings, errorMessage,
      rulesOk: settings?.rules_version === RULES_VERSION,
      isModerator,
      reload, patchProfile, patchSettings, acceptRules, signOut,
    }),
    [status, userId, email, profile, settings, errorMessage, isModerator, reload, patchProfile, patchSettings, acceptRules, signOut],
  )
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}

export function useAuth(): AuthValue {
  const v = useContext(Ctx)
  if (!v) throw new Error('AuthProvider manquant')
  return v
}
