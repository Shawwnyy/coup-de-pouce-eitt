import { useMemo, useState } from 'react'
import { QUOTES, quoteIndexFor } from '../lib/quotes'
import { Icon } from './ui'

export function QuoteCard() {
  const today = useMemo(() => quoteIndexFor(new Date()), [])
  const [idx, setIdx] = useState(today)
  const dateLabel = useMemo(() => new Intl.DateTimeFormat('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' }).format(new Date()), [])
  return (
    <figure className="card quote">
      <figcaption className="eyebrow">
        <Icon name="quote" size={16} /> {idx === today ? `Pensée du jour · ${dateLabel}` : 'Une autre pensée'}
      </figcaption>
      <blockquote>« {QUOTES[idx]} »</blockquote>
      <p className="hint">Pensée originale écrite pour Coup de Pouce.</p>
      <div className="row">
        <button type="button" className="btn btn-sm" onClick={() => setIdx((i) => (i + 1) % QUOTES.length)}>
          <Icon name="refresh" size={16} /> Une autre pensée
        </button>
        {idx !== today && (
          <button type="button" className="btn btn-sm btn-ghost" onClick={() => setIdx(today)}>
            Revenir à celle du jour
          </button>
        )}
      </div>
    </figure>
  )
}
