import { useEffect, useState } from 'react'
import { Icon } from '../components/ui'
import { useAuth } from '../context/AuthContext'
import { Link, useLocation } from '../lib/router'
import type { HelpRequest } from '../types'
import { listRedAlerts, subscribeHelp } from './localApi'

const KEY = 'cdp.local.alerts.hidden'
const readHidden = (): string[] => {
  try {
    return JSON.parse(window.sessionStorage.getItem(KEY) ?? '[]') as string[]
  } catch {
    return []
  }
}

/** Bandeau ROUGE en haut de page : demandes d'aide marquées « Alerte rouge » par d'autres profils, tant qu'elles ne sont pas résolues. */
export function RedAlertBanner() {
  const { userId } = useAuth()
  const loc = useLocation()
  const [alerts, setAlerts] = useState<HelpRequest[]>([])
  const [hidden, setHidden] = useState<string[]>(readHidden)

  useEffect(() => {
    const refresh = () => setAlerts(listRedAlerts(userId ?? undefined))
    refresh()
    const off = subscribeHelp(refresh)
    const t = window.setInterval(refresh, 4000)
    return () => {
      off()
      window.clearInterval(t)
    }
  }, [userId, loc.path])

  const shown = alerts.filter((a) => !hidden.includes(a.id))
  if (!shown.length) return null
  const first = shown[0]
  const hide = () => {
    const next = [...hidden, ...shown.map((a) => a.id)]
    setHidden(next)
    try {
      window.sessionStorage.setItem(KEY, JSON.stringify(next))
    } catch { /* ignoré */ }
  }
  return (
    <div className="red-alert-banner" role="alert">
      <Icon name="alert" size={20} />
      <span className="grow">
        <strong>Alerte rouge{shown.length > 1 ? ` (${shown.length})` : ''}</strong> — {first.author?.display_name ?? first.author?.public_id ?? 'Un utilisateur'} ({first.author?.public_id}) : « {first.title} »
      </span>
      <Link to={`/entraide/${first.id}`} className="btn btn-sm red-alert-btn">Voir la demande</Link>
      <button type="button" className="btn btn-sm red-alert-btn" onClick={hide} aria-label="Masquer l’alerte rouge pour cette session">Masquer</button>
    </div>
  )
}
