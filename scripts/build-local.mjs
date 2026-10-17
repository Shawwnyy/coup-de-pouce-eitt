/**
 * Fabrique « Coup-de-Pouce.html » : UN SEUL fichier (JavaScript, styles et logos inclus) qui s'ouvre par double-clic,
 * sans serveur, sans installation. Version « sans compte » : les données restent dans le navigateur.
 *
 *   node scripts/build-local.mjs
 *
 * Nécessite esbuild (npm install suffit : il est installé avec Vite). Variable ESBUILD_PATH / EXTRA_NODE_MODULES facultatives.
 */
import { readFileSync, writeFileSync, existsSync, copyFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { createRequire } from 'node:module'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const require = createRequire(import.meta.url)
const esbuild = await import(pathToFileURL(require.resolve(process.env.ESBUILD_PATH || 'esbuild', { paths: [root, ...(process.env.EXTRA_NODE_MODULES ? [process.env.EXTRA_NODE_MODULES] : [])] })).href).then((m) => m.default ?? m)

const swap = {
  'src/lib/api': 'src/local/localApi.ts',
  'src/lib/supabase': 'src/local/supabaseStub.ts',
}
const plugin = {
  name: 'mode-local',
  setup(build) {
    build.onResolve({ filter: /(^|\/)(api|supabase)(\.ts)?$/ }, (args) => {
      if (!args.path.startsWith('.')) return null
      const abs = resolve(args.resolveDir, args.path).replace(/\\/g, '/').replace(/\.ts$/, '')
      const key = Object.keys(swap).find((k) => abs.endsWith('/' + k))
      return key ? { path: resolve(root, swap[key]) } : null
    })
  },
}

const result = await esbuild.build({
  entryPoints: [resolve(root, 'src/main.tsx')],
  outdir: resolve(root, '.build-local'),
  bundle: true,
  write: false,
  format: 'iife',
  target: 'es2020',
  minify: true,
  jsx: 'automatic',
  legalComments: 'none',
  nodePaths: process.env.EXTRA_NODE_MODULES ? [process.env.EXTRA_NODE_MODULES] : [],
  define: {
    'import.meta.env': '{"BASE_URL":"./","VITE_LOCAL":"1","VITE_HASH_ROUTER":"1","DEV":false,"PROD":true}',
    'process.env.NODE_ENV': '"production"',
  },
  plugins: [plugin],
  logLevel: 'warning',
})

const js = result.outputFiles.find((f) => f.path.endsWith('.js')).text.replace(/<\/script/gi, '<\\/script')
const css = result.outputFiles.find((f) => f.path.endsWith('.css')).text.replace(/<\/style/gi, '<\\/style')
const b64 = (p) => readFileSync(resolve(root, p)).toString('base64')
const assets = { png: `data:image/png;base64,${b64('public/eitt-logo.png')}`, mp4: `data:video/mp4;base64,${b64('public/eitt-logo.mp4')}` }
const favicon = `data:image/svg+xml;base64,${b64('public/favicon.svg')}`
const themeInit = readFileSync(resolve(root, 'public/theme-init.js'), 'utf8')

const html = `<!doctype html>
<html lang="fr" data-theme="eitt">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<meta name="description" content="Coup de Pouce by EITT — l'entraide numérique accessible à toutes et à tous." />
<meta name="theme-color" content="#05080f" />
<link rel="icon" type="image/svg+xml" href="${favicon}" />
<title>Coup de Pouce by EITT — Entraide numérique</title>
<style>${css}</style>
<script>${themeInit}</script>
<script>window.__CDP_ASSETS=${JSON.stringify(assets)}</script>
</head>
<body>
<div id="root"><p id="boot" style="font:16px system-ui,sans-serif;color:#cfe6ff;background:#05080f;margin:0;padding:24px">Chargement de Coup de Pouce…</p></div>
<noscript>Coup de Pouce nécessite JavaScript pour fonctionner.</noscript>
<script>
window.addEventListener('error',function(e){var b=document.getElementById('boot');if(b)b.textContent='Erreur de chargement : '+(e&&e.message?e.message:'inconnue')});
</script>
<script>${js}</script>
</body>
</html>
`
const out = resolve(root, 'Coup-de-Pouce.html')
writeFileSync(out, html)
// Copie dans public/ : le déploiement GitHub Pages (workflow) publie le dossier dist, qui contient tout public/.
// Sans cette copie, Coup-de-Pouce.html ne serait plus servi après un déploiement par le workflow.
if (existsSync(resolve(root, 'public'))) copyFileSync(out, resolve(root, 'public', 'Coup-de-Pouce.html'))
console.log('OK', out, Math.round(html.length / 1024), 'Ko', existsSync(out) ? '' : '(?)')
