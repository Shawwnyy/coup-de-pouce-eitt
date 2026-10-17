import { useState } from 'react'
import { LOGO_MP4, LOGO_PNG } from '../components/Layout'
import { QuoteCard } from '../components/QuoteCard'
import { Icon } from '../components/ui'
import { useAuth } from '../context/AuthContext'
import { useNotify } from '../context/NotifyContext'
import { CATEGORIES } from '../lib/config'
import { displayName } from '../lib/format'
import { useDocumentTitle, useMediaQuery } from '../lib/hooks'
import { LOCAL } from '../lib/mode'
import { Link, useNavigate } from '../lib/router'

export default function Home() {
  useDocumentTitle('')
  const { status, profile } = useAuth()
  const { unreadMessages, prefs } = useNotify()
  const navigate = useNavigate()
  const reduced = useMediaQuery('(prefers-reduced-motion: reduce)')
  const [q, setQ] = useState('')
  const [logoPlaying, setLogoPlaying] = useState(false)
  const authed = status === 'authed' && profile

  return (
    <div className="page">
      <section className="hero" aria-labelledby="hero-title">
        <div className="hero-text">
          <p className="eyebrow">Entraide numérique pour toutes et tous</p>
          <h1 id="hero-title">
            Coup de Pouce <span className="by">by EITT</span>
          </h1>
          <p className="welcome">
            {authed ? `Bonjour ${displayName(profile)}, ravi de vous revoir.` : 'Bienvenue sur Coup de Pouce !'}
          </p>
          <p className="lead">Un problème numérique ? Quelqu’un peut vous donner un coup de pouce.</p>
          <p className="muted">L’informatique devient plus simple quand on s’entraide.</p>
          <div className="row">
            <Link to="/entraide/nouvelle" className="btn btn-primary btn-lg">
              <Icon name="help" /> Trouver de l’aide
            </Link>
            <Link to="/entraide" className="btn btn-lg">
              <Icon name="heart" /> Proposer mon aide
            </Link>
          </div>
        </div>
        {/* L'image fixe est toujours là (cadrée en entier) ; la vidéo carrée de 368 px se superpose seulement quand elle joue vraiment. */}
        <div className="hero-logo" aria-hidden="true">
          <img src={LOGO_PNG} alt="" />
          {!reduced && (
            <video
              src={LOGO_MP4}
              className={logoPlaying ? 'is-playing' : undefined}
              autoPlay muted loop playsInline tabIndex={-1}
              onPlaying={() => setLogoPlaying(true)}
              onError={() => setLogoPlaying(false)}
            />
          )}
        </div>
      </section>

      <form
        className="searchbar"
        role="search"
        onSubmit={(e) => {
          e.preventDefault()
          navigate(`/recherche${q.trim() ? `?q=${encodeURIComponent(q.trim())}` : ''}`)
        }}
      >
        <label htmlFor="home-search" className="sr-only">Rechercher un utilisateur par son identifiant</label>
        <Icon name="search" />
        <input id="home-search" className="input" type="search" autoComplete="off" placeholder={LOCAL ? 'Nom ou identifiant, par exemple Léo.G ou User#4827' : 'Rechercher un utilisateur, par exemple User#0001'} value={q} onChange={(e) => setQ(e.target.value)} />
        <button type="submit" className="btn btn-primary">Rechercher</button>
      </form>

      <section aria-labelledby="acces-titre" className="section">
        <h2 id="acces-titre">Accès rapide</h2>
        <div className="grid tiles">
          <Link to="/recherche" className="tile">
            <Icon name="search" size={26} />
            <strong>Recherche d’utilisateurs</strong>
            <span className="muted">{LOCAL ? 'Retrouvez quelqu’un par son nom ou son identifiant.' : 'Retrouvez quelqu’un grâce à son identifiant public.'}</span>
          </Link>
          <Link to="/messages" className="tile">
            <Icon name="chat" size={26} />
            <strong>
              Messagerie
              {prefs.inapp_indicator && unreadMessages > 0 && <span className="count inline">{unreadMessages}</span>}
            </strong>
            <span className="muted">Vos conversations privées, avec images et liens.</span>
          </Link>
          {LOCAL && (
            <Link to="/salon" className="tile">
              <Icon name="globe" size={26} />
              <strong>Salon général</strong>
              <span className="muted">Discuter avec tout le monde. Public et sans modération : à utiliser avec prudence.</span>
            </Link>
          )}
          <Link to="/entraide" className="tile">
            <Icon name="help" size={26} />
            <strong>Demandes d’aide</strong>
            <span className="muted">Posez une question ou aidez quelqu’un.</span>
          </Link>
          <Link to="/profil" className="tile">
            <Icon name="user" size={26} />
            <strong>Mon profil</strong>
            <span className="muted">Votre identifiant, votre présentation, votre photo.</span>
          </Link>
          <Link to="/parametres" className="tile">
            <Icon name="settings" size={26} />
            <strong>Paramètres</strong>
            <span className="muted">Apparence, notifications, confidentialité.</span>
          </Link>
          <Link to="/regles" className="tile tile-rules">
            <Icon name="book" size={26} />
            <strong>Les règles de la communauté</strong>
            <span className="muted">Un espace respectueux pour apprendre et s’entraider.</span>
          </Link>
        </div>
      </section>

      <section aria-labelledby="cat-titre" className="section">
        <h2 id="cat-titre">Catégories d’entraide</h2>
        <ul className="chips">
          {CATEGORIES.map((c) => (
            <li key={c.id}>
              <Link to={`/entraide?categorie=${c.id}`} className="chip">
                <Icon name={c.icon} size={18} /> {c.label}
              </Link>
            </li>
          ))}
        </ul>
      </section>

      <section className="section two-col">
        <QuoteCard />
        <aside className="card rules-reminder" aria-labelledby="rappel-titre">
          <h2 id="rappel-titre">
            <Icon name="shield" /> Un espace respectueux
          </h2>
          <ul className="checklist">
            <li>Respect de chacun : ni insultes, ni harcèlement.</li>
            <li>Ne partagez jamais un mot de passe ou un code de connexion.</li>
            <li>Vérifiez les liens avant de les ouvrir.</li>
            <li>Signalez les comportements suspects.</li>
          </ul>
          <Link to="/regles" className="btn btn-primary">
            <Icon name="book" size={18} /> Lire les règles complètes
          </Link>
        </aside>
      </section>
    </div>
  )
}
