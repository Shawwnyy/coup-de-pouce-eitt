import { RULES, RULES_INTRO, SAFETY_TIPS } from '../content/rules'
import { Icon } from './ui'

export function RulesBody({ headingLevel = 2 }: { headingLevel?: 2 | 3 }) {
  const H = `h${headingLevel}` as 'h2' | 'h3'
  return (
    <div className="rules">
      <p className="lead">{RULES_INTRO}</p>
      {RULES.map((r) => (
        <section key={r.n} id={`regle-${r.n}`} className="card rule" aria-labelledby={`regle-${r.n}-titre`}>
          <H id={`regle-${r.n}-titre`} className="rule-title">
            <span className="rule-num" aria-hidden="true">{r.n}</span>
            <Icon name={r.icon} />
            <span>
              <span className="sr-only">Règle {r.n} — </span>
              {headingLevel === 2 ? `Règle ${r.n} — ` : ''}
              {r.title}
            </span>
          </H>
          {r.intro?.map((p) => <p key={p}>{p}</p>)}
          {r.itemsTitle && <p className="strong">{r.itemsTitle}</p>}
          {r.items && (
            <ul className="checklist">
              {r.items.map((i) => (
                <li key={i}>{i}</li>
              ))}
            </ul>
          )}
          {r.outro?.map((p) => <p key={p}>{p}</p>)}
        </section>
      ))}
      <section id="conseils" className="card rule" aria-labelledby="conseils-titre">
        <H id="conseils-titre" className="rule-title">
          <Icon name="shield" />
          <span>Conseils de sécurité</span>
        </H>
        <ul className="checklist">
          {SAFETY_TIPS.map((t) => (
            <li key={t}>{t}</li>
          ))}
        </ul>
      </section>
    </div>
  )
}
