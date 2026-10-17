import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import type { NotificationPrefs } from '../types'
import * as api from '../lib/api'
import type { IncomingMessage } from '../lib/api'
import {
  DEFAULT_NOTIFICATION_PREFS, askBrowserPermission, browserPermission, mergePrefs, playBeep, showBrowserNotification,
  type BrowserPermission,
} from '../lib/notify'
import { isConfigured } from '../lib/supabase'
import { useAuth } from './AuthContext'

export interface Toast {
  id: number
  title: string
  body: string
}

interface NotifyValue {
  prefs: NotificationPrefs
  updatePrefs: (patch: Partial<NotificationPrefs>) => Promise<void>
  permission: BrowserPermission
  enableBrowserNotifications: () => Promise<void>
  unreadMessages: number
  refreshUnread: () => void
  newHelpRequests: number
  clearNewHelp: () => void
  toasts: Toast[]
  dismissToast: (id: number) => void
  setActiveConversation: (id: string | null) => void
  onIncomingMessage: (cb: (m: IncomingMessage) => void) => () => void
}

const Ctx = createContext<NotifyValue | null>(null)

export function NotifyProvider({ children }: { children: ReactNode }) {
  const { userId, settings, rulesOk } = useAuth()
  const [prefs, setPrefs] = useState<NotificationPrefs>(DEFAULT_NOTIFICATION_PREFS)
  const [permission, setPermission] = useState<BrowserPermission>(browserPermission())
  const [unread, setUnread] = useState(0)
  const [newHelp, setNewHelp] = useState(0)
  const [toasts, setToasts] = useState<Toast[]>([])
  const prefsRef = useRef(prefs)
  prefsRef.current = prefs
  const active = useRef<string | null>(null)
  const listeners = useRef(new Set<(m: IncomingMessage) => void>())
  const toastId = useRef(0)

  useEffect(() => {
    setPrefs(mergePrefs(settings?.notification_preferences))
  }, [settings])

  const refreshUnread = useCallback(() => {
    if (!isConfigured || !userId) return
    api.listConversations().then(
      (rows) => setUnread(rows.reduce((n, c) => n + (c.unread_count || 0), 0)),
      () => undefined,
    )
  }, [userId])

  const emit = useCallback((kind: 'message' | 'help', title: string, body: string) => {
    const p = prefsRef.current
    if (kind === 'message' && !p.event_messages) return
    if (kind === 'help' && !p.event_help_requests) return
    if (p.sound) playBeep()
    if (p.visual_alerts && document.visibilityState === 'visible') {
      const id = ++toastId.current
      setToasts((t) => [...t.slice(-2), { id, title, body }])
      window.setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 7000)
    }
    if (p.browser && document.visibilityState === 'hidden') showBrowserNotification(title, body, kind, !p.sound)
  }, [])

  useEffect(() => {
    if (!isConfigured || !userId || !rulesOk) {
      setUnread(0)
      setNewHelp(0)
      return
    }
    refreshUnread()
    const offMsg = api.subscribeMessages((m) => {
      listeners.current.forEach((l) => l(m))
      if (m.sender_id === userId) return
      refreshUnread()
      const watching = active.current === m.conversation_id && document.visibilityState === 'visible'
      if (!watching) emit('message', 'Nouveau message', 'Vous avez reçu un message privé sur Coup de Pouce.')
    })
    const offHelp = api.subscribeHelp((h) => {
      if (h.author_id === userId) return
      if (prefsRef.current.event_help_requests) setNewHelp((n) => n + 1)
      emit('help', 'Nouvelle demande d’aide', 'Une nouvelle demande vient d’être publiée.')
    })
    const onFocus = () => refreshUnread()
    window.addEventListener('focus', onFocus)
    return () => {
      offMsg()
      offHelp()
      window.removeEventListener('focus', onFocus)
    }
  }, [userId, rulesOk, refreshUnread, emit])

  const updatePrefs = useCallback(
    async (patch: Partial<NotificationPrefs>) => {
      if (!userId) return
      const before = prefsRef.current
      const next = mergePrefs({ ...before, ...patch })
      setPrefs(next)
      try {
        await api.updateSettings(userId, { notification_preferences: next })
      } catch (e) {
        setPrefs(before)
        throw e
      }
    },
    [userId],
  )

  const enableBrowserNotifications = useCallback(async () => {
    const result = await askBrowserPermission()
    setPermission(result)
    if (result === 'granted') await updatePrefs({ browser: true })
    else await updatePrefs({ browser: false })
  }, [updatePrefs])

  const value = useMemo<NotifyValue>(
    () => ({
      prefs, updatePrefs, permission, enableBrowserNotifications,
      unreadMessages: unread, refreshUnread,
      newHelpRequests: newHelp, clearNewHelp: () => setNewHelp(0),
      toasts, dismissToast: (id) => setToasts((t) => t.filter((x) => x.id !== id)),
      setActiveConversation: (id) => { active.current = id },
      onIncomingMessage: (cb) => {
        listeners.current.add(cb)
        return () => { listeners.current.delete(cb) }
      },
    }),
    [prefs, updatePrefs, permission, enableBrowserNotifications, unread, refreshUnread, newHelp, toasts],
  )
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}

export function useNotify(): NotifyValue {
  const v = useContext(Ctx)
  if (!v) throw new Error('NotifyProvider manquant')
  return v
}
