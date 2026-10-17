import { useRef, type ReactNode } from 'react'
import { Icon } from './ui'

/** Petit menu d'actions accessible (élément natif <details>, utilisable au clavier). */
export function Menu({ label, children, align = 'right' }: { label: string; children: ReactNode; align?: 'left' | 'right' }) {
  const ref = useRef<HTMLDetailsElement>(null)
  return (
    <details className="menu" ref={ref} onBlur={(e) => !e.currentTarget.contains(e.relatedTarget as Node | null) && ref.current?.removeAttribute('open')}>
      <summary className="icon-btn" aria-label={label} title={label}>
        <Icon name="dots" />
      </summary>
      <div className={`menu-list menu-${align}`} role="group" aria-label={label} onClick={() => ref.current?.removeAttribute('open')}>
        {children}
      </div>
    </details>
  )
}
