import { useEffect, useState, type ReactNode } from 'react'
import { avatarUrl } from '../lib/api'
import { initials } from '../lib/format'

const PATHS: Record<string, string> = {
  home: 'M3 11 12 3l9 8v10a1 1 0 0 1-1 1h-5v-7H9v7H4a1 1 0 0 1-1-1z',
  search: 'M11 4a7 7 0 1 0 0 14 7 7 0 0 0 0-14zm9 16-3.5-3.5',
  chat: 'M21 12a8 8 0 0 1-11.6 7.1L4 20l1-4.6A8 8 0 1 1 21 12z',
  help: 'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18zm0 6a3 3 0 1 0 0 6 3 3 0 0 0 0-6zM5.6 5.6l3.2 3.2m6.4 6.4 3.2 3.2m0-12.8-3.2 3.2m-6.4 6.4-3.2 3.2',
  user: 'M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8zm-8 9a8 8 0 0 1 16 0',
  settings: 'M4 7h9m4 0h3M4 17h3m4 0h9M15 4v6M9 14v6',
  shield: 'M12 3 4 6v6c0 4.5 3.2 8 8 9 4.8-1 8-4.5 8-9V6l-8-3zm-3 9 2 2 4-4',
  book: 'M4 5a2 2 0 0 1 2-2h13v16H6a2 2 0 0 0-2 2V5zm0 14a2 2 0 0 1 2-2h13',
  send: 'M22 2 11 13M22 2l-7 20-4-9-9-4 20-7z',
  paperclip: 'm21 11-9 9a5 5 0 0 1-7-7l9-9a3.5 3.5 0 0 1 5 5l-9 9a2 2 0 0 1-3-3l8-8',
  image: 'M4 5h16v14H4zM8 10a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3zM4 17l5-5 4 4 3-3 4 4',
  video: 'M3 6h12v12H3zM15 10l6-3v10l-6-3',
  link: 'M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1',
  copy: 'M9 9h11v11H9zM5 15V4h11',
  flag: 'M5 21V4m0 0h12l-2 4 2 4H5',
  block: 'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18zM5.6 5.6l12.8 12.8',
  trash: 'M4 7h16M9 7V4h6v3m-8 0 1 13h8l1-13',
  x: 'M6 6l12 12M18 6 6 18',
  check: 'm5 12 5 5 9-10',
  alert: 'M12 3 2 20h20L12 3zm0 6v5m0 3v.5',
  info: 'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18zm0 8v5m0-8v.5',
  bell: 'M6 16v-5a6 6 0 0 1 12 0v5l2 2H4l2-2zm4 4a2 2 0 0 0 4 0',
  sun: 'M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8zM12 2v2m0 16v2M4.9 4.9l1.4 1.4m11.4 11.4 1.4 1.4M2 12h2m16 0h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4',
  moon: 'M20 14.5A8 8 0 0 1 9.5 4 8 8 0 1 0 20 14.5z',
  palette: 'M12 3a9 9 0 1 0 0 18c1.5 0 2-1 1.5-2s-.5-2 1-2H17a4 4 0 0 0 4-4c0-5-4-10-9-10zM7.5 11h.01M10 7.5h.01M15 7.5h.01',
  laptop: 'M5 6h14v9H5zM2 19h20',
  phone: 'M8 3h8v18H8zM11 18h2',
  globe: 'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18zM3 12h18M12 3c3 3 3 15 0 18M12 3c-3 3-3 15 0 18',
  apps: 'M4 4h6v6H4zM14 4h6v6h-6zM4 14h6v6H4zM14 14h6v6h-6z',
  file: 'M6 3h8l4 4v14H6zM14 3v4h4',
  doc: 'M6 3h12v18H6zM9 8h6M9 12h6M9 16h4',
  code: 'm8 7-5 5 5 5m8-10 5 5-5 5M14 5l-4 14',
  spark: 'M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8L12 3zM19 17l.7 2 2 .7-2 .7-.7 2-.7-2-2-.7 2-.7.7-2z',
  dots: 'M5 12a1 1 0 1 0 2 0 1 1 0 0 0-2 0zM11 12a1 1 0 1 0 2 0 1 1 0 0 0-2 0zM17 12a1 1 0 1 0 2 0 1 1 0 0 0-2 0z',
  logout: 'M9 4H5v16h4M16 8l4 4-4 4M20 12H9',
  plus: 'M12 5v14M5 12h14',
  back: 'M15 5l-7 7 7 7',
  arrow: 'M5 12h14m-6-6 6 6-6 6',
  external: 'M14 4h6v6M20 4l-9 9M18 14v6H4V6h6',
  download: 'M12 4v11m0 0 4-4m-4 4-4-4M5 20h14',
  eye: 'M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12zm10-3a3 3 0 1 0 0 6 3 3 0 0 0 0-6z',
  refresh: 'M20 11a8 8 0 0 0-14-4L4 9M4 5v4h4M4 13a8 8 0 0 0 14 4l2-2m0 4v-4h-4',
  lock: 'M6 11h12v9H6zM8 11V8a4 4 0 0 1 8 0v3',
  mail: 'M3 6h18v12H3zM3 7l9 7 9-7',
  play: 'M7 4l13 8-13 8z',
  archive: 'M3 5h18v4H3zM5 9v10h14V9M10 13h4',
  heart: 'M12 20s-8-5-8-11a4.5 4.5 0 0 1 8-2.8A4.5 4.5 0 0 1 20 9c0 6-8 11-8 11z',
  mask: 'M4 8c3-2 13-2 16 0v4a8 8 0 0 1-16 0V8zm4 3h2m4 0h2M9 15c1.5 1 4.5 1 6 0',
  scale: 'M12 4v16M6 20h12M5 7h14M5 7l-3 7a3 3 0 0 0 6 0L5 7zm14 0-3 7a3 3 0 0 0 6 0l-3-7z',
  quote: 'M7 7h4v4H8a3 3 0 0 0 0 6M15 7h4v4h-3a3 3 0 0 0 0 6',
  upload: 'M12 16V4m0 0-4 4m4-4 4 4M4 16v4h16v-4',
}

export type IconName = keyof typeof PATHS

export function Icon({ name, size = 20, className }: { name: string; size?: number; className?: string }) {
  return (
    <svg
      className={['icon', className].filter(Boolean).join(' ')}
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      <path d={PATHS[name] ?? PATHS.info} />
    </svg>
  )
}

export function Spinner({ label = 'Chargement…' }: { label?: string }) {
  return (
    <div className="spinner-wrap" role="status">
      <span className="spinner" aria-hidden="true" />
      <span>{label}</span>
    </div>
  )
}

export function PageLoading() {
  return (
    <div className="page narrow">
      <Spinner />
    </div>
  )
}

export function Alert({ kind = 'info', children, title }: { kind?: 'info' | 'error' | 'success' | 'warn'; children: ReactNode; title?: string }) {
  const icon = kind === 'error' ? 'alert' : kind === 'success' ? 'check' : kind === 'warn' ? 'alert' : 'info'
  return (
    <div className={`alert alert-${kind}`} role={kind === 'error' ? 'alert' : 'status'}>
      <Icon name={icon} />
      <div>
        {title && <strong className="alert-title">{title}</strong>}
        <div>{children}</div>
      </div>
    </div>
  )
}

export function EmptyState({ icon = 'info', title, children, action }: { icon?: string; title: string; children?: ReactNode; action?: ReactNode }) {
  return (
    <div className="empty">
      <div className="empty-icon">
        <Icon name={icon} size={28} />
      </div>
      <h3>{title}</h3>
      {children && <p className="muted">{children}</p>}
      {action}
    </div>
  )
}

export function Avatar({ profile, size = 44 }: { profile: { display_name: string | null; public_id: string; avatar_path: string | null } | null; size?: number }) {
  const url = avatarUrl(profile?.avatar_path)
  const [broken, setBroken] = useState(false)
  useEffect(() => setBroken(false), [url])
  return (
    <span className="avatar" style={{ width: size, height: size, fontSize: Math.round(size * 0.38) }} aria-hidden="true">
      {url && !broken ? <img src={url} alt="" width={size} height={size} loading="lazy" onError={() => setBroken(true)} /> : initials(profile)}
    </span>
  )
}

export function StatusBadge({ status }: { status: 'open' | 'in_progress' | 'resolved' }) {
  const map = { open: ['Ouverte', 'help'], in_progress: ['En cours', 'refresh'], resolved: ['Résolue', 'check'] } as const
  const [label, icon] = map[status] ?? map.open
  return (
    <span className={`badge badge-${status}`}>
      <Icon name={icon} size={14} />
      {label}
    </span>
  )
}

export function Field({ label, hint, error, children, htmlFor }: { label: string; hint?: string; error?: string | null; children: ReactNode; htmlFor: string }) {
  return (
    <div className="field">
      <label htmlFor={htmlFor}>{label}</label>
      {children}
      {hint && <p className="hint" id={`${htmlFor}-hint`}>{hint}</p>}
      {error && <p className="field-error" role="alert">{error}</p>}
    </div>
  )
}
