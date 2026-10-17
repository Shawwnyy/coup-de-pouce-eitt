// GitHub Pages ne gère pas les routes d'une application monopage : on duplique index.html en 404.html.
import { copyFileSync, existsSync } from 'node:fs'
if (existsSync('dist/index.html')) {
  copyFileSync('dist/index.html', 'dist/404.html')
  console.log('postbuild : dist/404.html créé (repli SPA pour GitHub Pages)')
}
