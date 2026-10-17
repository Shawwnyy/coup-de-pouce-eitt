import { useState } from 'react'
import * as api from '../lib/api'
import { friendlyError } from '../lib/errors'
import { displayName } from '../lib/format'
import { Link, useNavigate } from '../lib/router'
import type { SearchResult } from '../types'
import { Alert, Avatar, Icon } from './ui'

/** Démarre (ou retrouve) la conversation privée avec un utilisateur, puis l'ouvre. */
export function useContact() {
  const navigate = useNavigate()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  async function contact(userId: string, draft?: string) {
    setBusy(true)
    setError(null)
    try {
      const id = await api.startConversation(userId)
      navigate(`/messages/${id}${draft ? `?brouillon=${encodeURIComponent(draft)}` : ''}`)
    } catch (e) {
      setError(friendlyError(e))
      setBusy(false)
    }
  }
  return { contact, busy, error }
}

export function UserCard({ user, isMe }: { user: SearchResult; isMe: boolean }) {
  const { contact, busy, error } = useContact()
  return (
    <article className="card user-card" aria-label={`Profil ${user.public_id}`}>
      <Avatar profile={user} size={56} />
      <div className="user-card-body">
        <h3>{displayName(user)}</h3>
        <p className="mono accent">{user.public_id}</p>
        {user.bio && <p className="muted">{user.bio}</p>}
        {isMe && <p className="hint">C’est vous.</p>}
        {!isMe && !user.can_contact && <p className="hint">Cette personne ne peut pas être contactée pour le moment.</p>}
        {error && <Alert kind="error">{error}</Alert>}
        <div className="row">
          <Link to={isMe ? '/profil' : `/profil/${user.id}`} className="btn btn-sm">
            <Icon name="user" size={16} /> Voir le profil
          </Link>
          {!isMe && user.can_contact && (
            <button type="button" className="btn btn-sm btn-primary" disabled={busy} onClick={() => contact(user.id)}>
              <Icon name="chat" size={16} /> {busy ? 'Ouverture…' : 'Envoyer un message'}
            </button>
          )}
        </div>
      </div>
    </article>
  )
}
