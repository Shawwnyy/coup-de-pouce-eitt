import { useRef, useState } from 'react'
import { Alert, Icon } from '../components/ui'
import { useAuth } from '../context/AuthContext'
import { friendlyError } from '../lib/errors'
import { useDocumentTitle } from '../lib/hooks'
import { Link } from '../lib/router'
import { exportMessagesFor, importMessages, importShareCode, listContacts, makeShareCode, deleteAccount } from './localApi'

type Note = { kind: 'success' | 'error'; text: string } | null

/** Télécharge un texte sous forme de fichier (fabriqué dans le navigateur, rien n'est envoyé). */
function saveText(filename: string, text: string): void {
  const blob = new Blob([text], { type: 'application/json' })
  const a = document.createElement('a')
  a.download = filename
  const viaBlob = window.location.protocol !== 'file:'
  if (viaBlob) {
    a.href = URL.createObjectURL(blob)
    document.body.appendChild(a)
    a.click()
    a.remove()
    setTimeout(() => URL.revokeObjectURL(a.href), 10_000)
    return
  }
  const r = new FileReader()
  r.onload = () => {
    a.href = String(r.result)
    document.body.appendChild(a)
    a.click()
    a.remove()
  }
  r.readAsDataURL(blob)
}

async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text)
    return true
  } catch {
    const t = document.createElement('textarea')
    t.value = text
    document.body.appendChild(t)
    t.select()
    const ok = document.execCommand('copy')
    t.remove()
    return ok
  }
}

/** Bloc « Mon code de partage » (page Échanger et page Profil). Le code ne contient ni mot de passe ni message. */
export function ShareCodeCard({ onProfile = false }: { onProfile?: boolean }) {
  const { profile } = useAuth()
  const [copyNote, setCopyNote] = useState<string | null>(null)
  if (!profile) return null
  const myCode = makeShareCode()
  return (
    <section className={onProfile ? 'share-card stack' : 'card stack'} aria-labelledby={onProfile ? 'pf-code' : 'ex-1'}>
      <h2 id={onProfile ? 'pf-code' : 'ex-1'}>{onProfile ? 'Mon code de partage' : '1. Mon code de partage'}</h2>
      <p>
        Donnez ce code à une personne qui utilise Coup de Pouce sur un autre appareil : elle pourra vous retrouver par votre nom ou votre numéro {profile.public_id}.
        Il ne contient pas de mot de passe ni de message.
      </p>
      <textarea className="input mono" readOnly rows={3} value={myCode} aria-label="Mon code de partage" onFocus={(e) => e.currentTarget.select()} />
      <div className="row">
        <button type="button" className="btn btn-primary" onClick={async () => setCopyNote((await copyText(myCode)) ? 'Code copié.' : 'Copie impossible : sélectionnez le code et copiez-le.')}>
          <Icon name="copy" size={18} /> Copier mon code
        </button>
        {onProfile && <Link to="/echanger" className="btn">Ajouter quelqu’un / échanger des messages</Link>}
        {copyNote && <span className="hint" role="status">{copyNote}</span>}
      </div>
    </section>
  )
}

export function ExchangePage() {
  useDocumentTitle('Échanger avec un autre appareil')
  const { profile } = useAuth()
  const [, setTick] = useState(0)
  const refresh = () => setTick((t) => t + 1)
  const [code, setCode] = useState('')
  const [addNote, setAddNote] = useState<Note>(null)
  const [sendNote, setSendNote] = useState<Note>(null)
  const [recvNote, setRecvNote] = useState<Note>(null)
  const [busy, setBusy] = useState(false)
  const file = useRef<HTMLInputElement>(null)
  const contacts = listContacts()

  function add() {
    try {
      const p = importShareCode(code)
      setAddNote({ kind: 'success', text: `${p.display_name ?? 'Cette personne'} (${p.public_id}) est ajoutée : vous pouvez la retrouver dans la recherche.` })
      setCode('')
      refresh()
    } catch (e) {
      setAddNote({ kind: 'error', text: friendlyError(e) })
    }
  }

  async function send(id: string, label: string) {
    setSendNote(null)
    setBusy(true)
    try {
      const { text, count } = await exportMessagesFor(id)
      saveText(`messages-pour-${label.replace('#', '-')}.json`, text)
      setSendNote({ kind: 'success', text: `Fichier préparé avec ${count} message${count > 1 ? 's' : ''}. Envoyez-le à ${label} (messagerie, e-mail, clé USB…) : rien n’est envoyé automatiquement.` })
    } catch (e) {
      setSendNote({ kind: 'error', text: friendlyError(e) })
    } finally {
      setBusy(false)
    }
  }

  async function receive(f: File | undefined) {
    if (!f) return
    setRecvNote(null)
    setBusy(true)
    try {
      if (f.size > 120 * 1024 * 1024) throw new Error('bad_package')
      const r = await importMessages(await f.text())
      setRecvNote({
        kind: 'success',
        text: `${r.added} nouveau${r.added > 1 ? 'x' : ''} message${r.added > 1 ? 's' : ''} de ${r.from.display_name ?? r.from.public_id} (${r.from.public_id})${r.skipped ? ` · ${r.skipped} déjà reçu${r.skipped > 1 ? 's' : ''} ou ignoré${r.skipped > 1 ? 's' : ''}` : ''}.`,
      })
      refresh()
    } catch (e) {
      setRecvNote({ kind: 'error', text: friendlyError(e) })
    } finally {
      setBusy(false)
      if (file.current) file.current.value = ''
    }
  }

  return (
    <div className="page narrow">
      <header className="page-head">
        <h1>Échanger avec un autre appareil</h1>
        <p className="muted">Pour retrouver quelqu’un qui utilise Coup de Pouce sur un autre ordinateur ou téléphone.</p>
      </header>
      <Alert kind="info" title="Pourquoi un code ?">
        Sans serveur, un site ne peut pas voir les autres appareils : personne ne peut être « trouvé » automatiquement. On s’échange donc une fois un code (pour se
        retrouver par nom ou numéro), puis des fichiers de messages envoyés par vos propres moyens. Ce n’est ni instantané ni automatique.
      </Alert>

      <ShareCodeCard />

      <section className="card stack" aria-labelledby="ex-2">
        <h2 id="ex-2">2. Ajouter quelqu’un avec son code</h2>
        <label htmlFor="ex-code">Code reçu (commence par CDP1.)</label>
        <textarea id="ex-code" className="input mono" rows={3} value={code} onChange={(e) => setCode(e.target.value)} placeholder="CDP1.…" />
        {addNote && <Alert kind={addNote.kind}>{addNote.text}</Alert>}
        <div className="row">
          <button type="button" className="btn btn-primary" onClick={add} disabled={!code.trim()}><Icon name="plus" size={18} /> Ajouter</button>
          <Link to="/recherche" className="btn btn-ghost">Aller à la recherche</Link>
        </div>
      </section>

      <section className="card stack" aria-labelledby="ex-3">
        <h2 id="ex-3">3. Envoyer mes messages à quelqu’un d’un autre appareil</h2>
        {contacts.length === 0 ? (
          <p className="muted">Aucune personne d’un autre appareil pour l’instant. Ajoutez-en une avec son code (étape 2), puis écrivez-lui depuis « Messages » ou « Recherche ».</p>
        ) : (
          <ul className="stack profile-list">
            {contacts.map((c) => (
              <li key={c.id} className="row">
                <div className="grow">
                  <strong>{c.public_id}</strong> <span className="muted">{c.display_name ?? 'Sans nom'}</span>
                </div>
                <button type="button" className="btn btn-sm btn-primary" disabled={busy} onClick={() => void send(c.id, c.public_id)}>
                  <Icon name="send" size={16} /> Préparer le fichier
                </button>
                <button type="button" className="btn btn-sm btn-danger-ghost" onClick={() => void deleteAccount(c.id).then(refresh)} aria-label={`Retirer ${c.public_id}`}>
                  <Icon name="trash" size={16} /> Retirer
                </button>
              </li>
            ))}
          </ul>
        )}
        {sendNote && <Alert kind={sendNote.kind}>{sendNote.text}</Alert>}
        <p className="hint">Le fichier contient les messages que vous avez écrits à cette personne, avec leurs images et vidéos. Il n’est pas chiffré : n’y mettez rien de secret.</p>
      </section>

      <section className="card stack" aria-labelledby="ex-4">
        <h2 id="ex-4">4. Recevoir un fichier de messages</h2>
        <p>Choisissez le fichier reçu (il doit être adressé au profil actuel, {profile?.public_id}). Les messages apparaissent dans « Messages ».</p>
        <input ref={file} type="file" accept=".json,application/json" hidden onChange={(e) => void receive(e.target.files?.[0])} />
        <div className="row">
          <button type="button" className="btn" disabled={busy} onClick={() => file.current?.click()}><Icon name="upload" size={18} /> Choisir le fichier reçu</button>
          <Link to="/messages" className="btn btn-ghost">Aller aux messages</Link>
        </div>
        {recvNote && <Alert kind={recvNote.kind}>{recvNote.text}</Alert>}
      </section>
    </div>
  )
}
