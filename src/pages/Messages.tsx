import { Fragment, useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import type { FormEvent } from 'react'
import { ConfirmDialog, ReportDialog } from '../components/Dialogs'
import { Menu } from '../components/Menu'
import { MediaAttachment } from '../components/Media'
import { RichText } from '../components/RichText'
import { Alert, Avatar, EmptyState, Icon, Spinner } from '../components/ui'
import { useAuth } from '../context/AuthContext'
import { useNotify } from '../context/NotifyContext'
import * as api from '../lib/api'
import type { OutgoingFile } from '../lib/api'
import { LIMITS } from '../lib/config'
import { friendlyError } from '../lib/errors'
import { previewUrl, validateFile } from '../lib/files'
import { dayKey, displayName, formatBytes, formatDateTime, formatDayLabel, formatShort, formatTime } from '../lib/format'
import { useAsync, useCopy, useDocumentTitle } from '../lib/hooks'
import { LOCAL } from '../lib/mode'
import { CrossDeviceGuide, NetBadge, OnlineConvNotice } from '../local/OnlineBar'
import { conversationLink, editMessage, isPeerTyping, sendTyping, subscribeMessageChanges, subscribeTyping } from '../local/localApi'
import { CHAT_POLICY } from '../lib/policies'
import { Link, NavLink, useNavigate, useParams, useSearchParams } from '../lib/router'
import type { ConversationSummary, Message } from '../types'

const ACCEPT = 'image/png,image/jpeg,image/webp,image/gif,video/mp4,video/webm'

interface Pending {
  key: string
  content: string
  file: OutgoingFile | null
  previewUrl: string | null
  status: 'sending' | 'failed'
  error?: string
}

function preview(c: ConversationSummary, me: string | null): string {
  const mine = c.last_message_sender === me ? 'Vous : ' : ''
  if (c.last_message_content) return mine + c.last_message_content
  if (c.last_has_attachment) return `${mine}Média joint`
  return 'Aucun message pour l’instant'
}

function ConversationList({ items, loading, error, reload }: { items: ConversationSummary[] | null; loading: boolean; error: string | null; reload: () => void }) {
  const { userId } = useAuth()
  const { prefs } = useNotify()
  return (
    <aside className="conv-list" aria-label="Vos conversations">
      <div className="conv-head">
        <h1>Messages</h1>
        <Link to="/recherche" className="btn btn-sm btn-primary"><Icon name="plus" size={16} /> Nouveau</Link>
      </div>
      {LOCAL && <Link to="/salon" className="conv-salon"><Icon name="globe" size={16} /> Salon général (tout le monde)</Link>}
      {loading && !items && <Spinner />}
      {error && (
        <div className="stack">
          <Alert kind="error">{error}</Alert>
          <button type="button" className="btn btn-sm" onClick={reload}>Réessayer</button>
        </div>
      )}
      {items && items.length === 0 && (
        <EmptyState icon="chat" title="Aucune conversation" action={<Link to="/recherche" className="btn btn-primary btn-sm">Rechercher un utilisateur</Link>}>
          {LOCAL ? 'Retrouvez quelqu’un par son nom ou son identifiant pour lui écrire (après acceptation de votre demande d’ajout).' : 'Retrouvez quelqu’un grâce à son identifiant (par exemple User#0001) pour lui écrire.'}
        </EmptyState>
      )}
      {LOCAL && items && items.length === 0 && <div className="guide-narrow"><CrossDeviceGuide /></div>}
      <ul className="conv-items">
        {items?.map((c) => (
          <li key={c.conversation_id}>
            <NavLink to={`/messages/${c.conversation_id}`} className="conv-item">
              <Avatar profile={{ display_name: c.other_display_name, public_id: c.other_public_id, avatar_path: c.other_avatar_path }} size={44} />
              <span className="conv-main">
                <span className="conv-top">
                  <strong>{c.other_display_name || c.other_public_id}</strong>
                  {c.last_message_at && <time dateTime={c.last_message_at}>{formatShort(c.last_message_at)}</time>}
                </span>
                {c.other_display_name && <span className="mono small">{c.other_public_id}</span>}
                <span className="conv-preview">{c.blocked_by_me ? 'Utilisateur bloqué' : preview(c, userId)}</span>
              </span>
              {prefs.inapp_indicator && c.unread_count > 0 && (
                <span className="count" aria-label={`${c.unread_count} message${c.unread_count > 1 ? 's' : ''} non lu${c.unread_count > 1 ? 's' : ''}`}>{c.unread_count}</span>
              )}
            </NavLink>
          </li>
        ))}
      </ul>
    </aside>
  )
}

function CopyItem({ text }: { text: string }) {
  const { copied, copy } = useCopy()
  return (
    <button type="button" className="menu-item" onClick={(e) => { e.stopPropagation(); copy(text) }}>
      <Icon name={copied ? 'check' : 'copy'} size={16} /> {copied ? 'Texte copié' : 'Copier le texte'}
    </button>
  )
}

function MessageItem({ m, mine, peerName, onReport, onDelete, onEdit }: { m: Message; mine: boolean; peerName: string; onReport: () => void; onDelete: () => void; onEdit: (m: Message, text: string) => Promise<void> }) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(m.content)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const canEdit = LOCAL && mine && (m.content !== '' || m.message_attachments.length === 0)
  async function save() {
    if (!draft.trim() && m.message_attachments.length === 0) return
    setBusy(true)
    setError(null)
    try {
      await onEdit(m, draft)
      setEditing(false)
    } catch (e) {
      setError(friendlyError(e))
    } finally {
      setBusy(false)
    }
  }
  return (
    <li className={`msg ${mine ? 'mine' : 'theirs'}`}>
      <div className="bubble">
        <span className="sr-only">{mine ? 'Vous' : peerName} :</span>
        {editing ? (
          <div className="stack msg-edit">
            <label htmlFor={`edit-${m.id}`} className="sr-only">Modifier le message</label>
            <textarea
              id={`edit-${m.id}`}
              className="input"
              rows={2}
              value={draft}
              autoFocus
              maxLength={LIMITS.messageChars + 200}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Escape') setEditing(false)
                else if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
                  e.preventDefault()
                  void save()
                }
              }}
            />
            {error && <Alert kind="error">{error}</Alert>}
            <div className="row">
              <button type="button" className="btn btn-sm btn-primary" disabled={busy || (!draft.trim() && m.message_attachments.length === 0) || draft.length > LIMITS.messageChars} onClick={() => void save()}>{busy ? 'Patientez…' : 'Enregistrer'}</button>
              <button type="button" className="btn btn-sm" disabled={busy} onClick={() => setEditing(false)}>Annuler</button>
            </div>
          </div>
        ) : (
          <RichText text={m.content} />
        )}
        {m.message_attachments.map((a) => <MediaAttachment key={a.id} att={a} />)}
        <div className="bubble-meta">
          <time dateTime={m.created_at} title={formatDateTime(m.created_at)}>{formatTime(m.created_at)}</time>
          {m.edited_at && <span className="edited-mark" title={`Modifié le ${formatDateTime(m.edited_at)}`}>(modifié)</span>}
          {LOCAL && mine && <NetBadge id={m.id} />}
          <Menu label="Actions sur ce message" align={mine ? 'right' : 'left'}>
            {m.content && <CopyItem text={m.content} />}
            {canEdit && <button type="button" className="menu-item" onClick={() => { setDraft(m.content); setError(null); setEditing(true) }}><Icon name="doc" size={16} /> Modifier</button>}
            {!mine && <button type="button" className="menu-item" onClick={onReport}><Icon name="flag" size={16} /> Signaler ce message</button>}
            {mine && <button type="button" className="menu-item danger" onClick={onDelete}><Icon name="trash" size={16} /> Supprimer</button>}
          </Menu>
        </div>
      </div>
    </li>
  )
}

/** « marc est en train d'écrire… » (ne s'affiche que si le contact écrit vraiment, et disparaît tout seul). */
function TypingIndicator({ conversationId, peerName }: { conversationId: string; peerName: string }) {
  const [on, setOn] = useState(() => isPeerTyping(conversationId))
  useEffect(() => {
    const update = () => setOn(isPeerTyping(conversationId))
    update()
    const off = subscribeTyping(update)
    const t = window.setInterval(update, 1000)
    return () => {
      off()
      window.clearInterval(t)
    }
  }, [conversationId])
  if (!on) return null
  return (
    <p className="typing-indicator" role="status">
      <span className="typing-dots" aria-hidden="true"><i /><i /><i /></span> {peerName} est en train d’écrire…
    </p>
  )
}

function Thread({ id }: { id: string }) {
  const { userId } = useAuth()
  const notify = useNotify()
  const navigate = useNavigate()
  const [params, setParams] = useSearchParams()
  const peer = useAsync(() => api.getConversationPeer(id, userId as string), [id, userId])
  const blocked = useAsync(() => (peer.data ? api.isBlockedByMe(peer.data.id) : Promise.resolve(false)), [peer.data?.id])
  const [messages, setMessages] = useState<Message[]>([])
  const [hasMore, setHasMore] = useState(false)
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [loadingOlder, setLoadingOlder] = useState(false)
  const [pending, setPending] = useState<Pending[]>([])
  const [text, setText] = useState(() => params.get('brouillon') ?? '')
  const [file, setFile] = useState<OutgoingFile | null>(null)
  const [fileUrl, setFileUrl] = useState<string | null>(null)
  const [fileError, setFileError] = useState<string | null>(null)
  const [reporting, setReporting] = useState<{ kind: 'message' | 'profile'; id: string } | null>(null)
  const [deleting, setDeleting] = useState<Message | null>(null)
  const [deleteBusy, setDeleteBusy] = useState(false)
  const [deleteError, setDeleteError] = useState<string | null>(null)
  const [confirmBlock, setConfirmBlock] = useState(false)
  const [blockBusy, setBlockBusy] = useState(false)
  const [actionError, setActionError] = useState<string | null>(null)
  const listRef = useRef<HTMLDivElement>(null)
  const fileInput = useRef<HTMLInputElement>(null)
  const stick = useRef(true)
  const restore = useRef<number | null>(null)
  const knownIds = useRef(new Set<string>())

  const peerName = peer.data ? displayName(peer.data) : 'Votre interlocuteur'
  useDocumentTitle(peer.data ? `Conversation avec ${peerName}` : 'Conversation')

  // Le brouillon (depuis une demande d'aide) n'est appliqué qu'une fois : on nettoie l'adresse.
  useEffect(() => {
    if (params.get('brouillon')) setParams({ brouillon: null }, { replace: true })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const addMessage = useCallback((m: Message) => {
    if (knownIds.current.has(m.id)) return
    knownIds.current.add(m.id)
    setMessages((list) => [...list, m].sort((a, b) => a.created_at.localeCompare(b.created_at)))
  }, [])

  const markRead = useCallback(() => {
    api.markRead(id).then(() => notify.refreshUnread(), () => undefined)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id])

  // Chargement initial de l'historique
  useEffect(() => {
    let alive = true
    knownIds.current = new Set()
    setMessages([])
    setLoading(true)
    setLoadError(null)
    stick.current = true
    api.fetchMessages(id).then(
      ({ messages: rows, hasMore: more }) => {
        if (!alive) return
        rows.forEach((m) => knownIds.current.add(m.id))
        setMessages(rows)
        setHasMore(more)
        setLoading(false)
        markRead()
      },
      (e: unknown) => alive && (setLoadError(friendlyError(e, 'Impossible de charger les messages.')), setLoading(false)),
    )
    return () => {
      alive = false
    }
  }, [id, markRead])

  // Conversation ouverte : pas d'alerte pour ses propres messages entrants ; réception en temps réel
  useEffect(() => {
    notify.setActiveConversation(id)
    const off = notify.onIncomingMessage((m) => {
      if (m.conversation_id !== id || knownIds.current.has(m.id)) return
      api.fetchMessage(m.id).then((msg) => {
        if (!msg) return
        addMessage(msg)
        if (msg.sender_id !== userId) markRead()
      }, () => undefined)
    })
    const onVisible = () => {
      if (document.visibilityState !== 'visible') return
      api.fetchMessages(id, { limit: 20 }).then(({ messages: rows }) => rows.forEach(addMessage), () => undefined)
      markRead()
    }
    document.addEventListener('visibilitychange', onVisible)
    return () => {
      notify.setActiveConversation(null)
      off()
      document.removeEventListener('visibilitychange', onVisible)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, userId, addMessage, markRead])

  // Défilement : en bas pour les nouveaux messages, position conservée pour l'historique ancien
  useLayoutEffect(() => {
    const el = listRef.current
    if (!el) return
    if (restore.current !== null) {
      el.scrollTop = el.scrollHeight - restore.current
      restore.current = null
    } else if (stick.current) {
      el.scrollTop = el.scrollHeight
    }
  }, [messages, pending, loading])

  // Les images/vidéos se chargent après coup : si on était en bas, on y reste une fois leur taille connue.
  useEffect(() => {
    const el = listRef.current
    if (!el) return
    const onMedia = () => {
      if (stick.current) el.scrollTop = el.scrollHeight
    }
    el.addEventListener('load', onMedia, true)
    el.addEventListener('loadedmetadata', onMedia, true)
    return () => {
      el.removeEventListener('load', onMedia, true)
      el.removeEventListener('loadedmetadata', onMedia, true)
    }
  }, [id, loading])

  useEffect(() => () => { if (fileUrl) URL.revokeObjectURL(fileUrl) }, [fileUrl])

  async function loadOlder() {
    if (!messages.length) return
    setLoadingOlder(true)
    try {
      const { messages: rows, hasMore: more } = await api.fetchMessages(id, { before: messages[0].created_at })
      restore.current = listRef.current?.scrollHeight ?? 0
      rows.forEach((m) => knownIds.current.add(m.id))
      setMessages((list) => [...rows, ...list])
      setHasMore(more)
    } catch (e) {
      setLoadError(friendlyError(e))
    } finally {
      setLoadingOlder(false)
    }
  }

  async function pickFile(f: File | undefined) {
    if (!f) return
    setFileError(null)
    const result = await validateFile(f, CHAT_POLICY)
    if (!result.ok) {
      setFileError(result.error)
      if (fileInput.current) fileInput.current.value = ''
      return
    }
    if (fileUrl) URL.revokeObjectURL(fileUrl)
    setFile({ blob: f, type: result.type })
    setFileUrl(await previewUrl(f))
  }

  function clearFile() {
    if (fileUrl) URL.revokeObjectURL(fileUrl)
    setFile(null)
    setFileUrl(null)
    setFileError(null)
    if (fileInput.current) fileInput.current.value = ''
  }

  const doSend = useCallback(
    async (p: Pending) => {
      setPending((l) => l.map((x) => (x.key === p.key ? { ...x, status: 'sending', error: undefined } : x)))
      try {
        const messageId = await api.sendMessage({ conversationId: id, content: p.content, file: p.file })
        const msg = await api.fetchMessage(messageId)
        stick.current = true
        if (msg) addMessage(msg)
        if (p.previewUrl) URL.revokeObjectURL(p.previewUrl)
        setPending((l) => l.filter((x) => x.key !== p.key))
      } catch (e) {
        setPending((l) => l.map((x) => (x.key === p.key ? { ...x, status: 'failed', error: friendlyError(e, 'Le message n’a pas pu être envoyé.') } : x)))
      }
    },
    [id, addMessage],
  )

  function submit(e?: FormEvent) {
    e?.preventDefault()
    const content = text.trim()
    if (!content && !file) return
    if (content.length > LIMITS.messageChars) return
    const p: Pending = { key: crypto.randomUUID(), content, file, previewUrl: fileUrl, status: 'sending' }
    setPending((l) => [...l, p])
    setText('')
    setFile(null)
    setFileUrl(null) // l'aperçu appartient maintenant au message en attente
    if (fileInput.current) fileInput.current.value = ''
    stick.current = true
    void doSend(p)
  }

  function discard(p: Pending) {
    if (p.previewUrl) URL.revokeObjectURL(p.previewUrl)
    setPending((l) => l.filter((x) => x.key !== p.key))
  }

  async function saveEdit(m: Message, content: string) {
    const upd = await editMessage(m.id, content)
    setMessages((l) => l.map((x) => (x.id === m.id ? { ...x, content: upd.content, edited_at: upd.edited_at } : x)))
  }

  // Modification ou suppression venue de l'autre personne (en ligne ou autre onglet) : la conversation se met à jour toute seule.
  useEffect(() => {
    if (!LOCAL) return undefined
    return subscribeMessageChanges((ch) => {
      if (ch.conversation_id !== id) return
      if (ch.kind === 'delete') {
        setMessages((l) => l.filter((x) => x.id !== ch.id))
        knownIds.current.delete(ch.id)
      } else {
        void api.fetchMessage(ch.id).then((msg) => msg && setMessages((l) => l.map((x) => (x.id === msg.id ? { ...msg } : x))), () => undefined)
      }
    })
  }, [id])

  async function confirmDelete() {
    if (!deleting) return
    setDeleteBusy(true)
    setDeleteError(null)
    try {
      await api.deleteMessage(deleting)
      setMessages((l) => l.filter((x) => x.id !== deleting.id))
      setDeleting(null)
    } catch (e) {
      setDeleteError(friendlyError(e))
    } finally {
      setDeleteBusy(false)
    }
  }

  async function setBlock(block: boolean) {
    if (!peer.data) return
    setBlockBusy(true)
    setActionError(null)
    try {
      if (block) await api.blockUser(peer.data.id)
      else await api.unblockUser(peer.data.id)
      blocked.setData(block)
      setConfirmBlock(false)
      notify.refreshUnread()
    } catch (e) {
      setActionError(friendlyError(e))
    } finally {
      setBlockBusy(false)
    }
  }

  async function leave() {
    try {
      await api.archiveConversation(id, true)
      navigate('/messages')
    } catch (e) {
      setActionError(friendlyError(e))
    }
  }

  if (peer.loading) return <div className="thread"><Spinner /></div>
  if (!peer.data) {
    return (
      <div className="thread">
        <EmptyState icon="chat" title="Conversation introuvable" action={<Link to="/messages" className="btn">Retour aux messages</Link>}>
          Cette conversation n’existe pas ou vous n’y avez pas accès.
        </EmptyState>
      </div>
    )
  }

  const tooLong = text.length > LIMITS.messageChars
  let lastDay = ''
  const empty = !loading && !loadError && messages.length === 0 && pending.length === 0

  return (
    <div className="thread">
      <header className="thread-head">
        <Link to="/messages" className="icon-btn back-btn" aria-label="Retour à la liste des conversations"><Icon name="back" /></Link>
        <Link to={`/profil/${peer.data.id}`} className="thread-peer">
          <Avatar profile={peer.data} size={40} />
          <span>
            <strong>{peerName}</strong>
            <span className="mono small">{peer.data.public_id}</span>
          </span>
        </Link>
        <Menu label="Actions sur la conversation">
          <Link to={`/profil/${peer.data.id}`} className="menu-item"><Icon name="user" size={16} /> Voir le profil</Link>
          <button type="button" className="menu-item" onClick={() => setReporting({ kind: 'profile', id: peer.data!.id })}><Icon name="flag" size={16} /> Signaler cet utilisateur</button>
          {blocked.data ? (
            <button type="button" className="menu-item" onClick={() => setBlock(false)}><Icon name="block" size={16} /> Débloquer</button>
          ) : (
            <button type="button" className="menu-item danger" onClick={() => setConfirmBlock(true)}><Icon name="block" size={16} /> Bloquer</button>
          )}
          <button type="button" className="menu-item" onClick={leave}><Icon name="archive" size={16} /> Quitter la conversation</button>
        </Menu>
      </header>

      {actionError && <Alert kind="error">{actionError}</Alert>}

      <div
        className="thread-messages"
        ref={listRef}
        role="log"
        aria-live="polite"
        aria-label={`Messages avec ${peerName}`}
        onScroll={(e) => {
          const el = e.currentTarget
          stick.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80
        }}
      >
        {loading && <Spinner label="Chargement de l’historique…" />}
        {loadError && (
          <div className="stack">
            <Alert kind="error">{loadError}</Alert>
            <button type="button" className="btn btn-sm" onClick={() => api.fetchMessages(id).then(({ messages: rows }) => { rows.forEach(addMessage); setLoadError(null) }, (e) => setLoadError(friendlyError(e)))}>Réessayer</button>
          </div>
        )}
        {hasMore && !loading && (
          <button type="button" className="btn btn-sm load-older" onClick={loadOlder} disabled={loadingOlder}>
            {loadingOlder ? 'Chargement…' : 'Charger les messages précédents'}
          </button>
        )}
        {empty && (
          <EmptyState icon="chat" title="Aucun message pour l’instant">
            Écrivez le premier message à {peerName}. Rappel : ne partagez jamais de mot de passe ni de code de connexion.
          </EmptyState>
        )}
        <ul className="msg-list">
          {messages.map((m) => {
            const k = dayKey(m.created_at)
            const sep = k !== lastDay
            lastDay = k
            return (
              <Fragment key={m.id}>
                {sep && <li className="day-sep" aria-hidden="false"><span>{formatDayLabel(m.created_at)}</span></li>}
                <MessageItem m={m} mine={m.sender_id === userId} peerName={peerName} onReport={() => setReporting({ kind: 'message', id: m.id })} onDelete={() => { setDeleteError(null); setDeleting(m) }} onEdit={saveEdit} />
              </Fragment>
            )
          })}
          {pending.map((p) => (
            <li key={p.key} className="msg mine pending">
              <div className="bubble">
                {p.content && <p className="rich">{p.content}</p>}
                {p.file && p.previewUrl && (p.file.type.kind === 'video'
                  ? <video className="media-video" src={p.previewUrl} muted preload="metadata" />
                  : <img className="media-img" src={p.previewUrl} alt="Aperçu du média en cours d’envoi" />)}
                <div className="bubble-meta">
                  {p.status === 'sending' ? (
                    <span role="status"><span className="spinner small" aria-hidden="true" /> Envoi en cours…</span>
                  ) : (
                    <span className="send-failed" role="alert"><Icon name="alert" size={14} /> {p.error}</span>
                  )}
                </div>
                {p.status === 'failed' && (
                  <div className="row">
                    <button type="button" className="btn btn-sm btn-primary" onClick={() => doSend(p)}><Icon name="refresh" size={16} /> Réessayer</button>
                    <button type="button" className="btn btn-sm" onClick={() => discard(p)}>Supprimer</button>
                  </div>
                )}
              </div>
            </li>
          ))}
        </ul>
      </div>

      {LOCAL && <TypingIndicator conversationId={id} peerName={peerName} />}
      {LOCAL && <OnlineConvNotice conversationId={id} />}
      {blocked.data ? (
        <div className="composer-blocked">
          <Icon name="block" /> <span>Vous avez bloqué {peer.data.public_id}. Vous ne pouvez plus vous écrire.</span>
          <button type="button" className="btn btn-sm" onClick={() => setBlock(false)} disabled={blockBusy}>Débloquer</button>
        </div>
      ) : (
        <form className="composer" onSubmit={submit}>
          {file && fileUrl && (
            <div className="composer-preview">
              {file.type.kind === 'video'
                ? <video src={fileUrl} controls muted preload="metadata" playsInline />
                : <img src={fileUrl} alt="Aperçu de l’image à envoyer" />}
              <div className="grow">
                <strong className="clip">{file.blob.name}</strong>
                <span className="hint">{file.type.kind === 'video' ? 'Vidéo' : file.type.kind === 'gif' ? 'GIF' : 'Image'} · {formatBytes(file.blob.size)} — vérifiez l’aperçu avant d’envoyer.</span>
              </div>
              <button type="button" className="btn btn-sm" onClick={clearFile}><Icon name="x" size={16} /> Annuler l’envoi du fichier</button>
            </div>
          )}
          {fileError && <Alert kind="error">{fileError}</Alert>}
          <div className="composer-row">
            <input ref={fileInput} type="file" accept={ACCEPT} hidden onChange={(e) => void pickFile(e.target.files?.[0])} />
            <button type="button" className="icon-btn" onClick={() => fileInput.current?.click()} aria-label="Joindre une image, un GIF ou une vidéo" title={`Images et GIF : ${formatBytes(LIMITS.imageBytes)} max · Vidéos : ${formatBytes(LIMITS.videoBytes)} max`}>
              <Icon name="paperclip" />
            </button>
            <label htmlFor="composer-text" className="sr-only">Votre message</label>
            <textarea
              id="composer-text"
              className="input composer-text"
              rows={1}
              placeholder="Écrire un message…"
              value={text}
              onChange={(e) => {
                setText(e.target.value)
                if (LOCAL && e.target.value.trim()) sendTyping(id)
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
                  e.preventDefault()
                  submit()
                }
              }}
              aria-describedby="composer-hint"
              maxLength={LIMITS.messageChars + 200}
            />
            <button type="submit" className="btn btn-primary send-btn" disabled={(!text.trim() && !file) || tooLong}>
              <Icon name="send" size={18} /> <span className="send-label">Envoyer</span>
            </button>
          </div>
          <p id="composer-hint" className={`hint${tooLong ? ' field-error' : ''}`}>
            {tooLong ? `Message trop long : ${text.length}/${LIMITS.messageChars}.` : (<><span className="wide-only">Entrée pour envoyer, Maj+Entrée pour passer à la ligne. </span>Les liens ne s’ouvrent jamais automatiquement.</>)}
          </p>
        </form>
      )}

      {reporting && <ReportDialog kind={reporting.kind} targetId={reporting.id} onClose={() => setReporting(null)} />}
      {deleting && (
        <ConfirmDialog title="Supprimer ce message ?" confirmLabel="Supprimer" danger busy={deleteBusy} error={deleteError} onConfirm={confirmDelete} onCancel={() => setDeleting(null)}>
          Le message{deleting.message_attachments.length ? ' et son fichier joint seront supprimés' : ' sera supprimé'} pour vous et pour votre interlocuteur. Cette action est définitive.
          {LOCAL && conversationLink(id).mode === 'file' && ' Ce contact est sur un autre appareil sans lien en ligne : s’il a déjà reçu le message par fichier, il le gardera.'}
          {LOCAL && conversationLink(id).mode === 'online' && deleting.message_attachments.length > 0 && ' Le fichier joint a été échangé hors ligne : l’autre personne peut l’avoir déjà reçu.'}
        </ConfirmDialog>
      )}
      {confirmBlock && (
        <ConfirmDialog title={`Bloquer ${peer.data.public_id} ?`} confirmLabel="Bloquer" danger busy={blockBusy} error={actionError} onConfirm={() => setBlock(true)} onCancel={() => setConfirmBlock(false)}>
          Vous ne pourrez plus vous écrire et cette personne ne pourra plus vous retrouver. Elle n’est pas prévenue. Vous pourrez débloquer à tout moment.
        </ConfirmDialog>
      )}
    </div>
  )
}

export default function MessagesPage() {
  const { id } = useParams()
  const notify = useNotify()
  const convs = useAsync(() => api.listConversations(), [])
  useDocumentTitle('Messages')
  const { reload } = convs
  useEffect(() => notify.onIncomingMessage(() => reload()), [notify, reload])
  // Rafraîchit la liste (aperçus, non lus) quand on ouvre ou quitte une conversation
  useEffect(() => {
    const t = window.setTimeout(reload, 600)
    return () => window.clearTimeout(t)
  }, [id, reload])
  return (
    <div className={`messages-layout${id ? ' has-thread' : ''}`}>
      <ConversationList items={convs.data} loading={convs.loading} error={convs.error} reload={convs.reload} />
      <section className="thread-pane" aria-label="Conversation">
        {id ? (
          <Thread key={id} id={id} />
        ) : (
          <div className="thread thread-empty">
            <EmptyState icon="chat" title="Choisissez une conversation">
              Sélectionnez une conversation dans la liste, ou retrouvez quelqu’un grâce à son {LOCAL ? 'nom ou son identifiant' : 'identifiant public'} pour lui écrire.
            </EmptyState>
            {LOCAL && <CrossDeviceGuide />}
          </div>
        )}
      </section>
    </div>
  )
}
