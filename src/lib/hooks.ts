import { useCallback, useEffect, useRef, useState } from 'react'
import { friendlyError } from './errors.ts'

export interface AsyncState<T> {
  data: T | null
  error: string | null
  loading: boolean
  reload: () => void
  setData: (v: T | null | ((prev: T | null) => T | null)) => void
}

/** Charge des données et ignore les réponses périmées (changement de page rapide). */
export function useAsync<T>(fn: () => Promise<T>, deps: readonly unknown[]): AsyncState<T> {
  const [data, setData] = useState<T | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [tick, setTick] = useState(0)
  const seq = useRef(0)
  const fnRef = useRef(fn)
  fnRef.current = fn

  useEffect(() => {
    const id = ++seq.current
    setLoading(true)
    setError(null)
    fnRef.current().then(
      (v) => {
        if (id !== seq.current) return
        setData(v)
        setLoading(false)
      },
      (e: unknown) => {
        if (id !== seq.current) return
        setError(friendlyError(e, 'Impossible de charger ces informations. Réessayez.'))
        setLoading(false)
      },
    )
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, tick])

  const reload = useCallback(() => setTick((t) => t + 1), [])
  return { data, error, loading, reload, setData }
}

export function useMediaQuery(query: string): boolean {
  const [match, setMatch] = useState(() => (typeof window !== 'undefined' && window.matchMedia ? window.matchMedia(query).matches : false))
  useEffect(() => {
    if (!window.matchMedia) return
    const m = window.matchMedia(query)
    const on = () => setMatch(m.matches)
    on()
    m.addEventListener('change', on)
    return () => m.removeEventListener('change', on)
  }, [query])
  return match
}

export function useDocumentTitle(title: string): void {
  useEffect(() => {
    document.title = title ? `${title} — Coup de Pouce by EITT` : 'Coup de Pouce by EITT — Entraide numérique'
  }, [title])
}

export function useCopy(): { copied: boolean; copy: (text: string) => Promise<boolean> } {
  const [copied, setCopied] = useState(false)
  const timer = useRef<number | undefined>(undefined)
  const copy = useCallback(async (text: string) => {
    try {
      await navigator.clipboard.writeText(text)
    } catch {
      // Repli pour les navigateurs sans l'API presse-papiers (ou sans HTTPS)
      const ta = document.createElement('textarea')
      ta.value = text
      ta.setAttribute('readonly', '')
      ta.style.position = 'fixed'
      ta.style.opacity = '0'
      document.body.appendChild(ta)
      ta.select()
      const ok = document.execCommand('copy')
      ta.remove()
      if (!ok) return false
    }
    setCopied(true)
    window.clearTimeout(timer.current)
    timer.current = window.setTimeout(() => setCopied(false), 1800)
    return true
  }, [])
  return { copied, copy }
}
