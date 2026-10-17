import { useState } from 'react'
import { ConfirmDialog } from '../components/Dialogs'
import { useAuth } from '../context/AuthContext'
import { friendlyError } from '../lib/errors'
import { notifyFlash } from './Contacts'
import { sendOnlineRequest, setOnline } from './localApi'
import { useOnline } from './OnlineBar'

const relayHost = (url: string): string => {
  try {
    return new URL(url).host
  } catch {
    return url
  }
}

/** Pop-up « Envoyer une demande à User#… ? » : on voit ce qui part, on peut noter un prénom, et on passe en ligne au même clic si besoin. */
export function RequestDialog({ target, onClose, onSent }: { target: string; onClose: () => void; onSent?: () => void }) {
  const info = useOnline()
  const { profile } = useAuth()
  const [label, setLabel] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function go() {
    setBusy(true)
    setError(null)
    try {
      if (!info.enabled) await setOnline(true)
      await sendOnlineRequest(target, label)
      const who = label.trim() ? `${label.trim()} (${target})` : target
      notifyFlash(`Demande envoyée à ${who}. Elle arrive dès que la personne ouvre Coup de Pouce en ligne ; vous serez prévenu ici dès qu’elle répond.`)
      onSent?.()
      onClose()
    } catch (e) {
      setError(friendlyError(e))
      setBusy(false)
    }
  }

  return (
    <ConfirmDialog
      title={`Envoyer une demande à ${target} ?`}
      confirmLabel={info.enabled ? 'Envoyer la demande' : 'Passer en ligne et envoyer'}
      busy={busy}
      error={error}
      onConfirm={() => void go()}
      onCancel={onClose}
    >
      <div className="stack">
        <p>
          La personne <strong className="mono">{target}</strong> recevra une pop-up verte avec votre nom et vos boutons <strong>Accepter</strong> / <strong>Refuser</strong>.
          Si elle accepte, vous pouvez vous écrire (texte chiffré).
        </p>
        <div className="field">
          <label htmlFor="rq-name">Son prénom (facultatif)</label>
          <input id="rq-name" className="input" value={label} maxLength={40} autoComplete="off" onChange={(e) => setLabel(e.target.value)} placeholder="Pour vous y retrouver" />
          <p className="hint">Elle choisit elle-même le nom qu’elle affiche. Le prénom noté ici reste dans votre navigateur.</p>
        </div>
        <p className="hint">
          <strong>Ce qui part sur internet</strong> (relais public {relayHost(info.relay)}) : votre identifiant {profile?.public_id}, votre nom affiché{profile?.display_name ? ` (« ${profile.display_name} »)` : ''} et une clé publique.
          Visible par quiconque regarde ce relais. {!info.enabled && 'Vous passez en ligne pour envoyer la demande ; vous pourrez repasser hors ligne à tout moment. '}
          Impossible de savoir à l’avance si ce numéro existe : la demande attend dans le relais quelques heures et arrive quand la personne ouvre Coup de Pouce en ligne.
        </p>
      </div>
    </ConfirmDialog>
  )
}
