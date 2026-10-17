import { useState } from 'react'
import { Alert, EmptyState, Icon, PageLoading } from '../components/ui'
import { useAuth } from '../context/AuthContext'
import * as api from '../lib/api'
import { REPORT_REASONS, REPORT_STATUS_LABEL } from '../lib/config'
import { friendlyError } from '../lib/errors'
import { formatDateTime } from '../lib/format'
import { useAsync, useDocumentTitle } from '../lib/hooks'
import { Link } from '../lib/router'
import type { ReportRow, ReportStatus } from '../types'

const ORDER: ReportStatus[] = ['open', 'in_review', 'resolved', 'dismissed']
const reasonLabel = (id: string) => REPORT_REASONS.find((r) => r.id === id)?.label ?? id

/** Actions proposées selon le statut courant (chaque décision est prise par une personne : aucune sanction automatique). */
const ACTIONS: Record<ReportStatus, { to: ReportStatus; label: string; icon: string; tone?: 'primary' }[]> = {
  open: [
    { to: 'in_review', label: 'Prendre en charge', icon: 'eye', tone: 'primary' },
    { to: 'dismissed', label: 'Rejeter', icon: 'x' },
  ],
  in_review: [
    { to: 'resolved', label: 'Marquer comme traité', icon: 'check', tone: 'primary' },
    { to: 'dismissed', label: 'Rejeter', icon: 'x' },
  ],
  resolved: [{ to: 'open', label: 'Rouvrir', icon: 'refresh' }],
  dismissed: [{ to: 'open', label: 'Rouvrir', icon: 'refresh' }],
}

function ReportCard({ r, onChange, busy }: { r: ReportRow; onChange: (id: string, s: ReportStatus) => void; busy: boolean }) {
  return (
    <article className="card stack report-card" aria-label={`Signalement du ${formatDateTime(r.created_at)}`}>
      <div className="row between">
        <div className="row">
          <span className={`badge badge-report-${r.status}`}>{REPORT_STATUS_LABEL[r.status]}</span>
          <strong>{reasonLabel(r.reason)}</strong>
        </div>
        <time className="muted small" dateTime={r.created_at}>{formatDateTime(r.created_at)}</time>
      </div>
      <dl className="report-meta">
        <div><dt>Signalé par</dt><dd className="mono">{r.reporter?.public_id ?? 'compte supprimé'}</dd></div>
        <div>
          <dt>Personne concernée</dt>
          <dd className="mono">
            {r.reported_user_id ? <Link to={`/profil/${r.reported_user_id}`}>{r.reported_public_id ?? 'profil'}</Link> : (r.reported_public_id ?? 'compte supprimé')}
          </dd>
        </div>
        <div><dt>Type de contenu</dt><dd>{r.message_id ? 'Message privé' : r.help_request_id ? 'Demande d’aide' : 'Profil'}</dd></div>
      </dl>
      {r.content_snapshot && (
        <div>
          <p className="small strong">Extrait conservé au moment du signalement</p>
          {/* Texte brut : jamais interprété comme du HTML ni transformé en lien cliquable. */}
          <blockquote className="snapshot">{r.content_snapshot}</blockquote>
        </div>
      )}
      {r.details && (
        <div>
          <p className="small strong">Précisions de la personne qui signale</p>
          <p className="rich">{r.details}</p>
        </div>
      )}
      <div className="row">
        {ACTIONS[r.status].map((a) => (
          <button key={a.to} type="button" className={`btn btn-sm${a.tone === 'primary' ? ' btn-primary' : ''}`} disabled={busy} onClick={() => onChange(r.id, a.to)}>
            <Icon name={a.icon} size={16} /> {a.label}
          </button>
        ))}
      </div>
    </article>
  )
}

export default function ModerationPage() {
  useDocumentTitle('Modération')
  const { isModerator } = useAuth()
  const [filter, setFilter] = useState<ReportStatus | ''>('open')
  const [busyId, setBusyId] = useState<string | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)
  const list = useAsync(() => (isModerator ? api.listReports(filter) : Promise.resolve([])), [filter, isModerator])

  if (!isModerator) {
    return (
      <div className="page narrow">
        <EmptyState icon="shield" title="Accès réservé" action={<Link to="/" className="btn btn-primary">Retour à l’accueil</Link>}>
          Cet écran est réservé aux personnes désignées pour la modération. Pour signaler un problème, utilisez le bouton « Signaler » sur un message, un profil ou une demande.
        </EmptyState>
      </div>
    )
  }

  async function change(id: string, status: ReportStatus) {
    setBusyId(id)
    setActionError(null)
    try {
      await api.setReportStatus(id, status)
      list.reload()
    } catch (e) {
      setActionError(friendlyError(e))
    } finally {
      setBusyId(null)
    }
  }

  const rows = list.data ?? []
  return (
    <div className="page">
      <header className="page-head">
        <h1><Icon name="shield" /> Modération</h1>
        <p className="muted">Signalements reçus, visibles uniquement par les comptes désignés comme modérateurs. Aucune sanction n’est appliquée automatiquement : chaque décision est prise par une personne.</p>
      </header>

      <div className="row" role="tablist" aria-label="Filtrer par statut">
        {([...ORDER, ''] as (ReportStatus | '')[]).map((s) => (
          <button key={s || 'all'} type="button" role="tab" aria-selected={filter === s} className={`chip filter-chip${filter === s ? ' selected' : ''}`} onClick={() => setFilter(s)}>
            {s ? REPORT_STATUS_LABEL[s] : 'Tous'}
          </button>
        ))}
      </div>

      <div aria-live="polite" className="stack">
        {list.error && <Alert kind="error">{list.error}</Alert>}
        {actionError && <Alert kind="error">{actionError}</Alert>}
        {list.loading && !list.data && <PageLoading />}
        {!list.error && !list.loading && rows.length === 0 && (
          <EmptyState icon="check" title="Aucun signalement dans cette catégorie">Rien à traiter ici pour le moment.</EmptyState>
        )}
        {rows.map((r) => <ReportCard key={r.id} r={r} onChange={change} busy={busyId === r.id} />)}
        {rows.length === 100 && <p className="hint">Les 100 signalements les plus récents sont affichés.</p>}
      </div>
    </div>
  )
}
