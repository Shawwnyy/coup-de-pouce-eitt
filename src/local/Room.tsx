import { useEffect, useLayoutEffect, useRef, useState, type FormEvent } from 'react'
import { ConfirmDialog } from '../components/Dialogs'
import { Menu } from '../components/Menu'
import { Alert, Avatar, Icon } from '../components/ui'
import { friendlyError } from '../lib/errors'
import { formatTime } from '../lib/format'
import { useDocumentTitle } from '../lib/hooks'
import { getRoomInfo, joinRoom, listRoom, muteRoomUser, sendRoom, setOnline, subscribeOnlineStatus, subscribeRoom, unmuteRoomUser, type RoomInfo, type RoomView } from './localApi'

const relayHost = (url: string): string => {
  try {
    return new URL(url).host
  } catch {
    return url
  }
}

/** Salon + état, remis à jour à chaque nouveau message, changement de connexion, et toutes les 2 s. */
function useRoom(): { info: RoomInfo; msgs: RoomView[] } {
  const [state, setState] = useState(() => ({ info: getRoomInfo(), msgs: listRoom() }))
  useEffect(() => {
    const update = () => setState({ info: getRoomInfo(), msgs: listRoom() })
    update()
    const offA = subscribeRoom(update)
    const offB = subscribeOnlineStatus(update)
    const t = window.setInterval(update, 2000)
    return () => {
      offA()
      offB()
      window.clearInterval(t)
    }
  }, [])
  return state
}

function JoinDialog({ info, onClose }: { info: RoomInfo; onClose: () => void }) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  async function go() {
    setBusy(true)
    setError(null)
    try {
      if (!info.online) await setOnline(true)
      await joinRoom(true)
      onClose()
    } catch (e) {
      setError(friendlyError(e))
      setBusy(false)
    }
  }
  return (
    <ConfirmDialog title="Rejoindre le salon public ?" confirmLabel={info.online ? 'Rejoindre le salon' : 'Passer en ligne et rejoindre'} busy={busy} error={error} onConfirm={() => void go()} onCancel={onClose}>
      <div className="stack">
        <p>
          En rejoignant, <strong>tout ce que vous écrivez dans le salon est public</strong> : lisible par toute personne qui a rejoint le salon, même sans vous connaître, avec votre identifiant, votre nom affiché et une empreinte de votre clé.
        </p>
        <ul>
          <li><strong>Aucune modération</strong> : personne ne relit ni ne retire les messages. Vous pouvez masquer quelqu’un chez vous.</li>
          <li><strong>Les noms ne sont pas vérifiés</strong> : n’importe qui peut écrire sous le nom qu’il veut. Seule l’empreinte (#a1b2c3) prouve que deux messages viennent de la même clé.</li>
          <li>Ne partagez <strong>ni mot de passe, ni adresse, ni téléphone, ni code reçu par SMS</strong>. Les liens ne sont pas cliquables.</li>
          <li>Ça passe par le relais public {relayHost(info.relay)} (qui voit votre adresse internet), limité en nombre de messages et qui ne garde les messages que quelques heures.</li>
          {!info.online && <li>Vous passez en ligne ; vous pourrez quitter le salon et repasser hors ligne à tout moment.</li>}
        </ul>
      </div>
    </ConfirmDialog>
  )
}

function Line({ m, onMute }: { m: RoomView; onMute: () => void }) {
  return (
    <li className={`room-msg${m.mine ? ' mine' : ''}`}>
      <Avatar profile={{ display_name: m.d, public_id: m.n, avatar_path: null }} size={34} />
      <div className="room-body">
        <div className="room-meta">
          <strong>{m.d || 'Sans nom'}</strong> <span className="mono muted">{m.n}</span>
          {m.src === 'n' ? (
            <span className="chip static room-tag" title="Signé : l’empreinte identifie la clé, pas la personne"><Icon name="globe" size={12} /> en ligne · #{m.fp}</span>
          ) : (
            <span className="chip static room-tag"><Icon name="laptop" size={12} /> cet appareil</span>
          )}
          {m.bad && <span className="chip static room-bad" role="note"><Icon name="alert" size={12} /> autre clé que d’habitude pour ce numéro : autre personne ou usurpation</span>}
          <time dateTime={m.t} className="muted">{formatTime(m.t)}</time>
          {!m.mine && (
            <Menu label={`Actions sur le message de ${m.n}`} align="right">
              <button type="button" className="menu-item danger" onClick={onMute}><Icon name="block" size={16} /> Masquer cette personne</button>
            </Menu>
          )}
        </div>
        <p className="room-text">{m.c}</p>
      </div>
    </li>
  )
}

export function RoomPage() {
  useDocumentTitle('Salon général')
  const { info, msgs } = useRoom()
  const [text, setText] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [joinOpen, setJoinOpen] = useState(false)
  const listRef = useRef<HTMLDivElement>(null)
  const stick = useRef(true)

  useLayoutEffect(() => {
    const el = listRef.current
    if (el && stick.current) el.scrollTop = el.scrollHeight
  }, [msgs.length])

  async function submit(e?: FormEvent) {
    e?.preventDefault()
    if (!text.trim() || busy) return
    setBusy(true)
    setError(null)
    try {
      await sendRoom(text)
      setText('')
      stick.current = true
    } catch (err) {
      setError(friendlyError(err))
    } finally {
      setBusy(false)
    }
  }

  const tooLong = text.length > info.maxChars
  return (
    <div className="page room-page">
      <header className="page-head">
        <h1>Salon général</h1>
        <p className="muted">Un salon de discussion pour tous les profils.</p>
      </header>

      <Alert kind="warn" title="Salon ouvert à tous, sans modération">
        Tout ce que vous écrivez ici peut être lu par tous ceux qui sont dans le salon. <strong>Les noms ne sont pas vérifiés</strong> : fiez-vous à l’empreinte (#a1b2c3), pas au nom.
        Ne partagez ni mot de passe, ni adresse, ni téléphone, ni code reçu par SMS. Les liens ne sont pas cliquables. Pour parler en privé, utilisez les <a href="#/messages">Messages</a>.
      </Alert>

      <section className="card stack" aria-label="Où va ce que vous écrivez">
        {info.joined ? (
          <>
            <p><span className="chip static chip-ok"><Icon name="globe" size={14} /> En ligne · salon public</span> Vos messages sont publics et signés (votre empreinte : <strong className="mono">#{info.fp}</strong>). Vous voyez aussi ceux écrits depuis cet appareil.</p>
            <div className="row"><button type="button" className="btn btn-sm" onClick={() => void joinRoom(false)}>Quitter le salon en ligne</button></div>
          </>
        ) : (
          <>
            <p><span className="chip static"><Icon name="laptop" size={14} /> Cet appareil seulement</span> Vos messages ne sont vus que par les profils de ce navigateur. Pour parler avec des personnes sur d’autres appareils, rejoignez le salon en ligne.</p>
            <div className="row"><button type="button" className="btn btn-primary btn-sm" onClick={() => setJoinOpen(true)}><Icon name="globe" size={16} /> Rejoindre le salon en ligne</button></div>
          </>
        )}
      </section>

      <div className="room-list" ref={listRef} role="log" aria-live="polite" aria-label="Messages du salon" onScroll={(e) => { const el = e.currentTarget; stick.current = el.scrollHeight - el.scrollTop - el.clientHeight < 60 }}>
        {msgs.length === 0 ? (
          <p className="muted room-empty">Aucun message pour l’instant. Écrivez le premier, avec bienveillance.</p>
        ) : (
          <ul className="room-ul">
            {msgs.map((m) => <Line key={m.id} m={m} onMute={() => { try { muteRoomUser(`${m.n}|${m.fp}`) } catch (e) { setError(friendlyError(e)) } }} />)}
          </ul>
        )}
      </div>

      <form className="room-composer" onSubmit={(e) => void submit(e)}>
        {error && <Alert kind="error">{error}</Alert>}
        <div className="composer-row">
          <label htmlFor="room-text" className="sr-only">Votre message au salon</label>
          <textarea
            id="room-text"
            className="input composer-text"
            rows={1}
            placeholder="Écrire dans le salon…"
            value={text}
            maxLength={info.maxChars + 100}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
                e.preventDefault()
                void submit()
              }
            }}
          />
          <button type="submit" className="btn btn-primary send-btn" disabled={busy || !text.trim() || tooLong}>
            <Icon name="send" size={18} /> <span className="send-label">Envoyer</span>
          </button>
        </div>
        <p className={`hint${tooLong ? ' field-error' : ''}`}>{text.length}/{info.maxChars} · {info.joined ? 'public, en ligne' : 'cet appareil seulement'} · pas de pièce jointe, pas de lien cliquable.</p>
      </form>

      {info.muted.length > 0 && (
        <details className="card stack">
          <summary>Personnes masquées ({info.muted.length})</summary>
          <ul className="stack profile-list">
            {info.muted.map((u) => (
              <li key={u.key} className="row">
                <div className="grow"><strong>{u.d || 'Sans nom'}</strong> <span className="mono muted">{u.n}</span> <span className="muted">{u.key.split('|')[1] ? `#${u.key.split('|')[1]}` : 'cet appareil'}</span></div>
                <button type="button" className="btn btn-sm" onClick={() => unmuteRoomUser(u.key)}>Réafficher</button>
              </li>
            ))}
          </ul>
        </details>
      )}
      {joinOpen && <JoinDialog info={info} onClose={() => setJoinOpen(false)} />}
    </div>
  )
}
