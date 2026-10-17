/**
 * Petit routeur maison (History API) : évite une dépendance de plus et reste simple à relire.
 * Fonctionne avec un sous-dossier d'hébergement grâce à import.meta.env.BASE_URL.
 */
import {
  createContext, useCallback, useContext, useEffect, useMemo, useRef, useState,
  type AnchorHTMLAttributes, type ReactNode,
} from 'react'
import { matchRoute } from './match.ts'

const BASE = (import.meta.env.BASE_URL || '/').replace(/\/$/, '')
/** Ouvert par double-clic (file://) ou en version locale : l'History API est inutilisable, on route avec « #/chemin ». */
const HASH = import.meta.env.VITE_HASH_ROUTER === '1' || window.location.protocol === 'file:'
export const hrefTo = (path: string): string => (HASH ? `#${path}` : BASE + path)

interface Loc {
  path: string
  search: string
}

function readLocation(): Loc {
  if (HASH) {
    const raw = window.location.hash.replace(/^#/, '') || '/'
    const q = raw.indexOf('?')
    const p = (q < 0 ? raw : raw.slice(0, q)) || '/'
    return { path: (p.startsWith('/') ? p : `/${p}`).replace(/\/+$/, '') || '/', search: q < 0 ? '' : raw.slice(q) }
  }
  let path = window.location.pathname
  if (BASE && path.startsWith(BASE)) path = path.slice(BASE.length)
  return { path: path.replace(/\/+$/, '') || '/', search: window.location.search }
}

interface RouterValue {
  loc: Loc
  navigate: (to: string, opts?: { replace?: boolean }) => void
}

const RouterCtx = createContext<RouterValue | null>(null)
const ParamsCtx = createContext<Record<string, string>>({})

export function Router({ children }: { children: ReactNode }) {
  const [loc, setLoc] = useState<Loc>(readLocation)
  useEffect(() => {
    const onPop = () => setLoc(readLocation())
    window.addEventListener('popstate', onPop)
    window.addEventListener('hashchange', onPop)
    return () => {
      window.removeEventListener('popstate', onPop)
      window.removeEventListener('hashchange', onPop)
    }
  }, [])
  const navigate = useCallback((to: string, opts?: { replace?: boolean }) => {
    const target = to.startsWith('/') ? to : `/${to}`
    if (HASH) {
      if (opts?.replace) window.location.replace(`${window.location.href.split('#')[0]}#${target}`)
      else window.location.hash = target
      setLoc(readLocation())
      return
    }
    const url = BASE + target
    if (opts?.replace) window.history.replaceState(null, '', url)
    else window.history.pushState(null, '', url)
    setLoc(readLocation())
  }, [])
  const value = useMemo(() => ({ loc, navigate }), [loc, navigate])
  return <RouterCtx.Provider value={value}>{children}</RouterCtx.Provider>
}

function useRouter(): RouterValue {
  const v = useContext(RouterCtx)
  if (!v) throw new Error('Router manquant')
  return v
}

export const useNavigate = () => useRouter().navigate
export const useLocation = () => useRouter().loc
export const useParams = () => useContext(ParamsCtx)

export function useSearchParams(): [URLSearchParams, (next: Record<string, string | null>, opts?: { replace?: boolean }) => void] {
  const { loc, navigate } = useRouter()
  const params = useMemo(() => new URLSearchParams(loc.search), [loc.search])
  const set = useCallback(
    (next: Record<string, string | null>, opts?: { replace?: boolean }) => {
      const p = new URLSearchParams(readLocation().search)
      for (const [k, v] of Object.entries(next)) {
        if (v === null || v === '') p.delete(k)
        else p.set(k, v)
      }
      const s = p.toString()
      navigate(readLocation().path + (s ? `?${s}` : ''), opts)
    },
    [navigate],
  )
  return [params, set]
}

type LinkProps = { to: string } & Omit<AnchorHTMLAttributes<HTMLAnchorElement>, 'href'>

export function Link({ to, onClick, ...rest }: LinkProps) {
  const { navigate } = useRouter()
  return (
    <a
      {...rest}
      href={hrefTo(to)}
      onClick={(e) => {
        onClick?.(e)
        if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || rest.target === '_blank') return
        e.preventDefault()
        navigate(to)
      }}
    />
  )
}

export function NavLink({ to, end, className, ...rest }: LinkProps & { end?: boolean }) {
  const { loc } = useRouter()
  const target = to.split('?')[0]
  const active = end ? loc.path === target : loc.path === target || loc.path.startsWith(target + '/')
  return <Link to={to} {...rest} className={[className, active ? 'active' : ''].filter(Boolean).join(' ')} aria-current={active ? 'page' : undefined} />
}

export function Navigate({ to, replace = true }: { to: string; replace?: boolean }) {
  const navigate = useNavigate()
  useEffect(() => navigate(to, { replace }), [navigate, to, replace])
  return null
}

export interface RouteDef {
  path: string
  element: (params: Record<string, string>) => ReactNode
}

export function Routes({ routes }: { routes: RouteDef[] }) {
  const { loc } = useRouter()
  const first = useRef(true)
  useEffect(() => {
    // Nouvelle page : retour en haut et focus sur le contenu (lecteurs d'écran, clavier)
    if (first.current) {
      first.current = false
      return
    }
    window.scrollTo(0, 0)
    document.getElementById('main')?.focus({ preventScroll: true })
  }, [loc.path])
  for (const r of routes) {
    const params = matchRoute(r.path, loc.path)
    if (params) return <ParamsCtx.Provider value={params}>{r.element(params)}</ParamsCtx.Provider>
  }
  return null
}
