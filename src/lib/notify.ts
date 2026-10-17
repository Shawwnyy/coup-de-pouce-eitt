import type { NotificationPrefs } from '../types.ts'

/** Tout est désactivé par défaut, sauf le petit indicateur discret dans l'interface. */
export const DEFAULT_NOTIFICATION_PREFS: NotificationPrefs = {
  inapp_indicator: true,
  event_messages: true,
  event_help_requests: false,
  sound: false,
  visual_alerts: false,
  browser: false,
  email: false,
}

export function mergePrefs(raw: Partial<NotificationPrefs> | null | undefined): NotificationPrefs {
  const out: NotificationPrefs = { ...DEFAULT_NOTIFICATION_PREFS }
  if (raw && typeof raw === 'object') {
    for (const k of Object.keys(out) as (keyof NotificationPrefs)[]) {
      if (typeof raw[k] === 'boolean') out[k] = raw[k] as boolean
    }
  }
  out.email = false // aucun envoi d'e-mail n'existe dans cette version : l'option reste inactive
  return out
}

export type BrowserPermission = 'unsupported' | 'default' | 'granted' | 'denied'

export function browserPermission(): BrowserPermission {
  if (typeof Notification === 'undefined') return 'unsupported'
  return Notification.permission as BrowserPermission
}

/**
 * Demande l'autorisation au navigateur. À n'appeler QUE depuis un clic de l'utilisateur
 * sur le bouton « Activer ». Ne jamais l'appeler au chargement de la page.
 */
export async function askBrowserPermission(): Promise<BrowserPermission> {
  if (typeof Notification === 'undefined') return 'unsupported'
  if (Notification.permission !== 'default') return Notification.permission as BrowserPermission
  const result = await Notification.requestPermission()
  return result as BrowserPermission
}

export function showBrowserNotification(title: string, body: string, tag: string, silent: boolean): void {
  if (browserPermission() !== 'granted') return
  try {
    new Notification(title, { body, tag, silent, icon: undefined })
  } catch {
    /* certains navigateurs mobiles exigent un service worker : on ignore */
  }
}

let audio: AudioContext | null = null
/** Bip très court, uniquement si l'utilisateur a activé les sons. */
export function playBeep(): void {
  try {
    const Ctx = window.AudioContext
    if (!Ctx) return
    audio = audio ?? new Ctx()
    const osc = audio.createOscillator()
    const gain = audio.createGain()
    osc.type = 'sine'
    osc.frequency.value = 880
    gain.gain.setValueAtTime(0.0001, audio.currentTime)
    gain.gain.exponentialRampToValueAtTime(0.08, audio.currentTime + 0.02)
    gain.gain.exponentialRampToValueAtTime(0.0001, audio.currentTime + 0.25)
    osc.connect(gain).connect(audio.destination)
    osc.start()
    osc.stop(audio.currentTime + 0.26)
  } catch {
    /* audio indisponible */
  }
}
