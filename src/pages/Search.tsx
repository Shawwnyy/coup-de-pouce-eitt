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

const FORMAT = /^\s*(user)?\s*#?\s*\d{1,9}\s*$/i

export default function SearchPage() {
  useDocumentTitle('Recherche d’utilisateurs')
  const { userId } = useAuth()
  const [params, setParams] = useSearchParams()
  const q = (params.get('q') ?? '').trim()
  const [input, setInput] = useState(q)
  const [results, setResults] = useState<SearchResult[] | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    setInput(q)
    if (!q) {
      setResults(null)
      setError(null)
      return
    }
    let alive = true
    setLoading(true)
    setError(null)
    api.searchProfiles(q).then(
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
          <p className="muted">Saisissez le nom de la personne ou son identifiant, par exemple <span className="mono accent">Léo.G</span> ou <span className="mono accent">User#4827</span>. Seuls les profils créés sur cet appareil sont trouvés.</p>
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
          Quelqu’un utilise Coup de Pouce sur un autre appareil ? Sans serveur, on ne le voit pas automatiquement : <Link to="/echanger">ajoutez-le avec son code de partage</Link>.
        </p>
      )}
      <div aria-live="polite" className="results">
        {loading && <Spinner label="Recherche en cours…" />}
        {error && <Alert kind="error">{error}</Alert>}
        {!loading && !error && results && results.length > 0 && results.map((r) => <UserCard key={r.id} user={r} isMe={r.id === userId} />)}
        {!loading && !error && results && results.length === 0 && (
          <EmptyState icon="search" title={LOCAL ? 'Aucun utilisateur trouvé. Vérifiez le nom ou l’identifiant et réessayez.' : 'Aucun utilisateur trouvé. Vérifiez l’identifiant et réessayez.'}>
            {LOCAL && !FORMAT.test(q) ? 'Aucun profil de cet appareil ne porte ce nom (ou la personne ne souhaite pas être retrouvée). Essayez un autre morceau du nom ou son identifiant User#.' : FORMAT.test(q) ? 'Cette personne n’existe pas ou ne souhaite pas être retrouvée par la recherche.' : 'Le format attendu est « User# » suivi du numéro, par exemple User#0001.'}
          </EmptyState>
        )}
        {!q && !loading && <p className="hint">Les résultats s’afficheront ici. {LOCAL ? 'Tapez un nom (ou un morceau de nom) ou un identifiant : seuls les profils de cet appareil existent ici.' : 'La recherche est volontairement limitée à l’identifiant exact pour protéger la vie privée de chacun.'}</p>}
      </div>
    </div>
  )
}
