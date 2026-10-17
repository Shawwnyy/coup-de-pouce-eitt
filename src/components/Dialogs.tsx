import { useEffect, useId, useRef, useState, type ReactNode } from 'react'
import type { FormEvent } from 'react'
import * as api from '../lib/api'
import { REPORT_REASONS } from '../lib/config'
import { friendlyError } from '../lib/errors'
import type { ReportKind, ReportReason } from '../types'
import { Alert, Icon } from './ui'

/** Boîte de dialogue native <dialog> : focus piégé, Échap pour fermer, lecteurs d'écran informés. */
export function Dialog({ title, onClose, children, wide }: { title: string; onClose: () => void; children: ReactNode; wide?: boolean }) {
  const ref = useRef<HTMLDialogElement>(null)
  const id = useId()
  const closed = useRef(false)
  useEffect(() => {
    const d = ref.current
    if (d && !d.open) d.showModal()
    return () => {
      closed.current = true
      if (d?.open) d.close()
    }
  }, [])
  return (
    <dialog
      ref={ref}
      className={`dialog${wide ? ' dialog-wide' : ''}`}
      aria-labelledby={id}
      onClose={() => !closed.current && onClose()}
      onClick={(e) => e.target === ref.current && onClose()}
    >
      <div className="dialog-body">
        <div className="dialog-head">
          <h2 id={id}>{title}</h2>
          <button type="button" className="icon-btn" onClick={onClose} aria-label="Fermer">
            <Icon name="x" />
          </button>
        </div>
        {children}
      </div>
    </dialog>
  )
}

export function ConfirmDialog(p: {
  title: string
  children: ReactNode
  confirmLabel: string
  danger?: boolean
  busy?: boolean
  error?: string | null
  onConfirm: () => void
  onCancel: () => void
}) {
  return (
    <Dialog title={p.title} onClose={p.onCancel}>
      <div className="stack">
        <div>{p.children}</div>
        {p.error && <Alert kind="error">{p.error}</Alert>}
        <div className="row end">
          <button type="button" className="btn" onClick={p.onCancel} disabled={p.busy}>
            Annuler
          </button>
          <button type="button" className={`btn ${p.danger ? 'btn-danger' : 'btn-primary'}`} onClick={p.onConfirm} disabled={p.busy}>
            {p.busy ? 'Patientez…' : p.confirmLabel}
          </button>
        </div>
      </div>
    </Dialog>
  )
}

const KIND_LABEL: Record<ReportKind, string> = { message: 'ce message', profile: 'ce profil', help_request: 'cette demande d’aide' }

export function ReportDialog({ kind, targetId, onClose }: { kind: ReportKind; targetId: string; onClose: () => void }) {
  const [reason, setReason] = useState<ReportReason | ''>('')
  const [details, setDetails] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState(false)

  async function submit(e: FormEvent) {
    e.preventDefault()
    if (!reason) {
      setError('Choisissez un motif.')
      return
    }
    setBusy(true)
    setError(null)
    try {
      await api.report(kind, targetId, reason, details)
      setDone(true)
    } catch (err) {
      setError(friendlyError(err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <Dialog title={`Signaler ${KIND_LABEL[kind]}`} onClose={onClose}>
      {done ? (
        <div className="stack">
          <Alert kind="success" title="Signalement enregistré">
            Merci. Votre signalement est conservé de façon confidentielle et sera examiné par les personnes désignées pour la modération.
            Il n’y a pas de modération automatique ni de délai garanti. En cas de danger immédiat, contactez le 112.
          </Alert>
          <div className="row end">
            <button type="button" className="btn btn-primary" onClick={onClose}>
              Fermer
            </button>
          </div>
        </div>
      ) : (
        <form className="stack" onSubmit={submit}>
          <fieldset className="radio-list">
            <legend>Pourquoi signalez-vous {KIND_LABEL[kind]} ?</legend>
            {REPORT_REASONS.map((r) => (
              <label key={r.id} className="radio">
                <input type="radio" name="reason" value={r.id} checked={reason === r.id} onChange={() => setReason(r.id)} />
                <span>{r.label}</span>
              </label>
            ))}
          </fieldset>
          <div className="field">
            <label htmlFor="report-details">Précisions (facultatif)</label>
            <textarea id="report-details" className="input" rows={3} maxLength={1000} value={details} onChange={(e) => setDetails(e.target.value)} />
            <p className="hint">Ne recopiez pas d’informations personnelles. {details.length}/1000</p>
          </div>
          {error && <Alert kind="error">{error}</Alert>}
          <div className="row end">
            <button type="button" className="btn" onClick={onClose} disabled={busy}>
              Annuler
            </button>
            <button type="submit" className="btn btn-primary" disabled={busy}>
              {busy ? 'Envoi…' : 'Envoyer le signalement'}
            </button>
          </div>
        </form>
      )}
    </Dialog>
  )
}

export function Lightbox({ src, alt, onClose }: { src: string; alt: string; onClose: () => void }) {
  return (
    <Dialog title="Aperçu de l’image" onClose={onClose} wide>
      <img className="lightbox-img" src={src} alt={alt} />
      <p className="hint">{alt}</p>
    </Dialog>
  )
}
