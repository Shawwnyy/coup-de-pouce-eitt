import { useRef, useState, type CSSProperties } from 'react'
import { useAuth } from '../context/AuthContext'
import { useTheme } from '../context/ThemeContext'
import { friendlyError } from '../lib/errors'
import { validateFile, type FilePolicy } from '../lib/files'
import { formatBytes } from '../lib/format'
import { BG_STYLES, DEFAULT_CUSTOM, THEMES, checkCustom, customVars, loadBackgroundImage, saveBackgroundImage } from '../lib/theme'
import type { BgStyle, CustomTheme, ThemeName } from '../types'
import { Alert, Icon } from './ui'

const BG_POLICY: FilePolicy = { allow: ['image/png', 'image/jpeg', 'image/webp'], maxBytes: { image: 8 * 1024 * 1024, gif: 0, video: 0 } }

/** Réduit l'image (max 1600 px, JPEG) pour qu'elle tienne dans le stockage local du navigateur. */
async function downscale(file: File): Promise<string> {
  const bmp = await createImageBitmap(file)
  const scale = Math.min(1, 1600 / Math.max(bmp.width, bmp.height))
  const canvas = document.createElement('canvas')
  canvas.width = Math.max(1, Math.round(bmp.width * scale))
  canvas.height = Math.max(1, Math.round(bmp.height * scale))
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('canvas')
  ctx.drawImage(bmp, 0, 0, canvas.width, canvas.height)
  bmp.close()
  return canvas.toDataURL('image/jpeg', 0.78)
}

const SWATCH: Record<Exclude<ThemeName, 'custom'>, [string, string, string]> = {
  eitt: ['#05080f', '#0c1626', '#00e0f8'],
  dark: ['#0f1115', '#171a21', '#6cb6ff'],
  light: ['#f3f6fb', '#ffffff', '#0369a1'],
}

export function AppearancePanel() {
  const { theme, custom, setAppearance, refreshBackground } = useTheme()
  const { status } = useAuth()
  const [draft, setDraft] = useState<CustomTheme>(custom)
  const [bgImage, setBgImage] = useState<string | null>(() => loadBackgroundImage())
  const [msg, setMsg] = useState<{ kind: 'success' | 'error' | 'warn'; text: string } | null>(null)
  const [busy, setBusy] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)
  const check = checkCustom(draft)
  const dirty = JSON.stringify(draft) !== JSON.stringify(custom)
  const swatches = (t: ThemeName): [string, string, string] => (t === 'custom' ? [custom.background, custom.card, custom.primary] : SWATCH[t])

  async function save(t: ThemeName, c?: CustomTheme) {
    setBusy(true)
    setMsg(null)
    try {
      await setAppearance(t, c)
      setMsg({ kind: 'success', text: status === 'authed' ? 'Apparence enregistrée. Vous la retrouverez à votre prochaine connexion.' : 'Apparence enregistrée sur cet appareil. Connectez-vous pour la retrouver partout.' })
    } catch (e) {
      setMsg({ kind: 'warn', text: `Appliquée sur cet appareil, mais non enregistrée sur votre profil : ${friendlyError(e)}` })
    } finally {
      setBusy(false)
    }
  }

  async function pickBg(f: File | undefined) {
    if (!f) return
    setMsg(null)
    const r = await validateFile(f, BG_POLICY)
    if (!r.ok) return setMsg({ kind: 'error', text: r.error })
    try {
      const data = await downscale(f)
      if (!saveBackgroundImage(data)) return setMsg({ kind: 'error', text: 'Cette image est trop lourde pour être conservée sur cet appareil. Essayez une image plus petite.' })
      setBgImage(data)
      setDraft((d) => ({ ...d, bgStyle: 'image' }))
      if (theme === 'custom' && custom.bgStyle === 'image') refreshBackground()
      setMsg({ kind: 'success', text: 'Image enregistrée sur cet appareil. Cliquez sur « Appliquer » pour l’utiliser.' })
    } catch {
      setMsg({ kind: 'error', text: 'Cette image n’a pas pu être lue.' })
    } finally {
      if (fileRef.current) fileRef.current.value = ''
    }
  }

  function removeBg() {
    saveBackgroundImage(null)
    setBgImage(null)
    setDraft((d) => (d.bgStyle === 'image' ? { ...d, bgStyle: 'none' } : d))
    if (theme === 'custom') refreshBackground()
  }

  const previewStyle = { ...customVars(draft), ...(draft.bgStyle === 'image' && bgImage ? { '--bg-image': `url("${bgImage}")` } : {}) } as CSSProperties
  const colorField = (key: keyof Omit<CustomTheme, 'bgStyle'>, label: string) => (
    <div className="color-field">
      <label htmlFor={`c-${key}`}>{label}</label>
      <div className="row tight">
        <input id={`c-${key}`} type="color" value={draft[key]} onChange={(e) => setDraft({ ...draft, [key]: e.target.value })} />
        <code>{draft[key]}</code>
      </div>
    </div>
  )

  return (
    <div className="stack">
      <fieldset>
        <legend>Choisissez un thème</legend>
        <div className="theme-choices">
        {THEMES.map((t) => {
          const [a, b, c] = swatches(t.id)
          return (
            <label key={t.id} className={`theme-choice${theme === t.id ? ' selected' : ''}`}>
              <input type="radio" name="theme" value={t.id} checked={theme === t.id} disabled={busy} onChange={() => void save(t.id)} />
              <span className="swatch" aria-hidden="true" style={{ background: a, borderColor: c }}>
                <i style={{ background: b }} />
                <i style={{ background: c }} />
              </span>
              <span>
                <strong>{t.label}</strong> {theme === t.id && <span className="badge">Actif</span>}
                <span className="hint block">{t.description}</span>
              </span>
            </label>
          )
        })}
        </div>
      </fieldset>

      {theme === 'custom' && (
        <section className="card stack" aria-labelledby="custom-title">
          <h3 id="custom-title"><Icon name="palette" /> Personnaliser les couleurs</h3>
          <div className="color-grid">
            {colorField('primary', 'Couleur principale')}
            {colorField('secondary', 'Couleur secondaire')}
            {colorField('background', 'Couleur de fond')}
            {colorField('card', 'Couleur des cartes')}
            {colorField('text', 'Couleur du texte')}
          </div>
          <div className="field">
            <label htmlFor="bg-style">Fond d’écran</label>
            <select id="bg-style" className="input" value={draft.bgStyle} onChange={(e) => setDraft({ ...draft, bgStyle: e.target.value as BgStyle })}>
              {BG_STYLES.map((b) => <option key={b.id} value={b.id} disabled={b.id === 'image' && !bgImage}>{b.label}{b.id === 'image' && !bgImage ? ' (importez une image)' : ''}</option>)}
            </select>
          </div>
          <div className="field">
            <span className="label">Image de fond personnelle</span>
            <input ref={fileRef} type="file" hidden accept="image/png,image/jpeg,image/webp" onChange={(e) => void pickBg(e.target.files?.[0])} />
            <div className="row">
              <button type="button" className="btn btn-sm" onClick={() => fileRef.current?.click()}><Icon name="image" size={16} /> Importer une image</button>
              {bgImage && <button type="button" className="btn btn-sm btn-danger-ghost" onClick={removeBg}><Icon name="trash" size={16} /> Retirer l’image</button>}
            </div>
            <p className="hint">PNG, JPEG ou WebP, {formatBytes(8 * 1024 * 1024)} maximum. L’image reste <strong>uniquement sur cet appareil</strong> (réduite automatiquement) : elle n’est jamais envoyée ni rendue publique.</p>
          </div>

          <div className="theme-preview" data-bg={draft.bgStyle === 'image' && !bgImage ? 'none' : draft.bgStyle} style={previewStyle} aria-label="Aperçu de votre thème" role="img">
            <div className="tp-card">
              <strong>Aperçu</strong>
              <p>Voici à quoi ressemblera le texte sur vos cartes.</p>
              <p className="tp-muted">Texte secondaire, plus discret.</p>
              <span className="tp-btn">Bouton principal</span>
            </div>
          </div>

          <div aria-live="polite" className="stack">
            {check.ok ? (
              <p className="hint ok-text"><Icon name="check" size={16} /> Lisibilité vérifiée — contraste du texte : {check.ratios.text.toFixed(1).replace('.', ',')}:1 (minimum 4,5:1).</p>
            ) : (
              <Alert kind="error" title="Cette combinaison n’est pas assez lisible">
                <ul>{check.problems.map((p) => <li key={p}>{p}</li>)}</ul>
              </Alert>
            )}
          </div>
          <div className="row">
            <button type="button" className="btn btn-primary" disabled={!check.ok || busy || !dirty} onClick={() => void save('custom', draft)}>Appliquer et enregistrer</button>
            <button type="button" className="btn" disabled={!dirty} onClick={() => setDraft(custom)}>Annuler les modifications</button>
            <button type="button" className="btn btn-ghost" onClick={() => setDraft({ ...DEFAULT_CUSTOM })}>Valeurs EITT par défaut</button>
          </div>
        </section>
      )}
      <div aria-live="polite">{msg && <Alert kind={msg.kind}>{msg.text}</Alert>}</div>
      <p className="hint">
        {status === 'authed' ? 'Votre thème est enregistré dans votre profil et retrouvé à chaque connexion.' : 'Sans compte, votre thème est conservé dans ce navigateur.'} Les couleurs sont toujours contrôlées pour rester lisibles.
      </p>
    </div>
  )
}
