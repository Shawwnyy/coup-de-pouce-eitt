// Fabrique supabase/setup_all.sql = les migrations dans l'ordre, en un seul fichier à coller dans l'éditeur SQL de Supabase.
import { readdirSync, readFileSync, writeFileSync } from 'node:fs'
const dir = 'supabase/migrations'
const files = readdirSync(dir).filter((f) => f.endsWith('.sql')).sort()
const header = `-- =====================================================================
-- Coup de Pouce by EITT — INSTALLATION COMPLÈTE EN UN SEUL FICHIER
-- Fichier généré (npm run sql:bundle) : ne le modifiez pas, modifiez supabase/migrations/*.sql.
-- À coller UNE SEULE FOIS dans Supabase > SQL Editor > New query > Run, sur un projet NEUF.
-- Contenu, dans l'ordre : ${files.join(', ')}
-- =====================================================================
`
const body = files.map((f) => `\n-- >>>>>>>>>> ${f} <<<<<<<<<<\n${readFileSync(`${dir}/${f}`, 'utf8')}`).join('\n')
writeFileSync('supabase/setup_all.sql', header + body)
console.log(`supabase/setup_all.sql créé (${files.length} migrations)`)
