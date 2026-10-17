import { useEffect, useState } from 'react'
import { UserCard } from '../components/UserCard'
import { Alert, EmptyState, Icon, Spinner } from '../components/ui'
import { useAuth } from '../context/AuthContext'
import * as api from '../lib/api'
import { friendlyError } from '../lib/errors'
import { useDocumentTitle } from '../lib/hooks'
import { LOCAL } from '../lib/mode'
import { Link, useSearchParams } from '../lib/router'
import type { SearchResult } from '../types'
import { importShareCode, onlineTarget, sendOnlineRequest } from '../local/localApi'
import { useOnlineToggle } from '../local/OnlineBar'

const FORMAT = /^\s*(user)?\s*#?\s*\d{1,9}\s*$/i

/** Aucun profil de cet appareil avec ce numéro : on propose une demande d'ajout EN LIGNE (ou de passer en ligne). */
function OnlineTargetCard({ target }: { target: string }) {
  const { info, ask, dialog } = useOnlineToggle()
  const [state, setState] = useState<'idle' | 'sending' | 'sent'>('idle')
  const [err, setErr] = useState<string | null>(null)
  useEffect(() => {
    setState('idle')
    setErr(null)
  }, [target])
  async function send() {
    setState('sending')
    setErr(null)
    try {
      await sendOnlineRequest(target)
      setState('sent')
    } catch (e) {
      setErr(friendlyError(e))
      setState('idle')
    }
  }
  return (
    <section className="card stack online-target" aria-label={`Ajouter ${target} en ligne`}>
      <h2 className="mono accent">{target}</h2>
      {!info.enabled ? (
        <>
          <p>Aucun profil {target} sur cet appareil. Pour ajouter quelqu’un qui utilise Coup de Pouce sur un autre appareil, passez en ligne.</p>
          <div className="row"><button type="button" className="btn btn-primary" onClick={ask}><Icon name="globe" size={18} /> Passer en ligne</button></div>
        </>
      ) : state === 'sent' ? (
        <Alert kind="success" title="Demande envoyée">
          La demande est partie vers {target}. Elle arrive en quelques secondes si la personne est en ligne, sinon à sa prochaine ouverture (le relais ne garde les messages que quelques heures).
          Une pop-up verte vous prévient dès qu’elle répond.
        </Alert>
      ) : (
        <>
          <p>Aucun profil {target} sur cet appareil. Envoyer une demande d’ajout en ligne à ce numéro ? Vous ne pouvez pas savoir à l’avance si ce numéro existe.</p>
          {err && <Alert kind="error">{err}</Alert>}
          <div className="row">
            <button type="button" className="btn btn-primary" disabled={state === 'sending'} onClick={() => void send()}>
              <Icon name="plus" size={18} /> {state === 'sending' ? 'Envoi…' : `Envoyer la demande à ${target}`}
            </button>
          </div>
        </>
      )}
      {dialog}
    </section>
  )
}

export default function SearchPage() {
  useDocumentTitle('Recherche d’utilisateurs')
  const { userId } = useAuth()
  const [params, setParams] = useSearchParams()
  const q = (params.get('q') ?? '').trim()
  const [input, setInput] = useState(q)
  const [results, setResults] = useState<SearchResult[] | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [codeNote, setCodeNote] = useState<string | null>(null)

  useEffect(() => {
    setInput(q)
    setCodeNote(null)
    if (!q) {
      setResults(null)
      setError(null)
      return
    }
    let alive = true
    setLoading(true)
    setError(null)
    let wanted = q
    // Un code de partage collé dans la recherche (CDP1.…) ajoute la personne directement.
    if (LOCAL && /^CDP1\./.test(q)) {
      try {
        const p = importShareCode(q)
        wanted = p.public_id
        setCodeNote(`${p.display_name ?? 'Cette personne'} (${p.public_id}) est ajoutée à vos contacts.`)
      } catch (e) {
        setError(friendlyError(e))
        setResults(null)
        setLoading(false)
        return
      }
    }
    api.searchProfiles(wanted).then(
      (r) => alive && (setResults(r), setLoading(false)),
      (e: unknown) => alive && (setError(friendlyError(e)), setResults(null), setLoading(false)),
    )
    return () => {
      alive = false
    }
  }, [q])

  return (
    <div className="page narrow">
      <header className="page-head">
        <h1>Rechercher un utilisateur</h1>
        {LOCAL ? (
          <p className="muted">Saisissez le nom de la personne ou son identifiant, par exemple <span className="mono accent">Léo.G</span> ou <span className="mono accent">User#4827</span>. Sont trouvés : les profils créés sur cet appareil et ceux ajoutés avec un code de partage.</p>
        ) : (
          <p className="muted">Saisissez l’identifiant public complet de la personne, par exemple <span className="mono accent">User#0001</span>. Aucune adresse e-mail n’est jamais affichée.</p>
        )}
      </header>
      <form
        className="searchbar"
        role="search"
        onSubmit={(e) => {
          e.preventDefault()
          setParams({ q: input.trim() })
        }}
      >
        <label htmlFor="user-search" className="sr-only">{LOCAL ? 'Nom ou identifiant public' : 'Identifiant public'}</label>
        <Icon name="search" />
        <input id="user-search" className="input" type="search" autoFocus autoComplete="off" placeholder={LOCAL ? 'Nom ou identifiant, par exemple Léo.G ou User#4827' : 'Rechercher un utilisateur, par exemple User#0001'} value={input} onChange={(e) => setInput(e.target.value)} />
        <button type="submit" className="btn btn-primary" disabled={loading}>Rechercher</button>
      </form>

      {LOCAL && (
        <p className="hint">
          Quelqu’un utilise Coup de Pouce sur un autre appareil ? <strong>En ligne</strong>, tapez simplement son identifiant (par exemple User#4827) pour lui envoyer une demande.
          Hors ligne, on ne le voit pas : <Link to="/echanger">ajoutez-le avec son code de partage</Link> (vous pouvez aussi coller ce code ici).
        </p>
      )}
      <div aria-live="polite" className="results">
        {loading && <Spinner label="Recherche en cours…" />}
        {error && <Alert kind="error">{error}</Alert>}
        {codeNote && <Alert kind="success">{codeNote}</Alert>}
        {!loading && !error && results && results.length > 0 && results.map((r) => <UserCard key={r.id} user={r} isMe={r.id === userId} />)}
        {LOCAL && !loading && !error && results && results.length === 0 && onlineTarget(q) && <OnlineTargetCard target={onlineTarget(q) as string} />}
        {!loading && !error && results && results.length === 0 && !(LOCAL && onlineTarget(q)) && (
          <EmptyState icon="search" title={LOCAL ? 'Aucun utilisateur trouvé. Vérifiez le nom ou l’identifiant et réessayez.' : 'Aucun utilisateur trouvé. Vérifiez l’identifiant et réessayez.'}>
            {LOCAL && !FORMAT.test(q) ? 'Aucun profil de cet appareil ne porte ce nom (ou la personne ne souhaite pas être retrouvée). Essayez un autre morceau du nom ou son identifiant User#.' : FORMAT.test(q) ? 'Cette personne n’existe pas ou ne souhaite pas être retrouvée par la recherche.' : 'Le format attendu est « User# » suivi du numéro, par exemple User#0001.'}
          </EmptyState>
        )}
        {!q && !loading && <p className="hint">Les résultats s’afficheront ici. {LOCAL ? 'Un morceau de nom suffit.' : 'La recherche est volontairement limitée à l’identifiant exact pour protéger la vie privée de chacun.'}</p>}
      </div>
    </div>
  )
}
