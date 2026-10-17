import { useEffect, useState } from 'react'
import { Alert, Avatar, Icon } from '../components/ui'
import { useAuth } from '../context/AuthContext'
import { friendlyError } from '../lib/errors'
import { displayName } from '../lib/format'
import { useDocumentTitle } from '../lib/hooks'
import { Link, useNavigate } from '../lib/router'
import { contactNotices, contactStatus, markAnswerSeen, respondContactRequest, sendContactRequest, startConversation, type ContactNotices, type ContactStatus } from './localApi'

/** Se remet à jour toutes les 2 s : les demandes venues d'un autre onglet arrivent sans recharger la page. */
function useTick(ms = 2000): number {
  const [n, setN] = useState(0)
  useEffect(() => {
    const t = window.setInterval(() => setN((x) => x + 1), ms)
    return () => window.clearInterval(t)
  }, [ms])
  return n
}

/** Bouton de la carte « utilisateur » en version locale : demander, attendre, accepter/refuser, écrire. */
export function LocalContactButton({ userId, name, onOpen, busy }: { userId: string; name: string; onOpen: () => void; busy: boolean }) {
  useTick()
  const [, force] = useState(0)
  const [error, setError] = useState<string | null>(null)
  let status: ContactStatus = 'none'
  try {
    status = contactStatus(userId)
  } catch {
    status = 'none'
  }
  const notices = contactNotices()
  const pendingIn = notices.incoming.find((r) => r.from.id === userId)

  function ask() {
    setError(null)
    try {
      sendContactRequest(userId)
      force((x) => x + 1)
    } catch (e) {
      setError(friendlyError(e))
    }
  }
  function answer(accept: boolean) {
    if (!pendingIn) return
    try {
      respondContactRequest(pendingIn.id, accept)
      force((x) => x + 1)
    } catch (e) {
      setError(friendlyError(e))
    }
  }

  return (
    <>
      {error && <Alert kind="error">{error}</Alert>}
      {status === 'accepted' && (
        <button type="button" className="btn btn-sm btn-primary" disabled={busy} onClick={onOpen}><Icon name="chat" size={16} /> {busy ? 'Ouverture…' : 'Envoyer un message'}</button>
      )}
      {(status === 'none' || status === 'refused') && (
        <button type="button" className="btn btn-sm btn-primary" disabled={status === 'refused'} onClick={ask}><Icon name="plus" size={16} /> Demander en contact</button>
      )}
      {status === 'refused' && <span className="hint">{name} a refusé votre demande : réessayez dans 24 h.</span>}
      {status === 'pending_out' && <span className="chip static" role="status"><Icon name="refresh" size={14} /> Demande envoyée, en attente de {name}</span>}
      {status === 'pending_in' && (
        <>
          <button type="button" className="btn btn-sm btn-accept" onClick={() => answer(true)}><Icon name="check" size={16} /> Accepter</button>
          <button type="button" className="btn btn-sm" onClick={() => answer(false)}><Icon name="x" size={16} /> Refuser</button>
          <span className="hint">{name} veut vous ajouter.</span>
        </>
      )}
    </>
  )
}

const LATER_KEY = 'cdp.local.contact.later'
const readLater = (): string[] => {
  try {
    return JSON.parse(window.sessionStorage.getItem(LATER_KEY) ?? '[]') as string[]
  } catch {
    return []
  }
}

/** Affiche une pop-up verte de confirmation (utilisable depuis n'importe quel écran). */
export function notifyFlash(text: string): void {
  window.dispatchEvent(new CustomEvent('cdp:flash', { detail: text }))
}

/** Pop-ups VERTES : demande d'ajout reçue (Accepter / Refuser) et réponse à ma propre demande. Aucune permission du navigateur n'est demandée. */
export function ContactPopups() {
  const { userId } = useAuth()
  const navigate = useNavigate()
  const tick = useTick()
  const [n, setN] = useState<ContactNotices>({ incoming: [], answers: [], outgoing: [] })
  const [later, setLater] = useState<string[]>(readLater)
  const [flash, setFlash] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => setN(contactNotices()), [userId, tick])
  useEffect(() => {
    const on = (e: Event) => setFlash(String((e as CustomEvent).detail ?? ''))
    window.addEventListener('cdp:flash', on)
    return () => window.removeEventListener('cdp:flash', on)
  }, [])
  useEffect(() => {
    if (!flash) return
    const t = window.setTimeout(() => setFlash(null), 9000)
    return () => window.clearTimeout(t)
  }, [flash])

  const incoming = n.incoming.filter((r) => !later.includes(r.id)).slice(0, 3)
  if (!incoming.length && !n.answers.length && !flash && !error) return null

  const postpone = (id: string) => {
    const next = [...later, id]
    setLater(next)
    try {
      window.sessionStorage.setItem(LATER_KEY, JSON.stringify(next))
    } catch { /* ignoré */ }
  }
  const respond = (id: string, name: string, accept: boolean) => {
    try {
      respondContactRequest(id, accept)
      setFlash(accept ? `Vous avez accepté ${name} : vous pouvez maintenant vous écrire.` : `Vous avez refusé la demande de ${name}.`)
      setN(contactNotices())
    } catch (e) {
      setError(friendlyError(e))
    }
  }
  const write = async (id: string, otherId: string) => {
    try {
      const conv = await startConversation(otherId)
      markAnswerSeen(id)
      navigate(`/messages/${conv}`)
    } catch (e) {
      setError(friendlyError(e))
    }
  }

  return (
    <div className="cr-popups" aria-live="polite">
      {flash && <div className="cr-popup cr-ok" role="status"><Icon name="check" size={18} /> <span className="grow">{flash}</span><button type="button" className="cr-x" onClick={() => setFlash(null)} aria-label="Fermer">×</button></div>}
      {error && <div className="cr-popup cr-no" role="alert"><span className="grow">{error}</span><button type="button" className="cr-x" onClick={() => setError(null)} aria-label="Fermer">×</button></div>}
      {incoming.map((r) => {
        const name = displayName(r.from)
        return (
          <section key={r.id} className="cr-popup cr-ok" aria-label={`Demande d’ajout de ${r.from.public_id}`}>
            <Avatar profile={r.from} size={40} />
            <div className="grow">
              <strong>Demande d’ajout</strong>
              <p><b>{name}</b> <span className="mono">({r.from.public_id})</span> souhaite vous ajouter pour discuter.</p>
              <div className="row">
                <button type="button" className="btn btn-sm cr-accept" onClick={() => respond(r.id, name, true)}><Icon name="check" size={16} /> Accepter</button>
                <button type="button" className="btn btn-sm cr-refuse" onClick={() => respond(r.id, name, false)}><Icon name="x" size={16} /> Refuser</button>
                <button type="button" className="cr-later" onClick={() => postpone(r.id)}>Plus tard</button>
              </div>
            </div>
          </section>
        )
      })}
      {n.answers.map((a) => (
        <section key={a.id} className={`cr-popup ${a.accepted ? 'cr-ok' : 'cr-neutral'}`} aria-label="Réponse à votre demande">
          <Avatar profile={a.other} size={40} />
          <div className="grow">
            <p><b>{displayName(a.other)}</b> <span className="mono">({a.other.public_id})</span> {a.accepted ? 'a accepté votre demande.' : 'a refusé votre demande.'}</p>
            <div className="row">
              {a.accepted && <button type="button" className="btn btn-sm cr-accept" onClick={() => void write(a.id, a.other.id)}><Icon name="chat" size={16} /> Écrire</button>}
              <button type="button" className="cr-later" onClick={() => markAnswerSeen(a.id)}>OK</button>
            </div>
          </div>
        </section>
      ))}
    </div>
  )
}

/** Page « Demandes d'ajout » : reçues (Accepter / Refuser) et envoyées. */
export function ContactRequestsPage() {
  useDocumentTitle('Demandes d’ajout')
  useTick()
  const [, force] = useState(0)
  const [error, setError] = useState<string | null>(null)
  const n = contactNotices()
  const label = { pending: 'En attente', accepted: 'Acceptée', refused: 'Refusée' } as const
  return (
    <div className="page narrow">
      <header className="page-head">
        <h1>Demandes d’ajout</h1>
        <p className="muted">Pour écrire à quelqu’un, il faut que la personne accepte votre demande. Vous choisissez qui peut vous écrire.</p>
      </header>
      {error && <Alert kind="error">{error}</Alert>}
      <section className="card stack" aria-labelledby="cr-in">
        <h2 id="cr-in">Reçues ({n.incoming.length})</h2>
        {n.incoming.length === 0 && <p className="muted">Aucune demande en attente.</p>}
        {n.incoming.map((r) => (
          <div key={r.id} className="row">
            <Avatar profile={r.from} size={40} />
            <div className="grow"><strong>{displayName(r.from)}</strong> <span className="mono muted">{r.from.public_id}</span></div>
            <button type="button" className="btn btn-sm btn-accept" onClick={() => { try { respondContactRequest(r.id, true); force((x) => x + 1) } catch (e) { setError(friendlyError(e)) } }}><Icon name="check" size={16} /> Accepter</button>
            <button type="button" className="btn btn-sm" onClick={() => { try { respondContactRequest(r.id, false); force((x) => x + 1) } catch (e) { setError(friendlyError(e)) } }}><Icon name="x" size={16} /> Refuser</button>
          </div>
        ))}
      </section>
      <section className="card stack" aria-labelledby="cr-out">
        <h2 id="cr-out">Envoyées ({n.outgoing.length})</h2>
        {n.outgoing.length === 0 && <p className="muted">Vous n’avez envoyé aucune demande. Cherchez quelqu’un dans la <Link to="/recherche">recherche</Link>.</p>}
        {n.outgoing.map((r) => (
          <div key={r.id} className="row">
            <Avatar profile={r.to} size={40} />
            <div className="grow"><strong>{displayName(r.to)}</strong> <span className="mono muted">{r.to.public_id}</span></div>
            <span className={`chip static ${r.status === 'accepted' ? 'chip-ok' : ''}`}>{label[r.status]}</span>
          </div>
        ))}
      </section>
    </div>
  )
}
