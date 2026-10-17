import { useEffect, useState } from 'react'
import { minuteNumber, QUOTES, quoteIndexForMinute } from '../lib/quotes'
import { Icon } from './ui'

const HIDE_KEY = 'cdp.quote.hidden'
const EVT = 'cdp:quote-visibility'

function readHidden(): boolean {
  try {
    return window.localStorage.getItem(HIDE_KEY) === '1'
  } catch {
    return false
  }
}

/** Citations masquées ou non (préférence de cet appareil, retenue dans le navigateur ; sans stockage, valable jusqu'au rechargement). */
export function useQuoteHidden(): [boolean, (hidden: boolean) => void] {
  const [hidden, setHidden] = useState(readHidden)
  useEffect(() => {
    const on = () => setHidden(readHidden())
    window.addEventListener(EVT, on)
    window.addEventListener('storage', on)
    return () => {
      window.removeEventListener(EVT, on)
      window.removeEventListener('storage', on)
    }
  }, [])
  return [
    hidden,
    (h) => {
      try {
        window.localStorage.setItem(HIDE_KEY, h ? '1' : '0')
      } catch { /* ignoré */ }
      setHidden(h)
      window.dispatchEvent(new Event(EVT))
    },
  ]
}

/** Numéro de la minute en cours, mis à jour tout seul à chaque changement de minute. */
function useMinute(): number {
  const [minute, setMinute] = useState(() => minuteNumber())
  useEffect(() => {
    const t = window.setInterval(() => setMinute(minuteNumber()), 1000)
    return () => window.clearInterval(t)
  }, [])
  return minute
}

/**
 * Une pensée qui change CHAQUE MINUTE : à droite de l'écran sur ordinateur (écran large), en bande au-dessus de la barre du bas sur téléphone.
 * Pensées originales écrites pour Coup de Pouce, jamais attribuées à une personnalité.
 */
export function QuotePanel() {
  const minute = useMinute()
  const [hidden, setHidden] = useQuoteHidden()
  if (hidden) return null
  return (
    <aside className="quote-panel" aria-label="Pensée de la minute" aria-live="off">
      <div className="quote-panel-head">
        <span className="eyebrow"><Icon name="quote" size={14} /> <span className="quote-eyebrow-text">Pensée · change chaque minute</span></span>
        <button type="button" className="icon-btn quote-panel-x" onClick={() => setHidden(true)} aria-label="Masquer les pensées" title="Masquer (réaffichable en bas de page)">
          <Icon name="x" size={14} />
        </button>
      </div>
      <p className="quote-panel-text" key={minute}>« {QUOTES[quoteIndexForMinute(minute)]} »</p>
      <p className="quote-panel-note">Pensée originale écrite pour Coup de Pouce.</p>
    </aside>
  )
}

/** Lien de pied de page pour réafficher les pensées masquées. */
export function QuoteRestore() {
  const [hidden, setHidden] = useQuoteHidden()
  if (!hidden) return null
  return <button type="button" className="link-btn" onClick={() => setHidden(false)}>Afficher les pensées</button>
}
