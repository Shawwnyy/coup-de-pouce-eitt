import { useRef, useState, type ReactNode } from 'react'
import { LOCAL } from '../lib/mode'
import { LocalAccountSection } from '../local/LocalAccount'
import type { FormEvent } from 'react'
import { AppearancePanel } from '../components/AppearancePanel'
import { Dialog } from '../components/Dialogs'
import { Alert, Avatar, EmptyState, Field, Icon, Spinner } from '../components/ui'
import { useAuth } from '../context/AuthContext'
import { useNotify } from '../context/NotifyContext'
import * as api from '../lib/api'
import { LIMITS } from '../lib/config'
import { friendlyError } from '../lib/errors'
import { validateFile } from '../lib/files'
import { displayName, formatBytes } from '../lib/format'
import { useAsync, useCopy, useDocumentTitle } from '../lib/hooks'
import { AVATAR_POLICY } from '../lib/policies'
import { Link, NavLink, Navigate, useNavigate, useParams } from '../lib/router'
import { downloadJson } from '../lib/download'

function Toggle({ id, checked, onChange, label, hint, disabled }: { id: string; checked: boolean; onChange: (v: boolean) => void; label: string; hint?: ReactNode; disabled?: boolean }) {
  return (
    <div className={`toggle-row${disabled ? ' disabled' : ''}`}>
      <input id={id} type="checkbox" role="switch" className="toggle" checked={checked} disabled={disabled} onChange={(e) => onChange(e.target.checked)} aria-describedby={hint ? `${id}-hint` : undefined} />
      <label htmlFor={id}>
        <span className="toggle-label">{label}</span>
        {hint && <span id={`${id}-hint`} className="hint block">{hint}</span>}
      </label>
    </div>
  )
}

function SaveNote({ state }: { state: { kind: 'success' | 'error'; text: string } | null }) {
  return <div aria-live="polite">{state && <Alert kind={state.kind}>{state.text}</Alert>}</div>
}

function ProfileSection() {
  const { profile, userId, patchProfile } = useAuth()
  const { copied, copy } = useCopy()
  const [name, setName] = useState(profile?.display_name ?? '')
  const [bio, setBio] = useState(profile?.bio ?? '')
  const [busy, setBusy] = useState(false)
  const [note, setNote] = useState<{ kind: 'success' | 'error'; text: string } | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)
  if (!profile || !userId) return null

  async function save(e: FormEvent) {
    e.preventDefault()
    setBusy(true)
    setNote(null)
    try {
      patchProfile(await api.updateProfile(userId as string, { display_name: name.trim() || null, bio: bio.trim() || null }))
      setNote({ kind: 'success', text: 'Profil enregistré.' })
    } catch (err) {
      setNote({ kind: 'error', text: friendlyError(err) })
    } finally {
      setBusy(false)
    }
  }

  async function pickAvatar(f: File | undefined) {
    if (!f || !profile) return
    setNote(null)
    const r = await validateFile(f, AVATAR_POLICY)
    if (!r.ok) {
      setNote({ kind: 'error', text: r.error })
      if (fileRef.current) fileRef.current.value = ''
      return
    }
    setBusy(true)
    try {
      patchProfile(await api.uploadAvatar(userId as string, f, r.type, profile.avatar_path))
      setNote({ kind: 'success', text: 'Photo de profil mise à jour. Elle est visible par les autres membres.' })
    } catch (err) {
      setNote({ kind: 'error', text: friendlyError(err) })
    } finally {
      setBusy(false)
      if (fileRef.current) fileRef.current.value = ''
    }
  }

  async function dropAvatar() {
    if (!profile) return
    setBusy(true)
    try {
      patchProfile(await api.removeAvatar(userId as string, profile.avatar_path))
      setNote({ kind: 'success', text: 'Photo supprimée.' })
    } catch (err) {
      setNote({ kind: 'error', text: friendlyError(err) })
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="stack">
      <div className="card stack">
        <h2>Votre identifiant public</h2>
        <p className="mono accent big">{profile.public_id}</p>
        <p className="hint">Attribué automatiquement à l’inscription, unique et permanent : il ne peut être modifié ni par vous ni par quelqu’un d’autre. Communiquez-le pour qu’on puisse vous retrouver.</p>
        <div><button type="button" className="btn btn-sm" onClick={() => copy(profile.public_id)}><Icon name={copied ? 'check' : 'copy'} size={16} /> {copied ? 'Copié' : 'Copier mon identifiant'}</button></div>
      </div>

      <div className="card stack">
        <h2>Photo de profil</h2>
        <div className="row">
          <Avatar profile={profile} size={72} />
          <input ref={fileRef} type="file" hidden accept="image/png,image/jpeg,image/webp" onChange={(e) => void pickAvatar(e.target.files?.[0])} />
          <button type="button" className="btn btn-sm" disabled={busy} onClick={() => fileRef.current?.click()}><Icon name="upload" size={16} /> Choisir une photo</button>
          {profile.avatar_path && <button type="button" className="btn btn-sm btn-danger-ghost" disabled={busy} onClick={dropAvatar}><Icon name="trash" size={16} /> Supprimer</button>}
        </div>
        <p className="hint">Facultative. PNG, JPEG ou WebP, {formatBytes(LIMITS.avatarBytes)} maximum. Elle sera visible par les autres membres.</p>
      </div>

      <form className="card stack" onSubmit={save}>
        <h2>Informations publiques</h2>
        <Field label="Nom d’affichage (facultatif)" htmlFor="p-name" hint="Visible par les autres membres, à côté de votre identifiant.">
          <input id="p-name" className="input" maxLength={40} value={name} onChange={(e) => setName(e.target.value)} aria-describedby="p-name-hint" />
        </Field>
        <Field label="Courte présentation (facultatif)" htmlFor="p-bio" hint={`Ne mentionnez ni adresse, ni téléphone, ni information sensible. (${bio.length}/300)`}>
          <textarea id="p-bio" className="input" rows={4} maxLength={300} value={bio} onChange={(e) => setBio(e.target.value)} aria-describedby="p-bio-hint" />
        </Field>
        <SaveNote state={note} />
        <div><button type="submit" className="btn btn-primary" disabled={busy}>{busy ? 'Enregistrement…' : 'Enregistrer'}</button></div>
      </form>
    </div>
  )
}

function NotificationsSection() {
  const { prefs, updatePrefs, permission, enableBrowserNotifications } = useNotify()
  const [note, setNote] = useState<{ kind: 'success' | 'error'; text: string } | null>(null)
  async function set(patch: Parameters<typeof updatePrefs>[0]) {
    setNote(null)
    try {
      await updatePrefs(patch)
    } catch (e) {
      setNote({ kind: 'error', text: `Réglage non enregistré : ${friendlyError(e)}` })
    }
  }
  return (
    <div className="stack">
      <Alert kind="info" title="Vous gardez le contrôle">
        Aucune notification n’est envoyée sans votre accord. Par défaut : notifications du navigateur, e-mails, sons et alertes visuelles sont <strong>désactivés</strong>.
        Seul un petit indicateur discret (un compteur sur « Messages ») est affiché, et vous pouvez le désactiver.
      </Alert>

      <div className="card stack">
        <h2>Dans l’application</h2>
        <Toggle id="n-indicator" checked={prefs.inapp_indicator} onChange={(v) => set({ inapp_indicator: v })} label="Indicateur discret de nouveaux messages" hint="Un compteur sur le menu, sans son ni fenêtre intrusive." />
        <Toggle id="n-visual" checked={prefs.visual_alerts} onChange={(v) => set({ visual_alerts: v })} label="Alertes visuelles non essentielles" hint="Une petite bulle temporaire en bas de l’écran pendant que la page est ouverte. Désactivée par défaut." />
        <Toggle id="n-sound" checked={prefs.sound} onChange={(v) => set({ sound: v })} label="Sons" hint="Un bip très court à l’arrivée d’un événement que vous avez choisi de signaler. Désactivé par défaut." />
      </div>

      <div className="card stack">
        <h2>Événements à signaler</h2>
        <Toggle id="n-ev-msg" checked={prefs.event_messages} onChange={(v) => set({ event_messages: v })} label="Nouveaux messages privés" />
        <Toggle id="n-ev-help" checked={prefs.event_help_requests} onChange={(v) => set({ event_help_requests: v })} label="Nouvelles demandes d’aide" hint="Un compteur sur « Entraide » lorsqu’une demande est publiée. Désactivé par défaut." />
        <p className="hint">Ces choix s’appliquent à l’indicateur, aux alertes visuelles, aux sons et aux notifications du navigateur.</p>
      </div>

      <div className="card stack">
        <h2>Notifications du navigateur</h2>
        {permission === 'unsupported' && <Alert kind="info">Votre navigateur ne gère pas les notifications. Rien à faire : l’indicateur dans l’application reste disponible.</Alert>}
        {permission === 'denied' && <Alert kind="warn">Vous avez refusé les notifications dans votre navigateur. Nous respectons ce choix et ne vous le redemanderons pas. Pour changer d’avis, autorisez-les dans les réglages du site de votre navigateur.</Alert>}
        {permission !== 'unsupported' && permission !== 'denied' && (
          prefs.browser && permission === 'granted' ? (
            <div className="row">
              <span className="badge badge-resolved"><Icon name="check" size={14} /> Activées</span>
              <button type="button" className="btn btn-sm" onClick={() => set({ browser: false })}>Désactiver</button>
            </div>
          ) : (
            <div className="stack">
              <div><button type="button" className="btn" onClick={() => void enableBrowserNotifications().catch((e) => setNote({ kind: 'error', text: friendlyError(e) }))}><Icon name="bell" size={18} /> Activer les notifications du navigateur</button></div>
              <p className="hint">Votre navigateur vous demandera votre accord uniquement après ce clic.</p>
            </div>
          )
        )}
        <p className="hint">Limite de cette version : elles s’affichent tant que Coup de Pouce est ouvert dans un onglet. Les notifications « push » avec l’onglet fermé ne sont pas disponibles.</p>
      </div>

      <div className="card stack">
        <h2>E-mails</h2>
        <Toggle id="n-email" checked={false} disabled onChange={() => undefined} label="Notifications par e-mail" hint="Indisponible dans cette version : aucun message privé n’est transmis par e-mail et aucune lettre d’information n’existe. Si cette option est ajoutée un jour, elle sera désactivée par défaut." />
      </div>

      <div className="card stack">
        <h2>Messages de sécurité (non facultatifs)</h2>
        <p>Certains e-mails sont strictement nécessaires au fonctionnement de votre compte : confirmation de l’adresse e-mail à l’inscription, réinitialisation de mot de passe. Ils ne sont envoyés que lorsque <strong>vous</strong> les déclenchez, ne contiennent jamais de publicité et ne peuvent pas être désactivés, car sans eux le compte ne peut pas être sécurisé.</p>
      </div>
      <SaveNote state={note} />
      <p className="hint">Vos choix sont enregistrés dans votre profil et retrouvés à votre prochaine connexion. Les réglages de votre navigateur et de votre système (« Ne pas déranger ») restent prioritaires.</p>
    </div>
  )
}

function PrivacySection() {
  const { settings, userId, patchSettings } = useAuth()
  const blocked = useAsync(() => api.listBlocked(), [])
  const [note, setNote] = useState<{ kind: 'success' | 'error'; text: string } | null>(null)
  if (!settings || !userId) return null

  async function set(patch: { allow_contact?: boolean; searchable?: boolean }) {
    setNote(null)
    try {
      await api.updateSettings(userId as string, patch)
      patchSettings(patch)
    } catch (e) {
      setNote({ kind: 'error', text: friendlyError(e) })
    }
  }

  async function unblock(id: string) {
    try {
      await api.unblockUser(id)
      blocked.reload()
    } catch (e) {
      setNote({ kind: 'error', text: friendlyError(e) })
    }
  }

  return (
    <div className="stack">
      <div className="card stack">
        <h2>Qui peut me contacter ?</h2>
        <Toggle id="pv-contact" checked={settings.allow_contact} onChange={(v) => set({ allow_contact: v })} label="Accepter de nouvelles conversations" hint="Désactivé : personne ne peut démarrer une nouvelle conversation avec vous. Les conversations déjà ouvertes continuent ; bloquez quelqu’un pour y mettre fin." />
        <Toggle id="pv-search" checked={settings.searchable} onChange={(v) => set({ searchable: v })} label="Être retrouvable par recherche d’identifiant" hint="Désactivé : la recherche ne vous trouvera pas (vos demandes d’aide publiées restent visibles par les membres connectés)." />
        <p className="hint">Votre adresse e-mail n’est jamais visible par les autres membres.</p>
        <SaveNote state={note} />
      </div>

      <div className="card stack">
        <h2>Utilisateurs bloqués</h2>
        {blocked.loading && <Spinner />}
        {blocked.error && <Alert kind="error">{blocked.error}</Alert>}
        {blocked.data && blocked.data.length === 0 && <EmptyState icon="block" title="Aucun utilisateur bloqué">Vous pouvez bloquer quelqu’un depuis son profil ou depuis une conversation.</EmptyState>}
        <ul className="plain-list">
          {blocked.data?.map((b) => (
            <li key={b.blocked_id} className="row between">
              <span className="row tight"><Avatar profile={b.profile} size={36} /> <span><strong>{displayName(b.profile)}</strong> <span className="mono small">{b.profile?.public_id}</span></span></span>
              <button type="button" className="btn btn-sm" onClick={() => unblock(b.blocked_id)}>Débloquer</button>
            </li>
          ))}
        </ul>
      </div>

      <div className="card stack">
        <h2>Vos conversations et vos données</h2>
        <p>Vos conversations ne sont lisibles que par vous et votre interlocuteur. Vous pouvez supprimer chacun de vos messages (et ses fichiers) depuis la conversation, supprimer vos demandes d’aide depuis leur page, et supprimer l’ensemble de votre compte dans la section « Compte ».</p>
      </div>
    </div>
  )
}

function AccountSection() {
  return LOCAL ? <LocalAccountSection /> : <RemoteAccountSection />
}

function RemoteAccountSection() {
  const { email, userId, signOut } = useAuth()
  const navigate = useNavigate()
  const [pw, setPw] = useState('')
  const [pwBusy, setPwBusy] = useState(false)
  const [note, setNote] = useState<{ kind: 'success' | 'error'; text: string } | null>(null)
  const [deleting, setDeleting] = useState(false)
  const [confirmText, setConfirmText] = useState('')
  const [delBusy, setDelBusy] = useState(false)
  const [delError, setDelError] = useState<string | null>(null)
  const [exporting, setExporting] = useState(false)
  const [exportError, setExportError] = useState<string | null>(null)

  async function changePassword(e: FormEvent) {
    e.preventDefault()
    if (pw.length < 8) return setNote({ kind: 'error', text: 'Choisissez un mot de passe d’au moins 8 caractères.' })
    setPwBusy(true)
    setNote(null)
    try {
      await api.updatePassword(pw)
      setPw('')
      setNote({ kind: 'success', text: 'Mot de passe modifié.' })
    } catch (err) {
      setNote({ kind: 'error', text: friendlyError(err) })
    } finally {
      setPwBusy(false)
    }
  }

  async function exportData() {
    setExporting(true)
    setExportError(null)
    try {
      const data = await api.exportMyData(userId as string)
      downloadJson(`coup-de-pouce-mes-donnees-${new Date().toISOString().slice(0, 10)}.json`, data)
    } catch (e) {
      setExportError(friendlyError(e, 'Impossible de préparer l’export. Réessayez.'))
    } finally {
      setExporting(false)
    }
  }

  async function remove() {
    setDelBusy(true)
    setDelError(null)
    try {
      await api.deleteAccount(userId as string)
      navigate('/')
    } catch (e) {
      setDelError(friendlyError(e))
      setDelBusy(false)
    }
  }

  return (
    <div className="stack">
      <div className="card stack">
        <h2>Informations de compte</h2>
        <p>Adresse e-mail : <strong>{email}</strong></p>
        <p className="hint">Cette adresse est privée : elle n’est jamais affichée aux autres membres et ne sert qu’à la connexion et aux messages de sécurité.</p>
        <div><button type="button" className="btn" onClick={() => signOut()}><Icon name="logout" size={18} /> Se déconnecter</button></div>
      </div>

      <form className="card stack" onSubmit={changePassword}>
        <h2>Changer de mot de passe</h2>
        <Field label="Nouveau mot de passe" htmlFor="new-pw" hint="8 caractères minimum.">
          <input id="new-pw" className="input" type="password" autoComplete="new-password" minLength={8} value={pw} onChange={(e) => setPw(e.target.value)} aria-describedby="new-pw-hint" />
        </Field>
        <SaveNote state={note} />
        <div><button type="submit" className="btn btn-primary" disabled={pwBusy || !pw}>{pwBusy ? 'Modification…' : 'Modifier le mot de passe'}</button></div>
      </form>

      <div className="card stack">
        <h2>Télécharger mes données</h2>
        <p>Obtenez une copie de vos informations : profil, réglages, demandes d’aide, messages que vous avez écrits et liste de vos blocages. Le fichier est fabriqué dans votre navigateur et n’est envoyé à personne.</p>
        {exportError && <Alert kind="error">{exportError}</Alert>}
        <div>
          <button type="button" className="btn" disabled={exporting} onClick={() => void exportData()}>
            <Icon name="download" size={18} /> {exporting ? 'Préparation…' : 'Télécharger mes données (JSON)'}
          </button>
        </div>
        <p className="hint">Détails sur l’usage de vos données : <Link to="/confidentialite">page Confidentialité</Link>.</p>
      </div>

      <div className="card stack danger-zone">
        <h2>Supprimer mon compte</h2>
        <p>Votre profil, vos messages, vos demandes d’aide, vos fichiers et votre photo seront supprimés définitivement. Votre identifiant public ne sera jamais réattribué. Les signalements que vous avez effectués sont conservés sans votre identité.</p>
        <div><button type="button" className="btn btn-danger" onClick={() => setDeleting(true)}><Icon name="trash" size={18} /> Supprimer mon compte</button></div>
      </div>

      {deleting && (
        <Dialog title="Supprimer définitivement mon compte ?" onClose={() => !delBusy && setDeleting(false)}>
          <div className="stack">
            <p>Cette action est <strong>irréversible</strong>. Pour confirmer, tapez <code>SUPPRIMER</code> ci-dessous.</p>
            <input className="input" aria-label="Tapez SUPPRIMER pour confirmer" value={confirmText} onChange={(e) => setConfirmText(e.target.value)} autoComplete="off" />
            {delError && <Alert kind="error">{delError}</Alert>}
            <div className="row end">
              <button type="button" className="btn" disabled={delBusy} onClick={() => setDeleting(false)}>Annuler</button>
              <button type="button" className="btn btn-danger" disabled={delBusy || confirmText.trim().toUpperCase() !== 'SUPPRIMER'} onClick={remove}>{delBusy ? 'Suppression…' : 'Supprimer définitivement'}</button>
            </div>
          </div>
        </Dialog>
      )}
    </div>
  )
}

const SECTIONS = [
  { id: 'profil', label: 'Profil', icon: 'user' },
  { id: 'apparence', label: 'Apparence', icon: 'palette' },
  { id: 'notifications', label: 'Notifications', icon: 'bell' },
  { id: 'confidentialite', label: 'Confidentialité', icon: 'lock' },
  { id: 'compte', label: 'Compte', icon: 'settings' },
] as const

export default function SettingsPage() {
  const { section } = useParams()
  const current = SECTIONS.find((s) => s.id === section)
  useDocumentTitle(current ? `Paramètres — ${current.label}` : 'Paramètres')
  if (!section) return <Navigate to="/parametres/profil" />
  if (!current) return <Navigate to="/parametres/profil" />
  return (
    <div className="page">
      <header className="page-head"><h1>Paramètres</h1></header>
      <div className="settings-layout">
        <nav className="settings-nav" aria-label="Sections des paramètres">
          {SECTIONS.map((s) => (
            <NavLink key={s.id} to={`/parametres/${s.id}`}><Icon name={s.icon} size={18} /> {s.label}</NavLink>
          ))}
        </nav>
        <div className="settings-body">
          {current.id === 'profil' && <ProfileSection />}
          {current.id === 'apparence' && (<div className="card"><h2>Apparence</h2><AppearancePanel /></div>)}
          {current.id === 'notifications' && <NotificationsSection />}
          {current.id === 'confidentialite' && <PrivacySection />}
          {current.id === 'compte' && <AccountSection />}
        </div>
      </div>
    </div>
  )
}

export function AppearancePage() {
  useDocumentTitle('Apparence')
  return (
    <div className="page narrow">
      <header className="page-head">
        <h1>Apparence</h1>
        <p className="muted">Choisissez le thème qui vous convient : clair, sombre, EITT ou personnalisé.</p>
      </header>
      <div className="card"><AppearancePanel /></div>
    </div>
  )
}
