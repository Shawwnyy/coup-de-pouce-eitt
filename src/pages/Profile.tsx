import { useState } from 'react'
import { ConfirmDialog, ReportDialog } from '../components/Dialogs'
import { useContact } from '../components/UserCard'
import { Alert, Avatar, EmptyState, Icon, PageLoading } from '../components/ui'
import { useAuth } from '../context/AuthContext'
import * as api from '../lib/api'
import { friendlyError } from '../lib/errors'
import { displayName, formatDate } from '../lib/format'
import { useAsync, useCopy, useDocumentTitle } from '../lib/hooks'
import { Link, useParams } from '../lib/router'
import type { Profile } from '../types'

function ProfileView({ profile, isMe }: { profile: Profile; isMe: boolean }) {
  const { contact, busy, error } = useContact()
  const { copied, copy } = useCopy()
  const blocked = useAsync(() => (isMe ? Promise.resolve(false) : api.isBlockedByMe(profile.id)), [profile.id, isMe])
  const [reporting, setReporting] = useState(false)
  const [confirmBlock, setConfirmBlock] = useState(false)
  const [working, setWorking] = useState(false)
  const [actionError, setActionError] = useState<string | null>(null)
  useDocumentTitle(isMe ? 'Mon profil' : `Profil ${profile.public_id}`)

  async function toggleBlock(block: boolean) {
    setWorking(true)
    setActionError(null)
    try {
      if (block) await api.blockUser(profile.id)
      else await api.unblockUser(profile.id)
      blocked.setData(block)
      setConfirmBlock(false)
    } catch (e) {
      setActionError(friendlyError(e))
    } finally {
      setWorking(false)
    }
  }

  return (
    <div className="page narrow">
      <article className="card profile-card stack">
        <div className="profile-head">
          <Avatar profile={profile} size={96} />
          <div>
            <h1>{displayName(profile)}</h1>
            <p className="mono accent big">{profile.public_id}</p>
            <p className="muted">Membre depuis le {formatDate(profile.created_at)}</p>
          </div>
        </div>
        {profile.bio ? <p className="rich">{profile.bio}</p> : <p className="muted">{isMe ? 'Vous n’avez pas encore rédigé de présentation.' : 'Cette personne n’a pas rédigé de présentation.'}</p>}

        <div className="row">
          <button type="button" className="btn btn-sm" onClick={() => copy(profile.public_id)}>
            <Icon name={copied ? 'check' : 'copy'} size={16} /> {copied ? 'Identifiant copié' : 'Copier l’identifiant'}
          </button>
          {isMe ? (
            <Link to="/parametres/profil" className="btn btn-primary btn-sm"><Icon name="settings" size={16} /> Modifier mon profil</Link>
          ) : (
            <>
              {!blocked.data && (
                <button type="button" className="btn btn-primary btn-sm" disabled={busy} onClick={() => contact(profile.id)}>
                  <Icon name="chat" size={16} /> {busy ? 'Ouverture…' : 'Envoyer un message'}
                </button>
              )}
              <button type="button" className="btn btn-sm" onClick={() => setReporting(true)}><Icon name="flag" size={16} /> Signaler</button>
              {blocked.data ? (
                <button type="button" className="btn btn-sm" disabled={working} onClick={() => toggleBlock(false)}><Icon name="block" size={16} /> Débloquer</button>
              ) : (
                <button type="button" className="btn btn-sm btn-danger-ghost" onClick={() => setConfirmBlock(true)}><Icon name="block" size={16} /> Bloquer</button>
              )}
            </>
          )}
        </div>
        {isMe && <p className="hint">Partagez votre identifiant pour que l’on puisse vous retrouver : votre adresse e-mail reste privée.</p>}
        {blocked.data && <Alert kind="warn">Vous avez bloqué cette personne : elle ne peut plus vous écrire et vous ne pouvez plus lui écrire.</Alert>}
        {error && <Alert kind="error">{error}</Alert>}
        {actionError && <Alert kind="error">{actionError}</Alert>}
      </article>

      {reporting && <ReportDialog kind="profile" targetId={profile.id} onClose={() => setReporting(false)} />}
      {confirmBlock && (
        <ConfirmDialog title={`Bloquer ${profile.public_id} ?`} confirmLabel="Bloquer" danger busy={working} error={actionError} onConfirm={() => toggleBlock(true)} onCancel={() => setConfirmBlock(false)}>
          Vous ne pourrez plus vous écrire, et cette personne ne pourra plus vous retrouver par la recherche. Elle n’est pas prévenue. Vous pouvez débloquer à tout moment depuis son profil ou dans Paramètres › Confidentialité.
        </ConfirmDialog>
      )}
    </div>
  )
}

export default function ProfilePage() {
  const { id } = useParams()
  const { userId, profile: mine } = useAuth()
  const isMe = !id || id === userId
  const other = useAsync(() => (isMe ? Promise.resolve(null) : api.fetchProfile(id as string)), [id, isMe])
  if (isMe) return mine ? <ProfileView profile={mine} isMe /> : <PageLoading />
  if (other.loading) return <PageLoading />
  if (other.error) return <div className="page narrow"><Alert kind="error">{other.error}</Alert></div>
  if (!other.data) {
    return (
      <div className="page narrow">
        <EmptyState icon="user" title="Profil introuvable" action={<Link to="/recherche" className="btn">Rechercher un utilisateur</Link>}>
          Ce profil n’existe pas ou n’est plus disponible.
        </EmptyState>
      </div>
    )
  }
  return <ProfileView profile={other.data} isMe={false} />
}
