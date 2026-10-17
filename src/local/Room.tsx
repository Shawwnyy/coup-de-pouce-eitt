import { useEffect, useLayoutEffect, useRef, useState, type FormEvent } from 'react'
import { ConfirmDialog } from '../components/Dialogs'
import { Menu } from '../components/Menu'
import { Alert, Avatar, Icon } from '../components/ui'
import { friendlyError } from '../lib/errors'
import { formatTimeSeconds } from '../lib/format'
import { useDocumentTitle } from '../lib/hooks'
import { deleteRoomMessage, editRoomMessage, getRoomInfo, getRoomTypers, joinRoom, listRoom, muteRoomUser, sendRoom, sendRoomTyping, setOnline, subscribeOnlineStatus, subscribeRoom, unmuteRoomUser, type RoomInfo, type RoomTypist, type RoomView } from './localApi'

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

/** Personnes qui écrivent : remis à jour à chaque événement et chaque seconde (l'indicateur s'éteint tout seul). */
function useTypers(): RoomTypist[] {
  const [list, setList] = useState<RoomTypist[]>(() => getRoomTypers())
  useEffect(() => {
    const update = () => setList((old) => {
      const next = getRoomTypers()
      return old.length === next.length && old.every((o, i) => o.n === next[i].n && o.label === next[i].label) ? old : next
    })
    update()
    const off = subscribeRoom(update)
    const t = window.setInterval(update, 1000)
    return () => {
      off()
      window.clearInterval(t)
    }
  }, [])
  return list
}

function typingSentence(list: RoomTypist[]): string {
  if (list.length === 1) return `${list[0].label} est en train d’écrire…`
  if (list.length === 2) return `${list[0].label} et ${list[1].label} sont en train d’écrire…`
  return `${list[0].label}, ${list[1].label} et ${list.length - 2} autre${list.length - 2 > 1 ? 's' : ''} sont en train d’écrire…`
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

function Line({ m, onMute, onDelete }: { m: RoomView; onMute: () => void; onDelete: () => void }) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(m.c)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const max = 300
  async function save() {
    if (busy) return
    if (!draft.trim()) return
    setBusy(true)
    setErr(null)
    try {
      await editRoomMessage(m.id, draft)
      setEditing(false)
    } catch (e) {
      setErr(friendlyError(e))
    } finally {
      setBusy(false)
    }
  }
  return (
    <li className={`room-msg${m.mine ? ' mine' : ''}`} data-mid={m.id}>
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
          <time dateTime={m.t} className="room-time muted" title={m.src === 'n' && !m.mine ? 'Heure de réception par le relais' : undefined}>{formatTimeSeconds(m.t)}</time>
          {m.mine ? (
            <Menu label="Actions sur votre message" align="right">
              <button type="button" className="menu-item" onClick={() => { setDraft(m.c); setErr(null); setEditing(true) }}><Icon name="doc" size={16} /> Modifier</button>
              <button type="button" className="menu-item danger" onClick={onDelete}><Icon name="trash" size={16} /> Supprimer</button>
            </Menu>
          ) : (
            <Menu label={`Actions sur le message de ${m.n}`} align="right">
              <button type="button" className="menu-item danger" onClick={onMute}><Icon name="block" size={16} /> Masquer cette personne</button>
            </Menu>
          )}
        </div>
        {editing ? (
          <div className="room-edit stack">
            <textarea
              className="input"
              rows={2}
              aria-label="Modifier le message"
              value={draft}
              maxLength={max + 100}
              autoFocus
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Escape') setEditing(false)
                else if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
                  e.preventDefault()
                  void save()
                }
              }}
            />
            {err && <Alert kind="error">{err}</Alert>}
            <div className="row">
              <button type="button" className="btn btn-primary btn-sm" disabled={busy || !draft.trim() || draft.length > max} onClick={() => void save()}>Enregistrer</button>
              <button type="button" className="btn btn-sm" onClick={() => setEditing(false)}>Annuler</button>
              <span className={`hint${draft.length > max ? ' field-error' : ''}`}>{draft.length}/{max}</span>
            </div>
          </div>
        ) : (
          <p className="room-text">{m.c}{m.e && <span className="room-edited muted" title={`Modifié à ${formatTimeSeconds(m.e)}`}> (modifié)</span>}</p>
        )}
      </div>
    </li>
  )
}

export function RoomPage() {
  useDocumentTitle('Discussion générale')
  const { info, msgs } = useRoom()
  const typers = useTypers()
  const [toDelete, setToDelete] = useState<RoomView | null>(null)
  const [delBusy, setDelBusy] = useState(false)
  const [delError, setDelError] = useState<string | null>(null)
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
        <h1>Discussion générale</h1>
        <p className="muted">Un salon de discussion pour tous les profils : écrivez, modifiez ou supprimez vos messages.</p>
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
            {msgs.map((m) => <Line key={m.id} m={m} onMute={() => { try { muteRoomUser(`${m.n}|${m.fp}`) } catch (e) { setError(friendlyError(e)) } }} onDelete={() => { setDelError(null); setToDelete(m) }} />)}
          </ul>
        )}
      </div>

      <p className="room-typing" role="status" aria-live="polite">{typers.length > 0 ? <><span className="typing-dots" aria-hidden="true"><i /><i /><i /></span> {typingSentence(typers)}</> : '\u00a0'}</p>

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
            onChange={(e) => {
              setText(e.target.value)
              if (e.target.value.trim().length >= 2) sendRoomTyping()
            }}
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
      {toDelete && (
        <ConfirmDialog
          title="Supprimer ce message ?"
          confirmLabel="Supprimer"
          danger
          busy={delBusy}
          error={delError}
          onCancel={() => setToDelete(null)}
          onConfirm={() => {
            setDelBusy(true)
            setDelError(null)
            deleteRoomMessage(toDelete.id)
              .then(() => setToDelete(null))
              .catch((e) => setDelError(friendlyError(e)))
              .finally(() => setDelBusy(false))
          }}
        >
          <p>« {toDelete.c.length > 80 ? `${toDelete.c.slice(0, 80)}…` : toDelete.c} »</p>
          {toDelete.src === 'n' ? (
            <p className="muted">Une demande de suppression signée part sur le relais : le message disparaît chez les personnes qui sont connectées ou qui se connecteront. Celles qui l’ont déjà lu l’ont lu, et le relais peut le garder quelques heures.</p>
          ) : (
            <p className="muted">Le message disparaît pour tous les profils de cet appareil.</p>
          )}
        </ConfirmDialog>
      )}
    </div>
  )
}
