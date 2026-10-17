import { Alert, Icon } from '../components/ui'
import { PRIVACY_SECTIONS, TODO } from '../content/privacy'
import { LEGAL_COMPLETED } from '../lib/config'
import { useDocumentTitle } from '../lib/hooks'
import { Link } from '../lib/router'

/** Met en évidence les éléments à compléter par l'association. */
function Text({ children }: { children: string }) {
  const parts = children.split(TODO)
  return (
    <>
      {parts.map((p, i) => (
        <span key={i}>
          {p}
          {i < parts.length - 1 && <mark className="todo">{TODO}</mark>}
        </span>
      ))}
    </>
  )
}

export default function PrivacyPage() {
  useDocumentTitle('Confidentialité')
  return (
    <div className="page narrow">
      <header className="page-head">
        <p className="eyebrow"><Icon name="lock" size={16} /> Vos données</p>
        <h1>Confidentialité</h1>
        <p className="muted">Ce que Coup de Pouce enregistre, qui peut le voir, et comment vous gardez la main.</p>
      </header>
      {!LEGAL_COMPLETED && (
        <Alert kind="warn" title="Texte à finaliser par l’association">
          Cette page décrit le fonctionnement technique actuel de l’application. Les éléments surlignés (responsable, hébergeur, durées, contact, mineurs) doivent être complétés par l’association avant l’ouverture au public. Ce texte n’est pas un avis juridique.
        </Alert>
      )}
      {PRIVACY_SECTIONS.map((s) => (
        <section key={s.id} id={s.id} className="card stack" aria-labelledby={`${s.id}-t`}>
          <h2 id={`${s.id}-t`}>{s.title}</h2>
          {s.paragraphs?.map((p) => <p key={p}><Text>{p}</Text></p>)}
          {s.items && (
            <ul className="checklist">
              {s.items.map((i) => <li key={i}><Text>{i}</Text></li>)}
            </ul>
          )}
        </section>
      ))}
      <p><Link to="/regles">Lire les règles de la communauté</Link></p>
    </div>
  )
}
