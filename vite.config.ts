import { defineConfig, loadEnv, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'

/**
 * Content-Security-Policy injectée uniquement au build (en dev, Vite a besoin de scripts en ligne
 * pour le rechargement à chaud). Elle n'autorise que l'application elle-même et votre projet Supabase.
 * Hébergement avec en-têtes HTTP (Netlify, Vercel, Cloudflare) : voir public/_headers et vercel.json.
 */
function contentSecurityPolicy(supabaseUrl: string): Plugin {
  return {
    name: 'cdp-content-security-policy',
    apply: 'build',
    transformIndexHtml(html) {
      let http = 'https://*.supabase.co'
      let ws = 'wss://*.supabase.co'
      try {
        const u = new URL(supabaseUrl)
        http = u.origin
        ws = `wss://${u.host}`
      } catch {
        /* URL absente : on garde le domaine Supabase générique */
      }
      const policy = [
        "default-src 'self'",
        "script-src 'self'",
        "style-src 'self' 'unsafe-inline'",
        // https: = images/GIF externes affichées seulement après un clic explicite de l'utilisateur
        `img-src 'self' data: blob: https:`,
        `media-src 'self' blob: ${http}`,
        `connect-src 'self' ${http} ${ws}`,
        "font-src 'self'",
        "object-src 'none'",
        "base-uri 'self'",
        "form-action 'self'",
      ].join('; ')
      return html.replace('<!--CSP-->', `<meta http-equiv="Content-Security-Policy" content="${policy}" />`)
    },
  }
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  return {
    // Sous-dossier d'hébergement (ex. GitHub Pages : /nom-du-depot/). Voir .env.example
    base: env.VITE_BASE || '/',
    plugins: [react(), contentSecurityPolicy(env.VITE_SUPABASE_URL || '')],
    build: { sourcemap: false, target: 'es2022' },
  }
})
