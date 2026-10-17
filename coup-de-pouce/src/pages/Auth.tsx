import { useState } from 'react'
import type { FormEvent } from 'react'
import { Alert, Field, Icon } from '../components/ui'
import { ConfigNotice } from '../components/Guards'
import { useAuth } from '../context/AuthContext'
import * as api from '../lib/api'
import { RULES_VERSION } from '../lib/config'
import { friendlyError } from '../lib/errors'
import { useDocumentTitle } from '../lib/hooks'
import { Link, Navigate, hrefTo, useNavigate, useSearchParams } from '../lib/router'
import { isConfigured } from '../lib/supabase'

/** On n'accepte que des chemins internes (évite les redirections vers un site extérieur). */
function safeNext(raw: string | null): string {
  return raw && raw.startsWith('/') && !raw.startsWith('//') && !raw.includes('\\') ? raw : '/'
}

function PasswordInput({ id, value, onChange, autoComplete, describedBy }: { id: string; value: string; onChange: (v: string) => void; autoComplete: string; describedBy?: string }) {
  const [show, setShow] = useState(false)
  return (
    <div className="input-group">
      <input id={id} className="input" type={show ? 'text' : 'password'} value={value} onChange={(e) => onChange(e.target.value)} autoComplete={autoComplete} aria-describedby={describedBy} required minLength={8} />
      <button type="button" className="btn btn-sm" onClick={() => setShow((s) => !s)} aria-pressed={show}>
        <Icon name="eye" size={16} /> {show ? 'Masquer' : 'Afficher'}
      </button>
    </div>
  )
}

export function LoginPage() {
  useDocumentTitle('Connexion')
  const { status } = useAuth()
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const next = safeNext(params.get('next'))
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  if (!isConfigured) return <ConfigNotice />
  if (status === 'authed') return <Navigate to={next} />

  async function submit(e: FormEvent) {
    e.preventDefault()
    setBusy(true)
    setError(null)
    try {
      await api.signIn(email.trim(), password)
      navigate(next, { replace: true })
    } catch (err) {
      setError(friendlyError(err))
      setBusy(false)
    }
  }

  return (
    <div className="page narrow">
      <form className="card stack" onSubmit={submit} noValidate={false}>
        <h1>Connexion</h1>
        {params.get('next') && <Alert>Connectez-vous pour continuer.</Alert>}
        <Field label="Adresse e-mail" htmlFor="login-email">
          <input id="login-email" className="input" type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
        </Field>
        <Field label="Mot de passe" htmlFor="login-password">
          <PasswordInput id="login-password" value={password} onChange={setPassword} autoComplete="current-password" />
        </Field>
        {error && <Alert kind="error">{error}</Alert>}
        <button type="submit" className="btn btn-primary btn-lg" disabled={busy}>{busy ? 'Connexion…' : 'Se connecter'}</button>
        <p className="muted">
          <Link to="/mot-de-passe-oublie">Mot de passe oublié ?</Link>
        </p>
        <p className="muted">
          Pas encore de compte ? <Link to="/inscription">Créer un compte</Link>
        </p>
      </form>
    </div>
  )
}

export function ForgotPasswordPage() {
  useDocumentTitle('Mot de passe oublié')
  const [email, setEmail] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [sent, setSent] = useState(false)

  if (!isConfigured) return <ConfigNotice />

  async function submit(e: FormEvent) {
    e.preventDefault()
    setBusy(true)
    setError(null)
    try {
      await api.requestPasswordReset(email.trim())
      setSent(true)
    } catch (err) {
      setError(friendlyError(err))
    } finally {
      setBusy(false)
    }
  }

  if (sent) {
    return (
      <div className="page narrow">
        <div className="card stack">
          <h1><Icon name="mail" /> Vérifiez votre boîte mail</h1>
          <Alert kind="success">
            Si un compte existe avec l’adresse <strong>{email}</strong>, un message contenant un lien de réinitialisation vient de lui être envoyé.
            Le lien est valable un temps limité. Pensez à regarder dans vos courriers indésirables.
          </Alert>
          <p className="hint">Il s’agit d’un message de sécurité nécessaire pour récupérer votre compte, pas d’une notification facultative.</p>
          <Link to="/connexion" className="btn btn-primary">Retour à la connexion</Link>
        </div>
      </div>
    )
  }

  return (
    <div className="page narrow">
      <form className="card stack" onSubmit={submit}>
        <h1>Mot de passe oublié</h1>
        <p className="muted">Indiquez l’adresse e-mail de votre compte : nous vous enverrons un lien pour choisir un nouveau mot de passe.</p>
        <Field label="Adresse e-mail" htmlFor="fp-email">
          <input id="fp-email" className="input" type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
        </Field>
        {error && <Alert kind="error">{error}</Alert>}
        <button type="submit" className="btn btn-primary btn-lg" disabled={busy}>{busy ? 'Envoi…' : 'Envoyer le lien'}</button>
        <p className="muted"><Link to="/connexion">Retour à la connexion</Link></p>
      </form>
    </div>
  )
}

/** Page ouverte depuis le lien du message : Supabase a déjà ouvert une session « de récupération » (échange du code dans l'URL). */
export function ResetPasswordPage() {
  useDocumentTitle('Nouveau mot de passe')
  const { status } = useAuth()
  const [pw, setPw] = useState('')
  const [pw2, setPw2] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState(false)

  if (!isConfigured) return <ConfigNotice />
  if (status === 'loading') {
    return (
      <div className="page narrow">
        <div className="spinner-wrap" role="status"><span className="spinner" /> Vérification du lien…</div>
      </div>
    )
  }
  if (status !== 'authed') {
    return (
      <div className="page narrow">
        <div className="card stack">
          <h1>Lien invalide ou expiré</h1>
          <Alert kind="warn">
            Ce lien de réinitialisation n’est plus valable (il a peut-être déjà servi, ou il a été ouvert dans un autre navigateur que celui de la demande).
          </Alert>
          <Link to="/mot-de-passe-oublie" className="btn btn-primary">Demander un nouveau lien</Link>
        </div>
      </div>
    )
  }

  async function submit(e: FormEvent) {
    e.preventDefault()
    if (pw.length < 8) return setError('Choisissez un mot de passe d’au moins 8 caractères.')
    if (pw !== pw2) return setError('Les deux mots de passe ne sont pas identiques.')
    setBusy(true)
    setError(null)
    try {
      await api.updatePassword(pw)
      setDone(true)
    } catch (err) {
      setError(friendlyError(err))
    } finally {
      setBusy(false)
    }
  }

  if (done) {
    return (
      <div className="page narrow">
        <div className="card stack">
          <h1><Icon name="check" /> Mot de passe modifié</h1>
          <Alert kind="success">Votre nouveau mot de passe est enregistré. Vous êtes connecté.</Alert>
          <Link to="/" className="btn btn-primary">Aller à l’accueil</Link>
        </div>
      </div>
    )
  }

  return (
    <div className="page narrow">
      <form className="card stack" onSubmit={submit}>
        <h1>Nouveau mot de passe</h1>
        <Field label="Nouveau mot de passe" htmlFor="rp-pw" hint="8 caractères minimum. Ne le communiquez jamais à personne.">
          <PasswordInput id="rp-pw" value={pw} onChange={setPw} autoComplete="new-password" />
        </Field>
        <Field label="Confirmez le mot de passe" htmlFor="rp-pw2">
          <PasswordInput id="rp-pw2" value={pw2} onChange={setPw2} autoComplete="new-password" />
        </Field>
        {error && <Alert kind="error">{error}</Alert>}
        <button type="submit" className="btn btn-primary btn-lg" disabled={busy}>{busy ? 'Enregistrement…' : 'Enregistrer le mot de passe'}</button>
      </form>
    </div>
  )
}

export function SignupPage() {
  useDocumentTitle('Créer un compte')
  const { status } = useAuth()
  const [email, setEmail] = useState('')
  const [name, setName] = useState('')
  const [password, setPassword] = useState('')
  const [accepted, setAccepted] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [sent, setSent] = useState(false)

  if (!isConfigured) return <ConfigNotice />
  if (status === 'authed') return <Navigate to="/" />

  async function submit(e: FormEvent) {
    e.preventDefault()
    if (!accepted) {
      setError('Vous devez lire et accepter les règles de la communauté pour créer un compte.')
      return
    }
    if (password.length < 8) {
      setError('Choisissez un mot de passe d’au moins 8 caractères.')
      return
    }
    setBusy(true)
    setError(null)
    try {
      const { needsConfirmation } = await api.signUp({ email: email.trim(), password, displayName: name, rulesVersion: RULES_VERSION })
      if (needsConfirmation) setSent(true)
      // sinon : la session s'ouvre automatiquement et AuthContext redirige
    } catch (err) {
      setError(friendlyError(err))
    } finally {
      setBusy(false)
    }
  }

  if (sent) {
    return (
      <div className="page narrow">
        <div className="card stack">
          <h1><Icon name="mail" /> Vérifiez votre boîte mail</h1>
          <Alert kind="success">
            Nous avons envoyé un message de confirmation à <strong>{email}</strong>. Cliquez sur le lien qu’il contient pour activer votre compte,
            puis revenez vous connecter. Pensez à regarder dans vos courriers indésirables.
          </Alert>
          <p className="hint">Il s’agit d’un message de sécurité nécessaire à la création du compte, pas d’une notification facultative. Aucun autre e-mail ne vous sera envoyé par défaut.</p>
          <Link to="/connexion" className="btn btn-primary">Aller à la connexion</Link>
        </div>
      </div>
    )
  }

  return (
    <div className="page narrow">
      <form className="card stack" onSubmit={submit}>
        <h1>Créer un compte</h1>
        <p className="muted">Un identifiant public du type <span className="mono accent">User#0001</span> vous sera attribué automatiquement. Votre adresse e-mail ne sera jamais affichée.</p>
        <Field label="Adresse e-mail" htmlFor="su-email" hint="Utilisée uniquement pour la connexion et les messages de sécurité.">
          <input id="su-email" className="input" type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
        </Field>
        <Field label="Nom d’affichage (facultatif)" htmlFor="su-name" hint="Visible par les autres membres. Vous pourrez le changer plus tard. Évitez votre nom complet si vous préférez rester discret.">
          <input id="su-name" className="input" type="text" maxLength={40} autoComplete="nickname" value={name} onChange={(e) => setName(e.target.value)} />
        </Field>
        <Field label="Mot de passe" htmlFor="su-password" hint="8 caractères minimum. Ne le communiquez jamais à personne.">
          <PasswordInput id="su-password" value={password} onChange={setPassword} autoComplete="new-password" describedBy="su-password-hint" />
        </Field>
        <label className="check">
          <input type="checkbox" checked={accepted} onChange={(e) => setAccepted(e.target.checked)} />
          <span>
            J’ai lu et j’accepte <a href={hrefTo('/regles')} target="_blank" rel="noopener">les règles de la communauté (s’ouvre dans un nouvel onglet)</a> et j’ai pris connaissance de la <a href={hrefTo('/confidentialite')} target="_blank" rel="noopener">page Confidentialité</a>.
          </span>
        </label>
        {error && <Alert kind="error">{error}</Alert>}
        <button type="submit" className="btn btn-primary btn-lg" disabled={busy}>{busy ? 'Création…' : 'Créer mon compte'}</button>
        <p className="muted">
          Déjà inscrit ? <Link to="/connexion">Se connecter</Link>
        </p>
      </form>
    </div>
  )
}
