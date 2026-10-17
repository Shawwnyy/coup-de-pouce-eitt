import { useEffect, useState, type ReactNode } from 'react'
import { ConfirmDialog } from '../components/Dialogs'
import { Alert, Icon } from '../components/ui'
import { friendlyError } from '../lib/errors'
import { conversationLink, conversationVerification, getOnline, messageNet, setOnline, setRelay, subscribeOnlineStatus, type OnlineInfo } from './localApi'

/** État du mode en ligne du profil actif ; se met à jour quand la connexion change et toutes les 2 s (file d'attente). */
export function useOnline(): OnlineInfo {
  const [info, setInfo] = useState<OnlineInfo>(getOnline)
  useEffect(() => {
    const update = () => setInfo(getOnline())
    update()
    const off = subscribeOnlineStatus(update)
    const t = window.setInterval(update, 2000)
    return () => {
      off()
      window.clearInterval(t)
    }
  }, [])
  return info
}

/** Nom du relais affiché à l'utilisateur (sans https://). */
const relayHost = (url: string): string => {
  try {
    return new URL(url).host
  } catch {
    return url
  }
}

const STATUS_TEXT: Record<OnlineInfo['status'], string> = {
  off: 'Hors ligne',
  connecting: 'Connexion…',
  online: 'En ligne',
  error: 'Relais injoignable',
}

/** Interrupteur En ligne / Hors ligne avec confirmation avant d'activer (ce qui part sur internet est expliqué). */
export function useOnlineToggle(): { info: OnlineInfo; ask: () => void; dialog: ReactNode } {
  const info = useOnline()
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function apply(on: boolean) {
    setBusy(true)
    setError(null)
    try {
      await setOnline(on)
      setOpen(false)
    } catch (e) {
      setError(friendlyError(e))
    } finally {
      setBusy(false)
    }
  }

  const dialog = open ? (
    <ConfirmDialog title="Passer en ligne (bêta) ?" confirmLabel="Passer en ligne" busy={busy} error={error} onConfirm={() => void apply(true)} onCancel={() => setOpen(false)}>
      <div className="stack">
        <p>
          En ligne, vous pouvez ajouter quelqu’un d’un autre appareil avec son identifiant (User#…) : la demande lui arrive en quelques secondes et vous pouvez vous écrire.
        </p>
        <p><strong>Ce qui passe par internet</strong>, via un relais public ({relayHost(info.relay)}) :</p>
        <ul>
          <li>vos demandes d’ajout : votre identifiant, votre nom affiché et une clé publique, donc visibles par n’importe qui qui regarde ce relais ;</li>
          <li>vos messages <strong>texte</strong>, chiffrés de bout en bout : le relais ne peut pas les lire, mais voit qu’il y a un échange (heure et taille).</li>
        </ul>
        <p>
          Les images et les vidéos ne passent pas en ligne (page « Autre appareil »). Il n’y a pas de modération. Le relais gratuit limite le nombre de messages par jour
          et ne garde les messages que quelques heures. Vous pouvez repasser hors ligne à tout moment : plus rien n’est alors envoyé.
        </p>
      </div>
    </ConfirmDialog>
  ) : null

  return { info, ask: () => (info.enabled ? void apply(false) : (setError(null), setOpen(true))), dialog }
}

/** Ligne affichée sous l'en-tête : état de la connexion + interrupteur. */
export function OnlineBar() {
  const { info, ask, dialog } = useOnlineToggle()
  const cls = info.status === 'online' ? 'ob-on' : info.status === 'connecting' ? 'ob-wait' : info.status === 'error' ? 'ob-err' : 'ob-off'
  return (
    <div className="local-banner online-bar" role="note">
      <span className={`ob-pill ${cls}`} role="status">
        <span className="ob-dot" aria-hidden="true" /> {STATUS_TEXT[info.status]}
        {info.enabled && <span className="ob-beta"> · bêta</span>}
      </span>
      <span className="ob-text">
        {info.enabled
          ? 'Demandes et messages texte passent par un relais public (chiffrés). Pas de modération.'
          : 'Tout est gardé dans ce navigateur. Passez en ligne pour ajouter quelqu’un d’un autre appareil avec son User#. Pas de modération.'}
        {info.enabled && info.queued > 0 && <> {info.queued} envoi{info.queued > 1 ? 's' : ''} en attente.</>}
      </span>
      <button type="button" className="btn btn-sm" onClick={ask} aria-pressed={info.enabled}>
        <Icon name={info.enabled ? 'x' : 'globe'} size={16} /> {info.enabled ? 'Repasser hors ligne' : 'Passer en ligne'}
      </button>
      {dialog}
    </div>
  )
}

/** Réglages du relais (section « Compte » des paramètres). */
export function OnlineSettingsCard() {
  const { info, ask, dialog } = useOnlineToggle()
  const [url, setUrl] = useState(info.relay)
  const [note, setNote] = useState<{ kind: 'success' | 'error'; text: string } | null>(null)
  return (
    <div className="card stack">
      <h2>Mode en ligne (bêta)</h2>
      <p>
        {info.enabled ? 'Ce profil est en ligne : ' : 'Ce profil est hors ligne : '}
        <strong>{STATUS_TEXT[info.status]}</strong>.
        {' '}En ligne, on peut vous ajouter avec votre identifiant et vous écrire du texte, chiffré, via un relais public.
      </p>
      <div className="row">
        <button type="button" className="btn btn-primary" onClick={ask}>
          <Icon name={info.enabled ? 'x' : 'globe'} size={18} /> {info.enabled ? 'Repasser hors ligne' : 'Passer en ligne'}
        </button>
      </div>
      <details>
        <summary>Relais utilisé (avancé)</summary>
        <div className="stack">
          <label htmlFor="relay-url">Adresse du relais (compatible ntfy)</label>
          <input id="relay-url" className="input mono" value={url} onChange={(e) => setUrl(e.target.value)} spellCheck={false} autoComplete="off" />
          <p className="hint">Par défaut : https://ntfy.sh. Les deux personnes doivent utiliser le même relais. Vous pouvez héberger le vôtre.</p>
          {note && <Alert kind={note.kind}>{note.text}</Alert>}
          <div className="row">
            <button
              type="button"
              className="btn"
              onClick={() => {
                try {
                  setRelay(url)
                  setNote({ kind: 'success', text: 'Relais enregistré.' })
                } catch (e) {
                  setNote({ kind: 'error', text: friendlyError(e) })
                }
              }}
            >
              Enregistrer
            </button>
            <button type="button" className="btn btn-ghost" onClick={() => { setRelay(''); setUrl(getOnline().relay); setNote({ kind: 'success', text: 'Relais par défaut rétabli.' }) }}>Rétablir le relais par défaut</button>
          </div>
        </div>
      </details>
      {dialog}
    </div>
  )
}

/** Dans une conversation avec quelqu'un d'un autre appareil : comment les messages circulent. */
export function OnlineConvNotice({ conversationId }: { conversationId: string }) {
  const info = useOnline()
  const link = conversationLink(conversationId)
  const [code, setCode] = useState<string | null>(null)
  useEffect(() => {
    let alive = true
    void conversationVerification(conversationId).then((c) => alive && setCode(c), () => undefined)
    return () => {
      alive = false
    }
  }, [conversationId, link.mode])
  if (link.mode === 'local') return null
  if (link.mode === 'file') {
    return (
      <p className="hint online-conv" role="note">
        <Icon name="file" size={14} /> Contact d’un autre appareil : les messages se transmettent par fichier (page « Autre appareil »). Pour des messages directs, ajoutez-vous en ligne avec le User#.
      </p>
    )
  }
  return (
    <p className="hint online-conv" role="note">
      <Icon name="lock" size={14} />{' '}
      {info.enabled ? (info.status === 'online' ? 'Conversation en ligne, chiffrée : le texte part tout seul.' : 'Connexion au relais en cours… vos messages partiront dès que ce sera prêt.') : 'Vous êtes hors ligne : vos messages partiront quand vous repasserez en ligne.'}
      {' '}Images et vidéos : par fichier (page « Autre appareil »).
      {code && <> Code de vérification : <strong className="mono">{code}</strong> (comparez-le avec votre contact par un autre moyen).</>}
    </p>
  )
}

const NET_TEXT = { queued: 'En attente d’envoi', sent: 'Envoyé en ligne', failed: 'Échec de l’envoi en ligne', file: 'Pièce jointe : à envoyer par fichier' } as const

/** Petit texte sous mes messages d'une conversation en ligne : envoyé, en attente, à envoyer par fichier. */
export function NetBadge({ id }: { id: string }) {
  const [state, setState] = useState(() => messageNet(id))
  useEffect(() => {
    setState(messageNet(id))
    if (messageNet(id) === 'sent') return
    const t = window.setInterval(() => setState(messageNet(id)), 1500)
    return () => window.clearInterval(t)
  }, [id])
  if (!state) return null
  return <span className={`net-badge net-${state}`}>{NET_TEXT[state]}</span>
}
