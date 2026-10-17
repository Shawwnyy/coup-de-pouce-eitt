import type { BgStyle, CustomTheme, ThemeName } from '../types.ts'
import { contrastRatio, isHex, luminance, mix, readableOn, hexToRgb } from './contrast.ts'

export const THEMES: { id: ThemeName; label: string; description: string }[] = [
  { id: 'eitt', label: 'EITT', description: 'Fond sombre et bleu néon, l’identité d’EITT.' },
  { id: 'dark', label: 'Sombre', description: 'Interface sombre classique, sobre et reposante.' },
  { id: 'light', label: 'Clair', description: 'Interface lumineuse à fort contraste.' },
  { id: 'custom', label: 'Personnalisé', description: 'Vos couleurs et votre fond, avec garde-fous de lisibilité.' },
]

export const BG_STYLES: { id: BgStyle; label: string }[] = [
  { id: 'none', label: 'Fond uni' },
  { id: 'grid', label: 'Grille technologique' },
  { id: 'aurora', label: 'Aurore' },
  { id: 'gradient', label: 'Dégradé' },
  { id: 'image', label: 'Mon image (sur cet appareil)' },
]

export const DEFAULT_CUSTOM: CustomTheme = {
  primary: '#00e0f8',
  secondary: '#3b82f6',
  background: '#07101c',
  card: '#0d1b2e',
  text: '#eaf4ff',
  bgStyle: 'grid',
}

export const MIN_TEXT_CONTRAST = 4.5
export const MIN_UI_CONTRAST = 3

export function isThemeName(v: unknown): v is ThemeName {
  return v === 'light' || v === 'dark' || v === 'eitt' || v === 'custom'
}

/** Nettoie une valeur venue du stockage (JSON non fiable) : couleurs hexadécimales uniquement. */
export function sanitizeCustom(raw: unknown): CustomTheme {
  const r = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>
  const pick = (k: keyof CustomTheme): string => (isHex(r[k]) ? (r[k] as string).toLowerCase() : (DEFAULT_CUSTOM[k] as string))
  const bg = r.bgStyle
  return {
    primary: pick('primary'),
    secondary: pick('secondary'),
    background: pick('background'),
    card: pick('card'),
    text: pick('text'),
    bgStyle: BG_STYLES.some((b) => b.id === bg) ? (bg as BgStyle) : DEFAULT_CUSTOM.bgStyle,
  }
}

export interface CustomCheck {
  ok: boolean
  problems: string[]
  ratios: { text: number; textOnCard: number; primary: number }
}

/** Refuse les palettes illisibles (contraste texte ≥ 4,5:1 ; couleur principale ≥ 3:1). */
export function checkCustom(c: CustomTheme): CustomCheck {
  const text = contrastRatio(c.text, c.background)
  const textOnCard = contrastRatio(c.text, c.card)
  const primary = Math.min(contrastRatio(c.primary, c.background), contrastRatio(c.primary, c.card))
  const problems: string[] = []
  const f = (n: number) => n.toFixed(1).replace('.', ',')
  if (text < MIN_TEXT_CONTRAST) problems.push(`Le texte est trop peu contrasté avec le fond (${f(text)}:1, minimum 4,5:1).`)
  if (textOnCard < MIN_TEXT_CONTRAST) problems.push(`Le texte est trop peu contrasté avec les cartes (${f(textOnCard)}:1, minimum 4,5:1).`)
  if (primary < MIN_UI_CONTRAST) problems.push(`La couleur principale se distingue mal du fond ou des cartes (${f(primary)}:1, minimum 3:1).`)
  return { ok: problems.length === 0, problems, ratios: { text, textOnCard, primary } }
}

/** Variables CSS dérivées des 5 couleurs choisies (le reste est calculé pour rester lisible). */
export function customVars(c: CustomTheme): Record<string, string> {
  const dark = luminance(c.background) < 0.4
  let muted = mix(c.text, c.card, 0.32)
  if (contrastRatio(muted, c.card) < MIN_TEXT_CONTRAST || contrastRatio(muted, c.background) < MIN_TEXT_CONTRAST) muted = c.text
  const [pr, pg, pb] = hexToRgb(c.primary)
  const danger = dark ? '#ff7a90' : '#b42318'
  return {
    '--bg': c.background,
    '--bg-2': mix(c.background, c.text, 0.06),
    '--card': c.card,
    '--card-2': mix(c.card, c.text, 0.08),
    '--text': c.text,
    '--muted': muted,
    '--primary': c.primary,
    '--on-primary': readableOn(c.primary),
    '--secondary': c.secondary,
    '--border': mix(c.card, c.text, 0.28),
    '--danger': danger,
    '--on-danger': readableOn(danger),
    '--ok': dark ? '#4ade80' : '#13795b',
    '--warn': dark ? '#fbbf24' : '#8a5a00',
    '--glow-rgb': `${pr} ${pg} ${pb}`,
    '--scheme': dark ? 'dark' : 'light',
    '--scrim': `${c.background}d9`,
  }
}

export const CUSTOM_VAR_NAMES = Object.keys(customVars(DEFAULT_CUSTOM))

export interface LocalPrefs {
  theme: ThemeName
  custom: CustomTheme & { vars: Record<string, string> }
}

const PREFS_KEY = 'cdp.prefs'
const BGIMG_KEY = 'cdp.bgimage'

export function loadLocalPrefs(): { theme: ThemeName; custom: CustomTheme } | null {
  try {
    const raw = localStorage.getItem(PREFS_KEY)
    if (!raw) return null
    const p = JSON.parse(raw) as { theme?: unknown; custom?: unknown }
    return { theme: isThemeName(p.theme) ? p.theme : 'eitt', custom: sanitizeCustom(p.custom) }
  } catch {
    return null
  }
}

export function saveLocalPrefs(theme: ThemeName, custom: CustomTheme): void {
  try {
    const payload: LocalPrefs = { theme, custom: { ...custom, vars: customVars(custom) } }
    localStorage.setItem(PREFS_KEY, JSON.stringify(payload))
  } catch {
    /* stockage plein ou bloqué : la préférence reste active pour la session */
  }
}

export function loadBackgroundImage(): string | null {
  try {
    const v = localStorage.getItem(BGIMG_KEY)
    return v && /^data:image\/(jpeg|png|webp);base64,[a-z0-9+/=]+$/i.test(v) ? v : null
  } catch {
    return null
  }
}

/** Retourne false si l'image n'a pas pu être enregistrée (stockage plein). */
export function saveBackgroundImage(dataUrl: string | null): boolean {
  try {
    if (dataUrl) localStorage.setItem(BGIMG_KEY, dataUrl)
    else localStorage.removeItem(BGIMG_KEY)
    return true
  } catch {
    return false
  }
}

/** Applique le thème au document. */
export function applyTheme(theme: ThemeName, custom: CustomTheme): void {
  const root = document.documentElement
  root.setAttribute('data-theme', theme)
  for (const name of CUSTOM_VAR_NAMES) root.style.removeProperty(name)
  root.style.removeProperty('--bg-image')
  root.removeAttribute('data-bg')
  if (theme === 'custom') {
    const vars = customVars(custom)
    for (const [k, v] of Object.entries(vars)) root.style.setProperty(k, v)
    let style = custom.bgStyle
    if (style === 'image') {
      const img = loadBackgroundImage()
      if (img) root.style.setProperty('--bg-image', `url("${img}")`)
      else style = 'none'
    }
    root.setAttribute('data-bg', style)
  }
  const meta = document.querySelector('meta[name="theme-color"]')
  if (meta) meta.setAttribute('content', theme === 'custom' ? custom.background : theme === 'light' ? '#f3f6fb' : theme === 'dark' ? '#0f1115' : '#05080f')
}
