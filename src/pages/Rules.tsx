import { RulesBody } from '../components/RulesBody'
import { Icon } from '../components/ui'
import { RULES, RULES_HISTORY } from '../content/rules'
import { RULES_UPDATED_LABEL, RULES_VERSION } from '../lib/config'
import { useDocumentTitle } from '../lib/hooks'
import { Link } from '../lib/router'

export default function RulesPage() {
  useDocumentTitle('Les règles de Coup de Pouce')
  return (
    <div className="page">
      <header className="page-head">
        <p className="eyebrow"><Icon name="book" size={16} /> Communauté</p>
        <h1>Les règles de Coup de Pouce</h1>
        <p className="muted">
          Dernière mise à jour : <time dateTime={RULES_VERSION}>{RULES_UPDATED_LABEL}</time> · version {RULES_VERSION}
        </p>
      </header>
      <div className="rules-layout">
        <nav className="card toc" aria-label="Sommaire des règles">
          <strong>Sommaire</strong>
          <ol>
            {RULES.map((r) => (
              <li key={r.n}><a href={`#regle-${r.n}`}>{r.title}</a></li>
            ))}
            <li><a href="#conseils">Conseils de sécurité</a></li>
            <li><a href="#historique">Historique des modifications</a></li>
          </ol>
        </nav>
        <div>
          <RulesBody />
          <section id="historique" className="card rule" aria-labelledby="historique-titre">
            <h2 id="historique-titre" className="rule-title"><Icon name="refresh" /> <span>Historique des modifications</span></h2>
            <ul className="history">
              {RULES_HISTORY.map((h) => (
                <li key={h.version}><strong>{h.date}</strong> — {h.change}</li>
              ))}
            </ul>
            <p className="hint">Lorsque les règles changent, les changements importants sont ajoutés ici et chaque membre doit les accepter à nouveau.</p>
          </section>
          <p className="row">
            <Link to="/" className="btn">Retour à l’accueil</Link>
            <Link to="/inscription" className="btn btn-primary">Créer un compte</Link>
          </p>
        </div>
      </div>
    </div>
  )
}
