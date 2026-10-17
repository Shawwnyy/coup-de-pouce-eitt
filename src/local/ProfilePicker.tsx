import { useState } from 'react'
import type { FormEvent } from 'react'
import { Alert, Avatar, Field, Icon } from '../components/ui'
import { useDocumentTitle } from '../lib/hooks'
import { friendlyError } from '../lib/errors'
import { Link, useNavigate, useSearchParams } from '../lib/router'
import { createLocalProfile, deleteAccount, isStorageDurable, listLocalProfiles, nextPublicId, updateProfile, useLocalProfile } from './localApi'

/** On n'accepte que des chemins internes. */
function safeNext(raw: string | null): string {
  return raw && raw.startsWith('/') && !raw.startsWith('//') && !raw.includes('\\') ? raw : '/'
}

/** Remplace connexion + inscription : choisir, créer, renommer ou supprimer un profil gardé dans ce navigateur. */
export function ProfilePicker() {
  useDocumentTitle('Choisir un profil')
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const next = safeNext(params.get('next'))
  const [, setTick] = useState(0)
  const refresh = () => setTick((t) => t + 1)
  const profiles = listLocalProfiles()
  const [name, setName] = useState('')
  const [accept, setAccept] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [editing, setEditing] = useState<string | null>(null)
  const [draft, setDraft] = useState('')
  const [confirmDel, setConfirmDel] = useState<string | null>(null)

  function use(id: string) {
    try {
      useLocalProfile(id)
      navigate(next, { replace: true })
    } catch (e) {
      setError(friendlyError(e))
    }
  }

  function create(e: FormEvent) {
    e.preventDefault()
    setError(null)
    try {
      createLocalProfile({ displayName: name, acceptRules: accept })
      navigate(next, { replace: true })
    } catch (err) {
      setError(friendlyError(err, 'Impossible d’enregistrer le profil dans ce navigateur.'))
    }
  }

  async function rename(id: string) {
    setError(null)
    try {
      await updateProfile(id, { display_name: draft })
      setEditing(null)
      refresh()
    } catch (err) {
      setError(friendlyError(err))
    }
  }

  async function remove(id: string) {
    setError(null)
    try {
      await deleteAccount(id)
      setConfirmDel(null)
      refresh()
    } catch (err) {
      setError(friendlyError(err))
    }
  }

  return (
    <div className="page narrow">
      <header className="page-head">
        <h1>{profiles.length ? 'Choisissez votre profil' : 'Bienvenue sur Coup de Pouce'}</h1>
        <p className="muted">Pas d’inscription, pas de mot de passe : un clic crée un profil gardé dans ce navigateur.</p>
      </header>

      <Alert kind="info" title="Version locale : tout reste sur cet appareil">
        Vos profils, messages, images, vidéos et liens sont enregistrés uniquement dans ce navigateur. Il n’y a pas de serveur : les conversations ont lieu
        entre les profils créés ici (créez-en deux pour essayer). Vider les données du navigateur efface tout.
      </Alert>
      {!isStorageDurable() && (
        <Alert kind="warn" title="Enregistrement impossible">
          Ce navigateur bloque le stockage local (navigation privée ?) : vos données seront perdues à la fermeture de l’onglet.
        </Alert>
      )}
      {error && <Alert kind="error">{error}</Alert>}

      {profiles.length > 0 && (
        <section className="stack" aria-label="Profils enregistrés">
          <h2>Profils sur cet appareil</h2>
          <ul className="stack profile-list">
            {profiles.map(({ id, profile, rulesOk }) => (
              <li key={id} className="card stack">
                <div className="row">
                  <Avatar profile={profile} size={48} />
                  <div className="grow">
                    <strong>{profile.public_id}</strong>
                    <div className="muted">{profile.display_name ?? 'Sans nom'}{!rulesOk && ' · règles à accepter'}</div>
                  </div>
                  <button type="button" className="btn btn-primary" onClick={() => use(id)} aria-label={`Utiliser le profil ${profile.public_id}`}>
                    <Icon name="check" size={18} /> Utiliser
                  </button>
                </div>
                {editing === id ? (
                  <form className="row" onSubmit={(e) => { e.preventDefault(); void rename(id) }}>
                    <label className="sr-only" htmlFor={`rename-${id}`}>Nouveau nom pour {profile.public_id}</label>
                    <input id={`rename-${id}`} className="input grow" value={draft} maxLength={40} autoFocus onChange={(e) => setDraft(e.target.value)} placeholder="Nom affiché" />
                    <button type="submit" className="btn btn-sm btn-primary">Enregistrer</button>
                    <button type="button" className="btn btn-sm" onClick={() => setEditing(null)}>Annuler</button>
                  </form>
                ) : confirmDel === id ? (
                  <div className="stack">
                    <Alert kind="warn">Supprimer {profile.public_id} efface aussi ses messages, fichiers et demandes d’aide, définitivement.</Alert>
                    <div className="row">
                      <button type="button" className="btn btn-danger btn-sm" onClick={() => void remove(id)}>Oui, supprimer {profile.public_id}</button>
                      <button type="button" className="btn btn-sm" onClick={() => setConfirmDel(null)}>Annuler</button>
                    </div>
                  </div>
                ) : (
                  <div className="row">
                    <button type="button" className="btn btn-sm" onClick={() => { setEditing(id); setDraft(profile.display_name ?? '') }}>Modifier le nom</button>
                    <button type="button" className="btn btn-sm btn-danger-ghost" onClick={() => setConfirmDel(id)}><Icon name="trash" size={16} /> Supprimer</button>
                  </div>
                )}
              </li>
            ))}
          </ul>
        </section>
      )}

      <form className="card stack" onSubmit={create}>
        <h2>{profiles.length ? 'Créer un autre profil' : 'Créer mon profil'}</h2>
        <p className="muted">Votre identifiant public sera <strong>{nextPublicId()}</strong>. Les autres le saisissent pour vous trouver.</p>
        <Field label="Nom affiché (facultatif)" htmlFor="new-name" hint="Vous pourrez le changer plus tard. Inutile d’utiliser votre vrai nom.">
          <input id="new-name" className="input" value={name} maxLength={40} onChange={(e) => setName(e.target.value)} autoComplete="off" />
        </Field>
        <label className="check">
          <input type="checkbox" checked={accept} onChange={(e) => setAccept(e.target.checked)} />
          <span>
            J’ai lu et j’accepte <Link to="/regles">les règles de la communauté</Link> (le lien s’ouvre dans cette fenêtre) et la page <Link to="/confidentialite">Confidentialité</Link>.
          </span>
        </label>
        <button type="submit" className="btn btn-primary btn-lg" disabled={!accept}>
          <Icon name="plus" size={20} /> Créer {nextPublicId()} et commencer
        </button>
      </form>
    </div>
  )
}
