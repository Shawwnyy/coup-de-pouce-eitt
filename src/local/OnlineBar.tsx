import { useEffect, useState, type ReactNode } from 'react'
import { ConfirmDialog } from '../components/Dialogs'
import { Alert, Icon } from '../components/ui'
import { friendlyError } from '../lib/errors'
import { Link } from '../lib/router'
import { answerOnlinePrompt, onlinePromptDue, conversationLink, conversationVerification, getOnline, messageNet, onlineRequestState, sendOnlineRequest, setOnline, setRelay, subscribeOnlineStatus, type OnlineInfo } from './localApi'

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
export function useOnlineToggle(onEnabled?: () => void): { info: OnlineInfo; ask: () => void; dialog: ReactNode } {
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
      if (on) onEnabled?.()
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
          : 'Tout reste dans ce navigateur. Pour écrire à quelqu’un d’un autre appareil, vous deux devez passer en ligne, puis chercher son User#. Pas de modération.'}
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
  if (link.mode === 'file') return <UpgradeCard peer={link.peerPublicId ?? ''} />
  return (
    <p className="hint online-conv" role="note">
      <Icon name="lock" size={14} />{' '}
      {info.enabled ? (info.status === 'online' ? 'Conversation en ligne, chiffrée : le texte part tout seul.' : 'Connexion au relais en cours… vos messages partiront dès que ce sera prêt.') : 'Vous êtes hors ligne : vos messages partiront quand vous repasserez en ligne.'}
      {' '}Images et vidéos : par fichier (page « Autre appareil »).
      {code && <> Code de vérification : <strong className="mono">{code}</strong> (comparez-le avec votre contact par un autre moyen).</>}
    </p>
  )
}

const NET_TEXT = {
  queued: 'En attente d’envoi',
  sent: 'Envoyé en ligne',
  failed: 'Échec de l’envoi en ligne',
  file: 'Pièce jointe : à envoyer par fichier',
  local: 'Pas envoyé : reste sur cet appareil (voir ci-dessous)',
} as const

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

/** Conversation avec quelqu'un d'un autre appareil SANS lien en ligne : on dit clairement que rien ne part, et on propose de corriger en un clic. */
function UpgradeCard({ peer }: { peer: string }) {
  const [tick, setTick] = useState(0)
  const [state, setState] = useState<'idle' | 'sending'>('idle')
  const [err, setErr] = useState<string | null>(null)
  const [sentNow, setSentNow] = useState(false)
  async function send() {
    setState('sending')
    setErr(null)
    try {
      await sendOnlineRequest(peer)
      setSentNow(true)
    } catch (e) {
      setErr(friendlyError(e))
    } finally {
      setState('idle')
      setTick((n) => n + 1)
    }
  }
  const { info, ask, dialog } = useOnlineToggle(() => void send())
  const req = onlineRequestState(peer)
  void tick
  const pending = req === 'pending'
  return (
    <section className="online-conv online-warn" role="note" aria-label="Ce message ne part pas tout seul">
      <Icon name="alert" size={18} />
      <div className="grow stack-sm">
        <strong>{peer || 'Cette personne'} est sur un autre appareil : vos messages ne lui arrivent pas tout seuls.</strong>
        {!info.enabled && (
          <>
            <span>Pour qu’elle les reçoive : passez en ligne et envoyez-lui une demande d’ajout. Elle doit aussi être en ligne et accepter. Vos messages déjà écrits partiront alors automatiquement.</span>
            <span className="row"><button type="button" className="btn btn-sm btn-primary" onClick={ask}><Icon name="globe" size={16} /> Passer en ligne et envoyer la demande à {peer}</button></span>
          </>
        )}
        {info.enabled && !pending && req !== 'refused' && (
          <>
            <span>Vous êtes en ligne. Envoyez une demande d’ajout à {peer} : dès qu’elle l’accepte (pop-up verte chez elle), le chat devient direct et chiffré.</span>
            <span className="row"><button type="button" className="btn btn-sm btn-primary" disabled={state === 'sending'} onClick={() => void send()}><Icon name="plus" size={16} /> {state === 'sending' ? 'Envoi…' : `Envoyer la demande à ${peer}`}</button></span>
          </>
        )}
        {info.enabled && pending && (
          <>
            <span><strong>{sentNow ? 'Demande envoyée.' : 'Demande en attente.'}</strong> {peer} doit ouvrir Coup de Pouce, cliquer « Passer en ligne », puis accepter dans la pop-up verte. Vos messages partiront dès qu’elle aura accepté.</span>
            <span className="row"><button type="button" className="btn btn-sm" disabled={state === 'sending'} onClick={() => void send()}><Icon name="refresh" size={16} /> {state === 'sending' ? 'Envoi…' : 'Renvoyer la demande'}</button></span>
          </>
        )}
        {info.enabled && req === 'refused' && <span>{peer} a refusé votre demande : vous pourrez la renouveler dans 24 h.</span>}
        {err && <Alert kind="error">{err}</Alert>}
        <span className="hint">Sans internet : <Link to="/echanger">envoyez vos messages par fichier</Link> (page « Autre appareil »).</span>
      </div>
      {dialog}
    </section>
  )
}

/** Explication en 3 étapes quand on n'a encore aucune conversation. */
export function CrossDeviceGuide() {
  const { info, ask, dialog } = useOnlineToggle()
  return (
    <section className="card stack guide-card" aria-label="Écrire à quelqu’un d’un autre appareil">
      <h2>Écrire à quelqu’un d’un autre appareil</h2>
      <ol className="guide-steps">
        <li><strong>Vous deux</strong> : cliquez sur « Passer en ligne » (le point devient vert). {info.enabled ? <span className="chip static chip-ok">Vous êtes en ligne</span> : <span className="chip static">Vous êtes hors ligne</span>}</li>
        <li><strong>Un de vous</strong> : <Link to="/recherche">cherchez le User#</Link> de l’autre (par exemple User#4827) et envoyez la demande.</li>
        <li><strong>L’autre</strong> : accepte dans la pop-up verte. Le chat (texte chiffré) est prêt, des deux côtés.</li>
      </ol>
      {!info.enabled && <div className="row"><button type="button" className="btn btn-primary btn-sm" onClick={ask}><Icon name="globe" size={16} /> Passer en ligne</button></div>}
      {dialog}
    </section>
  )
}

/** Une seule fois par profil créé avant le mode en ligne : propose de l'activer (pas d'activation en silence). */
export function OnlinePrompt() {
  const info = useOnline()
  const [closed, setClosed] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  if (closed || info.enabled || !onlinePromptDue()) return null
  async function answer(enable: boolean) {
    setBusy(true)
    setError(null)
    try {
      await answerOnlinePrompt(enable)
      setClosed(true)
    } catch (e) {
      setError(friendlyError(e))
      setBusy(false)
    }
  }
  return (
    <ConfirmDialog title="Recevoir les demandes des autres appareils ?" confirmLabel="Passer en ligne" busy={busy} error={error} onConfirm={() => void answer(true)} onCancel={() => void answer(false)}>
      <div className="stack">
        <p>
          Pour que quelqu’un puisse vous ajouter avec votre identifiant (<strong>et que vous receviez la pop-up verte « Accepter / Refuser »</strong>), ce profil doit être <strong>en ligne</strong> : il écoute sa boîte de demandes sur un relais public ({relayHost(info.relay)}).
        </p>
        <ul>
          <li>Rien n’est publié tant que vous n’envoyez pas vous-même une demande ou un message.</li>
          <li>Le relais voit votre adresse internet ; les messages texte sont chiffrés de bout en bout.</li>
          <li>« Annuler » = rester hors ligne (vous pourrez passer en ligne depuis la barre en haut, à tout moment).</li>
        </ul>
      </div>
    </ConfirmDialog>
  )
}
