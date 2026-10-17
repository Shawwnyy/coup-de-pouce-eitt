import { useState, type ReactNode } from 'react'
import { useAuth } from '../context/AuthContext'
import { friendlyError } from '../lib/errors'
import { useDocumentTitle } from '../lib/hooks'
import { Link, Navigate, useLocation } from '../lib/router'
import { isConfigured, secretKeyDetected } from '../lib/supabase'
import { RULES_UPDATED_LABEL } from '../lib/config'
import { RulesBody } from './RulesBody'
import { Alert, Icon, PageLoading } from './ui'

export function ConfigNotice() {
  useDocumentTitle('Configuration requise')
  return (
    <div className="page narrow">
      <div className="card stack">
        <h1>
          <Icon name="settings" /> Configuration requise
        </h1>
        {secretKeyDetected && (
          <Alert kind="error" title="Clé secrète détectée : démarrage refusé">
            La valeur de <code>VITE_SUPABASE_ANON_KEY</code> est une clé secrète (<code>service_role</code>). Elle donnerait un accès total à votre base à
            n’importe quel visiteur du site. Retirez-la de <code>.env.local</code>, utilisez la clé « anon » (publique) à la place, et par précaution
            régénérez la clé secrète dans Supabase si elle a pu être exposée.
          </Alert>
        )}
        <Alert kind="warn" title="Le service de comptes et de messagerie n’est pas encore relié">
          Cette installation n’est pas connectée à un projet Supabase : la création de compte, la recherche d’utilisateurs, la messagerie et les
          demandes d’aide sont donc indisponibles. Rien n’est simulé dans le navigateur.
        </Alert>
        <ol className="steps">
          <li>Créez un projet gratuit sur supabase.com.</li>
          <li>Exécutez les 3 fichiers du dossier <code>supabase/migrations</code> dans l’éditeur SQL.</li>
          <li>Copiez <code>.env.example</code> en <code>.env.local</code> et renseignez <code>VITE_SUPABASE_URL</code> et <code>VITE_SUPABASE_ANON_KEY</code>.</li>
          <li>Relancez l’application (<code>npm run dev</code>) ou reconstruisez-la (<code>npm run build</code>).</li>
        </ol>
        <p className="hint">Les pages publiques (accueil, règles, apparence) restent utilisables sans configuration.</p>
        <div className="row">
          <Link to="/" className="btn">Retour à l’accueil</Link>
          <Link to="/regles" className="btn btn-ghost">Lire les règles</Link>
        </div>
      </div>
    </div>
  )
}

/** Écran bloquant : l'acceptation explicite des règles est requise avant d'écrire (case à cocher, jamais « implicite »). */
export function RulesGate() {
  const { acceptRules, signOut } = useAuth()
  const [checked, setChecked] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  useDocumentTitle('Règles de la communauté')

  async function accept() {
    setBusy(true)
    setError(null)
    try {
      await acceptRules()
    } catch (e) {
      setError(friendlyError(e))
      setBusy(false)
    }
  }

  return (
    <div className="page">
      <header className="page-head">
        <h1>Avant de continuer : les règles de Coup de Pouce</h1>
        <p className="muted">Dernière mise à jour : {RULES_UPDATED_LABEL}. Lisez-les, puis confirmez pour utiliser la messagerie et les demandes d’aide.</p>
      </header>
      <RulesBody headingLevel={3} />
      <div className="card stack gate-confirm">
        <label className="check">
          <input type="checkbox" checked={checked} onChange={(e) => setChecked(e.target.checked)} />
          <span>J’ai lu et j’accepte les règles de la communauté et les conditions d’utilisation de Coup de Pouce.</span>
        </label>
        {error && <Alert kind="error">{error}</Alert>}
        <div className="row">
          <button type="button" className="btn btn-primary" disabled={!checked || busy} onClick={accept}>
            {busy ? 'Enregistrement…' : 'J’accepte les règles'}
          </button>
          <button type="button" className="btn btn-ghost" onClick={() => signOut()}>
            Me déconnecter
          </button>
        </div>
      </div>
    </div>
  )
}

export function RequireAuth({ children }: { children: ReactNode }) {
  const { status, rulesOk, errorMessage, reload, signOut } = useAuth()
  const loc = useLocation()
  if (!isConfigured) return <ConfigNotice />
  if (status === 'loading') return <PageLoading />
  if (status === 'error') {
    return (
      <div className="page narrow">
        <Alert kind="error" title="Impossible de charger votre compte">
          {errorMessage}
        </Alert>
        <div className="row">
          <button type="button" className="btn btn-primary" onClick={reload}>Réessayer</button>
          <button type="button" className="btn" onClick={() => signOut()}>Me déconnecter</button>
        </div>
      </div>
    )
  }
  if (status === 'anon') return <Navigate to={`/connexion?next=${encodeURIComponent(loc.path + loc.search)}`} />
  if (!rulesOk) return <RulesGate />
  return <>{children}</>
}
