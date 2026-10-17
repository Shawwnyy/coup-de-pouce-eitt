import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import type { CustomTheme, ThemeName } from '../types'
import * as api from '../lib/api'
import { DEFAULT_CUSTOM, applyTheme, loadLocalPrefs, sanitizeCustom, saveLocalPrefs, isThemeName } from '../lib/theme'
import { useAuth } from './AuthContext'

interface ThemeValue {
  theme: ThemeName
  custom: CustomTheme
  /** Applique, enregistre sur cet appareil et (si connecté) dans le profil. */
  setAppearance: (theme: ThemeName, custom?: CustomTheme) => Promise<void>
  /** À appeler après avoir changé l'image de fond locale. */
  refreshBackground: () => void
}

const Ctx = createContext<ThemeValue | null>(null)

export function ThemeProvider({ children }: { children: ReactNode }) {
  const initial = useRef(loadLocalPrefs())
  const [theme, setTheme] = useState<ThemeName>(initial.current?.theme ?? 'eitt')
  const [custom, setCustom] = useState<CustomTheme>(initial.current?.custom ?? DEFAULT_CUSTOM)
  const [bgVersion, setBgVersion] = useState(0)
  const { userId, settings } = useAuth()
  const syncedFor = useRef<string | null>(null)

  useEffect(() => {
    applyTheme(theme, custom)
  }, [theme, custom, bgVersion])

  // À la connexion : le profil fait foi (préférences retrouvées d'un appareil à l'autre).
  // Exception : un visiteur qui avait choisi un thème avant de se connecter sur un profil encore « neuf ».
  useEffect(() => {
    if (!userId) {
      syncedFor.current = null
      return
    }
    if (!settings || syncedFor.current === userId) return
    syncedFor.current = userId
    const pristine = settings.theme === 'eitt' && Object.keys(settings.theme_custom ?? {}).length === 0
    const local = initial.current
    if (pristine && local && (local.theme !== 'eitt' || local.custom.primary !== DEFAULT_CUSTOM.primary)) {
      api.updateSettings(userId, { theme: local.theme, theme_custom: local.custom }).catch(() => undefined)
      return
    }
    const t = isThemeName(settings.theme) ? settings.theme : 'eitt'
    const c = sanitizeCustom(settings.theme_custom)
    setTheme(t)
    setCustom(c)
    saveLocalPrefs(t, c)
  }, [userId, settings])

  const setAppearance = useCallback(
    async (t: ThemeName, c?: CustomTheme) => {
      const nextCustom = c ?? custom
      setTheme(t)
      setCustom(nextCustom)
      saveLocalPrefs(t, nextCustom)
      if (userId) await api.updateSettings(userId, { theme: t, theme_custom: nextCustom })
    },
    [custom, userId],
  )
  const refreshBackground = useCallback(() => setBgVersion((v) => v + 1), [])

  const value = useMemo(() => ({ theme, custom, setAppearance, refreshBackground }), [theme, custom, setAppearance, refreshBackground])
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}

export function useTheme(): ThemeValue {
  const v = useContext(Ctx)
  if (!v) throw new Error('ThemeProvider manquant')
  return v
}
