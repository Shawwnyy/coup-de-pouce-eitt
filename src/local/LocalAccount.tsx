import { useState } from 'react'
import { Alert, Icon } from '../components/ui'
import { useAuth } from '../context/AuthContext'
import { downloadJson } from '../lib/download'
import { friendlyError } from '../lib/errors'
import { useNavigate } from '../lib/router'
import { deleteAccount, exportMyData, wipeAllLocalData } from './localApi'

/** Remplace la section « Compte » : il n'y a ni e-mail ni mot de passe en version locale. */
export function LocalAccountSection() {
  const { profile, userId, signOut } = useAuth()
  const navigate = useNavigate()
  const [error, setError] = useState<string | null>(null)
  const [step, setStep] = useState<'none' | 'profile' | 'all'>('none')

  async function run(f: () => Promise<void> | void) {
    setError(null)
    try {
      await f()
    } catch (e) {
      setError(friendlyError(e))
    }
  }

  return (
    <div className="stack">
      <div className="card stack">
        <h2>Profil local {profile?.public_id}</h2>
        <p>Ce profil existe uniquement dans ce navigateur : pas d’e-mail, pas de mot de passe. Pour changer de profil, créer ou supprimer un profil, ouvrez la liste des profils.</p>
        <div className="row">
          <button type="button" className="btn" onClick={() => void run(async () => { await signOut(); navigate('/connexion') })}>
            <Icon name="logout" size={18} /> Changer de profil
          </button>
        </div>
      </div>
      <div className="card stack">
        <h2>Télécharger mes données</h2>
        <p>Une copie de votre profil, réglages, demandes d’aide et messages écrits, en fichier JSON fabriqué dans votre navigateur.</p>
        <div>
          <button
            type="button"
            className="btn"
            onClick={() => void run(async () => downloadJson(`coup-de-pouce-${profile?.public_id.replace('#', '-')}-${new Date().toISOString().slice(0, 10)}.json`, await exportMyData(userId as string)))}
          >
            <Icon name="download" size={18} /> Télécharger (JSON)
          </button>
        </div>
      </div>
      <div className="card stack">
        <h2>Supprimer</h2>
        {error && <Alert kind="error">{error}</Alert>}
        {step === 'none' && (
          <div className="row">
            <button type="button" className="btn btn-danger-ghost" onClick={() => setStep('profile')}><Icon name="trash" size={18} /> Supprimer ce profil</button>
            <button type="button" className="btn btn-danger-ghost" onClick={() => setStep('all')}><Icon name="trash" size={18} /> Tout effacer sur cet appareil</button>
          </div>
        )}
        {step === 'profile' && (
          <div className="stack">
            <Alert kind="warn">Le profil {profile?.public_id}, ses messages, ses fichiers et ses demandes d’aide seront supprimés définitivement. Son numéro ne sera jamais réutilisé.</Alert>
            <div className="row">
              <button type="button" className="btn btn-danger" onClick={() => void run(async () => { await deleteAccount(userId as string); navigate('/connexion') })}>Oui, supprimer</button>
              <button type="button" className="btn" onClick={() => setStep('none')}>Annuler</button>
            </div>
          </div>
        )}
        {step === 'all' && (
          <div className="stack">
            <Alert kind="warn">Tous les profils, messages, fichiers et demandes d’aide de ce navigateur seront effacés, définitivement. La numérotation repartira de User#0001.</Alert>
            <div className="row">
              <button type="button" className="btn btn-danger" onClick={() => void run(() => { wipeAllLocalData(); navigate('/connexion') })}>Oui, tout effacer</button>
              <button type="button" className="btn" onClick={() => setStep('none')}>Annuler</button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
