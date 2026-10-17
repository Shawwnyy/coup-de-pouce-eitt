/** Correspondance de routes simples : « /messages/:id », « /parametres/:section? », « * ». */
export function matchRoute(pattern: string, path: string): Record<string, string> | null {
  if (pattern === '*') return {}
  const pp = pattern.split('/').filter(Boolean)
  const ap = path.split('/').filter(Boolean)
  const params: Record<string, string> = {}
  for (let i = 0; i < pp.length; i++) {
    const seg = pp[i]
    if (seg.startsWith(':')) {
      const optional = seg.endsWith('?')
      const name = seg.slice(1, optional ? -1 : undefined)
      if (ap[i] === undefined) {
        if (optional && i === pp.length - 1) return params
        return null
      }
      try {
        params[name] = decodeURIComponent(ap[i])
      } catch {
        return null
      }
    } else if (seg !== ap[i]) {
      return null
    }
  }
  return ap.length === pp.length ? params : null
}
