import { useCallback, useEffect, useRef, useState } from 'react'
import type { FormEvent } from 'react'
import { ConfirmDialog, ReportDialog } from '../components/Dialogs'
import { SignedImage } from '../components/Media'
import { RichText } from '../components/RichText'
import { useContact } from '../components/UserCard'
import { Alert, Avatar, EmptyState, Field, Icon, PageLoading, Spinner, StatusBadge } from '../components/ui'
import { LOCAL } from '../lib/mode'
import { useAuth } from '../context/AuthContext'
import { useNotify } from '../context/NotifyContext'
import * as api from '../lib/api'
import type { OutgoingFile } from '../lib/api'
import { CATEGORIES, LIMITS, STATUS_LABEL, categoryLabel } from '../lib/config'
import { friendlyError } from '../lib/errors'
import { previewUrl, validateFile } from '../lib/files'
import { formatBytes, formatDateTime, formatShort } from '../lib/format'
import { useAsync, useDocumentTitle } from '../lib/hooks'
import { HELP_IMAGE_POLICY } from '../lib/policies'
import { Link, useNavigate, useParams, useSearchParams } from '../lib/router'
import type { HelpRequest, HelpStatus } from '../types'

const PAGE = 15

function HelpCard({ h }: { h: HelpRequest }) {
  const excerpt = h.description.length > 160 ? h.description.slice(0, 157) + '…' : h.description
  return (
    <article className={`card help-card${h.urgent && h.status !== 'resolved' ? ' is-alert' : ''}`}>
      <div className="help-card-top">
        {h.urgent && h.status !== 'resolved' && <span className="badge badge-alert"><Icon name="alert" size={14} /> Alerte rouge</span>}
        <StatusBadge status={h.status} />
        <span className="chip static"><Icon name={CATEGORIES.find((c) => c.id === h.category)?.icon ?? 'dots'} size={14} /> {categoryLabel(h.category)}</span>
        {h.image_path && <span className="chip static"><Icon name="image" size={14} /> Image jointe</span>}
      </div>
      <h3><Link to={`/entraide/${h.id}`}>{h.title}</Link></h3>
      <p className="muted">{excerpt}</p>
      <p className="help-meta">
        <Avatar profile={h.author ? { ...h.author } : null} size={24} />
        <span className="mono">{h.author?.public_id ?? 'Utilisateur'}</span> · <time dateTime={h.created_at}>{formatShort(h.created_at)}</time>
      </p>
    </article>
  )
}

export function HelpListPage() {
  useDocumentTitle('Demandes d’aide')
  const { userId } = useAuth()
  const { clearNewHelp } = useNotify()
  const [params, setParams] = useSearchParams()
  const category = params.get('categorie') ?? ''
  const status = (params.get('statut') ?? '') as HelpStatus | ''
  const mine = params.get('mes') === '1'
  const text = params.get('q') ?? ''
  const [textInput, setTextInput] = useState(text)
  const [items, setItems] = useState<HelpRequest[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [more, setMore] = useState(false)
  const seq = useRef(0)

  useEffect(() => clearNewHelp(), [clearNewHelp])

  const load = useCallback(
    async (offset: number) => {
      const id = ++seq.current
      setLoading(true)
      setError(null)
      try {
        const rows = await api.listHelp({ category, status, mine: mine ? (userId ?? undefined) : undefined, text, limit: PAGE, offset })
        if (id !== seq.current) return
        setItems((cur) => (offset === 0 ? rows : [...cur, ...rows]))
        setMore(rows.length === PAGE)
      } catch (e) {
        if (id === seq.current) setError(friendlyError(e, 'Impossible de charger les demandes.'))
      } finally {
        if (id === seq.current) setLoading(false)
      }
    },
    [category, status, mine, text, userId],
  )

  useEffect(() => {
    void load(0)
  }, [load])

  // Version locale : une nouvelle demande (ex. alerte rouge d'un autre profil) apparaît sans recharger la page.
  useEffect(() => (LOCAL ? api.subscribeHelp(() => void load(0)) : undefined), [load])

  return (
    <div className="page">
      <header className="page-head row between">
        <div>
          <h1>Demandes d’aide</h1>
          <p className="muted">Consultez les questions de la communauté, proposez votre aide ou posez la vôtre.</p>
        </div>
        <Link to="/entraide/nouvelle" className="btn btn-primary"><Icon name="plus" size={18} /> Publier une demande</Link>
      </header>

      <form
        className="card filters"
        role="search"
        aria-label="Filtrer les demandes"
        onSubmit={(e) => {
          e.preventDefault()
          setParams({ q: textInput.trim() })
        }}
      >
        <div className="field">
          <label htmlFor="f-q">Mot-clé</label>
          <input id="f-q" className="input" type="search" value={textInput} onChange={(e) => setTextInput(e.target.value)} placeholder="Ex. imprimante, mot de passe…" />
        </div>
        <div className="field">
          <label htmlFor="f-cat">Catégorie</label>
          <select id="f-cat" className="input" value={category} onChange={(e) => setParams({ categorie: e.target.value })}>
            <option value="">Toutes les catégories</option>
            {CATEGORIES.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}
          </select>
        </div>
        <div className="field">
          <label htmlFor="f-status">Statut</label>
          <select id="f-status" className="input" value={status} onChange={(e) => setParams({ statut: e.target.value })}>
            <option value="">Tous les statuts</option>
            {(Object.keys(STATUS_LABEL) as HelpStatus[]).map((s) => <option key={s} value={s}>{STATUS_LABEL[s]}</option>)}
          </select>
        </div>
        <label className="check inline">
          <input type="checkbox" checked={mine} onChange={(e) => setParams({ mes: e.target.checked ? '1' : null })} />
          <span>Mes demandes</span>
        </label>
        <button type="submit" className="btn"><Icon name="search" size={16} /> Filtrer</button>
      </form>

      <div aria-live="polite">
        {error && <Alert kind="error">{error}</Alert>}
        {!error && !loading && items.length === 0 && (
          <EmptyState icon="help" title="Aucune demande ne correspond" action={<Link to="/entraide/nouvelle" className="btn btn-primary">Publier la première demande</Link>}>
            Modifiez les filtres ou publiez une nouvelle demande d’aide.
          </EmptyState>
        )}
        <div className="grid help-grid">
          {items.map((h) => <HelpCard key={h.id} h={h} />)}
        </div>
        {loading && <Spinner />}
        {!loading && more && (
          <div className="row center"><button type="button" className="btn" onClick={() => load(items.length)}>Voir plus de demandes</button></div>
        )}
      </div>
    </div>
  )
}

export function HelpNewPage() {
  useDocumentTitle('Publier une demande d’aide')
  const { userId } = useAuth()
  const navigate = useNavigate()
  const [title, setTitle] = useState('')
  const [category, setCategory] = useState('ordinateur')
  const [description, setDescription] = useState('')
  const [urgent, setUrgent] = useState(false)
  const [file, setFile] = useState<OutgoingFile | null>(null)
  const [fileUrl, setFileUrl] = useState<string | null>(null)
  const [fileError, setFileError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const input = useRef<HTMLInputElement>(null)

  useEffect(() => () => { if (fileUrl) URL.revokeObjectURL(fileUrl) }, [fileUrl])

  async function pick(f: File | undefined) {
    if (!f) return
    setFileError(null)
    const r = await validateFile(f, HELP_IMAGE_POLICY)
    if (!r.ok) {
      setFileError(r.error)
      if (input.current) input.current.value = ''
      return
    }
    setFile({ blob: f, type: r.type })
    setFileUrl(await previewUrl(f))
  }

  function clear() {
    setFile(null)
    setFileUrl(null)
    if (input.current) input.current.value = ''
  }

  async function submit(e: FormEvent) {
    e.preventDefault()
    setError(null)
    if (title.trim().length < 5) return setError('Le titre doit contenir au moins 5 caractères.')
    if (description.trim().length < 10) return setError('Décrivez votre problème en au moins 10 caractères.')
    setBusy(true)
    try {
      const id = await api.createHelp(userId as string, { title, description, category, file, urgent: LOCAL && urgent })
      navigate(`/entraide/${id}`)
    } catch (err) {
      setError(friendlyError(err))
      setBusy(false)
    }
  }

  return (
    <div className="page narrow">
      <form className="card stack" onSubmit={submit}>
        <h1>Publier une demande d’aide</h1>
        <p className="muted">Décrivez votre problème clairement, sans mot de passe, code ni donnée personnelle. Votre identifiant public sera affiché.</p>
        <Field label="Titre" htmlFor="h-title" hint="Une phrase courte, par exemple « Impossible d’envoyer un PDF par e-mail ».">
          <input id="h-title" className="input" type="text" required minLength={5} maxLength={120} value={title} onChange={(e) => setTitle(e.target.value)} aria-describedby="h-title-hint" />
        </Field>
        <Field label="Catégorie" htmlFor="h-cat">
          <select id="h-cat" className="input" value={category} onChange={(e) => setCategory(e.target.value)}>
            {CATEGORIES.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}
          </select>
        </Field>
        <Field label="Description" htmlFor="h-desc" hint={`Que s’est-il passé ? Qu’avez-vous déjà essayé ? (${description.length}/2000)`}>
          <textarea id="h-desc" className="input" rows={7} required minLength={10} maxLength={2000} value={description} onChange={(e) => setDescription(e.target.value)} aria-describedby="h-desc-hint" />
        </Field>
        <div className="field">
          <span className="label">Image jointe (facultatif)</span>
          <input ref={input} type="file" id="h-file" accept="image/png,image/jpeg,image/webp,image/gif" hidden onChange={(e) => void pick(e.target.files?.[0])} />
          {!file && (
            <button type="button" className="btn" onClick={() => input.current?.click()}><Icon name="image" size={18} /> Choisir une image</button>
          )}
          <p className="hint">PNG, JPEG, WebP ou GIF — {formatBytes(LIMITS.imageBytes)} maximum. Masquez toute information personnelle visible sur une capture d’écran.</p>
          {fileError && <p className="field-error" role="alert">{fileError}</p>}
          {file && fileUrl && (
            <div className="composer-preview">
              <img src={fileUrl} alt="Aperçu de l’image jointe" />
              <div className="grow"><strong className="clip">{file.blob.name}</strong><span className="hint">{formatBytes(file.blob.size)}</span></div>
              <button type="button" className="btn btn-sm" onClick={clear}><Icon name="x" size={16} /> Retirer</button>
            </div>
          )}
        </div>
        {LOCAL && (
          <label className="check alert-check">
            <input type="checkbox" checked={urgent} onChange={(e) => setUrgent(e.target.checked)} />
            <span>
              <strong>Alerte rouge</strong> : demande urgente, affichée en rouge et signalée en haut de page aux autres profils de cet appareil (elle n’est pas envoyée à d’autres appareils). À réserver aux vrais blocages (une seule à la fois).
              Ce n’est pas un service d’urgence : en cas de danger, appelez le 112.
            </span>
          </label>
        )}
        {error && <Alert kind="error">{error}</Alert>}
        <div className="row">
          <button type="submit" className={`btn btn-lg ${urgent && LOCAL ? 'btn-danger' : 'btn-primary'}`} disabled={busy}>{busy ? 'Publication…' : urgent && LOCAL ? 'Publier en alerte rouge' : 'Publier ma demande'}</button>
          <Link to="/entraide" className="btn btn-ghost">Annuler</Link>
        </div>
      </form>
    </div>
  )
}

export function HelpDetailPage() {
  const { id } = useParams()
  const { userId } = useAuth()
  const navigate = useNavigate()
  const req = useAsync(() => api.getHelp(id as string), [id])
  const { contact, busy: contacting, error: contactError } = useContact()
  const [reporting, setReporting] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [working, setWorking] = useState(false)
  const [actionError, setActionError] = useState<string | null>(null)
  const h = req.data
  useDocumentTitle(h ? h.title : 'Demande d’aide')

  if (req.loading) return <PageLoading />
  if (req.error) return <div className="page narrow"><Alert kind="error">{req.error}</Alert></div>
  if (!h) {
    return (
      <div className="page narrow">
        <EmptyState icon="help" title="Demande introuvable" action={<Link to="/entraide" className="btn">Voir les demandes</Link>}>
          Cette demande a été supprimée ou n’est plus accessible.
        </EmptyState>
      </div>
    )
  }
  const mine = h.author_id === userId

  async function changeStatus(status: HelpStatus) {
    setWorking(true)
    setActionError(null)
    try {
      await api.updateHelpStatus(h!.id, status)
      req.setData({ ...h!, status })
    } catch (e) {
      setActionError(friendlyError(e))
    } finally {
      setWorking(false)
    }
  }

  async function remove() {
    setWorking(true)
    setActionError(null)
    try {
      await api.deleteHelp(h!)
      navigate('/entraide')
    } catch (e) {
      setActionError(friendlyError(e))
      setWorking(false)
    }
  }

  const draft = `Bonjour, je peux peut-être vous aider concernant votre demande « ${h.title} ». Pouvez-vous m’en dire un peu plus ?`

  return (
    <div className="page narrow">
      <p><Link to="/entraide" className="back-link"><Icon name="back" size={16} /> Toutes les demandes</Link></p>
      {h.urgent && h.status !== 'resolved' && (
        <div className="red-alert-detail" role="alert">
          <Icon name="alert" size={20} />
          <span><strong>Alerte rouge</strong> : l’auteur signale une demande urgente. Ce n’est pas un service d’urgence : en cas de danger, appelez le 112.</span>
        </div>
      )}
      <article className={`card stack${h.urgent && h.status !== 'resolved' ? ' is-alert' : ''}`}>
        <div className="help-card-top">
          {h.urgent && h.status !== 'resolved' && <span className="badge badge-alert"><Icon name="alert" size={14} /> Alerte rouge</span>}
          <StatusBadge status={h.status} />
          <span className="chip static"><Icon name={CATEGORIES.find((c) => c.id === h.category)?.icon ?? 'dots'} size={14} /> {categoryLabel(h.category)}</span>
        </div>
        <h1>{h.title}</h1>
        <p className="help-meta">
          <Avatar profile={h.author ? { ...h.author } : null} size={32} />
          <span>
            Publiée par <Link to={mine ? '/profil' : `/profil/${h.author_id}`} className="mono">{h.author?.public_id ?? 'Utilisateur'}</Link>
            {h.author?.display_name && <> ({h.author.display_name})</>} · <time dateTime={h.created_at}>{formatDateTime(h.created_at)}</time>
          </span>
        </p>
        <RichText text={h.description} />
        {h.image_path && <SignedImage bucket="help-images" path={h.image_path} alt={`Image jointe à la demande « ${h.title} »`} className="media-img large" />}

        {actionError && <Alert kind="error">{actionError}</Alert>}
        {contactError && <Alert kind="error">{contactError}</Alert>}

        {mine ? (
          <div className="stack">
            <div className="field">
              <label htmlFor="status">Statut de votre demande</label>
              <select id="status" className="input" value={h.status} disabled={working} onChange={(e) => void changeStatus(e.target.value as HelpStatus)}>
                {(Object.keys(STATUS_LABEL) as HelpStatus[]).map((s) => <option key={s} value={s}>{STATUS_LABEL[s]}</option>)}
              </select>
            </div>
            <div className="row">
              <button type="button" className="btn btn-danger-ghost" onClick={() => setConfirmDelete(true)}><Icon name="trash" size={16} /> Supprimer ma demande</button>
            </div>
          </div>
        ) : (
          <div className="row">
            <button type="button" className="btn btn-primary" disabled={contacting} onClick={() => contact(h.author_id, draft)}>
              <Icon name="heart" size={18} /> {contacting ? 'Ouverture…' : 'Proposer mon aide'}
            </button>
            <button type="button" className="btn" disabled={contacting} onClick={() => contact(h.author_id)}><Icon name="chat" size={18} /> Contacter l’auteur</button>
            <button type="button" className="btn btn-ghost" onClick={() => setReporting(true)}><Icon name="flag" size={16} /> Signaler</button>
          </div>
        )}
        <p className="hint">Discutez en messagerie privée : ne publiez jamais de mot de passe, de code ou de coordonnées bancaires dans cette page.</p>
      </article>
      {reporting && <ReportDialog kind="help_request" targetId={h.id} onClose={() => setReporting(false)} />}
      {confirmDelete && (
        <ConfirmDialog title="Supprimer cette demande ?" confirmLabel="Supprimer" danger busy={working} error={actionError} onConfirm={remove} onCancel={() => setConfirmDelete(false)}>
          La demande{h.image_path ? ' et son image' : ''} seront supprimées définitivement. Les conversations privées déjà ouvertes ne sont pas affectées.
        </ConfirmDialog>
      )}
    </div>
  )
}
