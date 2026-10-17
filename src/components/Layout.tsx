import type { ReactNode } from 'react'
import { useAuth } from '../context/AuthContext'
import { useNotify } from '../context/NotifyContext'
import { EITT_URL } from '../lib/config'
import { LOCAL } from '../lib/mode'
import { ContactPopups } from '../local/Contacts'
import { OnlineBar, OnlinePrompt } from '../local/OnlineBar'
import { RedAlertBanner } from '../local/RedAlerts'
import { Link, NavLink, useNavigate } from '../lib/router'
import { isConfigured } from '../lib/supabase'
import { QuotePanel, QuoteRestore, useQuoteHidden } from './QuotePanel'
import { Avatar, Icon } from './ui'

const BASE = import.meta.env.BASE_URL || '/'
// Version fichier unique : les logos sont intégrés à la page (window.__CDP_ASSETS).
const EMBEDDED = (window as unknown as { __CDP_ASSETS?: { png?: string; mp4?: string } }).__CDP_ASSETS
export const LOGO_PNG = EMBEDDED?.png ?? `${BASE}eitt-logo.png`
export const LOGO_MP4 = EMBEDDED?.mp4 ?? `${BASE}eitt-logo.mp4`

function CountBadge({ n }: { n: number }) {
  if (n <= 0) return null
  return (
    <>
      <span className="count" aria-hidden="true">{n > 99 ? '99+' : n}</span>
      <span className="sr-only"> ({n} nouveau{n > 1 ? 'x' : ''})</span>
    </>
  )
}

export function Layout({ children }: { children: ReactNode }) {
  const { status, profile, signOut, isModerator } = useAuth()
  const { unreadMessages, newHelpRequests, prefs, toasts, dismissToast } = useNotify()
  const authed = status === 'authed' && profile
  const [quoteHidden] = useQuoteHidden()
  const navigate = useNavigate()
  const msgCount = prefs.inapp_indicator ? unreadMessages : 0
  const helpCount = prefs.inapp_indicator ? newHelpRequests : 0

  return (
    <div className={`shell${quoteHidden ? '' : ' has-quote'}`}>
      <a
        className="skip-link"
        href="#main"
        onClick={(e) => {
          e.preventDefault()
          document.getElementById('main')?.focus()
        }}
      >
        Aller au contenu principal
      </a>
      <header className="topbar">
        <Link to="/" className="brand" aria-label="Coup de Pouce by EITT — accueil">
          <span className="brand-name">Coup de Pouce</span>
          <span className="logo-chip">
            <img src={LOGO_PNG} alt="by EITT" height={26} />
          </span>
        </Link>
        <nav className="topnav" aria-label="Navigation principale">
          <NavLink to="/" end><Icon name="home" size={18} /> Accueil</NavLink>
          <NavLink to="/entraide"><Icon name="help" size={18} /> Entraide<CountBadge n={helpCount} /></NavLink>
          <NavLink to="/recherche"><Icon name="search" size={18} /> Recherche</NavLink>
          <NavLink to="/messages"><Icon name="chat" size={18} /> Messages<CountBadge n={msgCount} /></NavLink>
          {LOCAL && <NavLink to="/salon"><Icon name="globe" size={18} /> Discussion</NavLink>}
          <NavLink to="/regles"><Icon name="book" size={18} /> Règles</NavLink>
          <NavLink to="/parametres"><Icon name="settings" size={18} /> Paramètres</NavLink>
        </nav>
        <div className="topbar-actions">
          <Link to="/regles" className="btn btn-sm btn-ghost mobile-only" aria-label="Règles de la communauté">
            <Icon name="book" size={18} />
          </Link>
          {authed ? (
            <NavLink to="/profil" className="user-pill" aria-label={`Mon profil ${profile.public_id}`}>
              <Avatar profile={profile} size={30} />
              <span className="user-pill-id">{profile.public_id}</span>
            </NavLink>
          ) : isConfigured ? (
            <>
              {LOCAL ? (
                <Link to="/connexion" className="btn btn-sm btn-primary">Commencer</Link>
              ) : (
                <>
                  <Link to="/connexion" className="btn btn-sm">Se connecter</Link>
                  <Link to="/inscription" className="btn btn-sm btn-primary desktop-only">Créer un compte</Link>
                </>
              )}
            </>
          ) : null}
          {authed && isModerator && (
            <Link to="/moderation" className="icon-btn" aria-label="Modération" title="Modération">
              <Icon name="shield" />
            </Link>
          )}
          {authed && (
            <button type="button" className="icon-btn desktop-only" onClick={() => void signOut().then(() => LOCAL && navigate('/connexion'))} aria-label={LOCAL ? 'Changer de profil' : 'Se déconnecter'} title={LOCAL ? 'Changer de profil' : 'Se déconnecter'}>
              <Icon name="logout" />
            </button>
          )}
        </div>
      </header>

      {LOCAL && authed && <OnlineBar />}
      {LOCAL && authed && <OnlinePrompt />}
      {LOCAL && !authed && (
        <div className="local-banner" role="note">
          <Icon name="info" size={16} />
          <span>Version locale : tout est gardé dans ce navigateur. Un mode « en ligne » facultatif permet ensuite d’ajouter quelqu’un d’un autre appareil avec son User#. Pas de modération.</span>
        </div>
      )}
      {LOCAL && authed && <RedAlertBanner />}
      {LOCAL && authed && <ContactPopups />}
      <main id="main" tabIndex={-1}>{children}</main>

      <QuotePanel />

      <footer className="footer">
        <div className="footer-inner">
          <p>
            <strong>Coup de Pouce</strong> by EITT — Enseignement Informatique pour Toutes et Tous.
          </p>
          <nav aria-label="Pied de page" className="footer-links">
            {LOCAL && <Link to="/salon">Discussion générale</Link>}
            {LOCAL && <Link to="/demandes">Demandes d’ajout</Link>}
            {LOCAL && <Link to="/echanger">Autre appareil (code)</Link>}
            <Link to="/regles">Les règles de la communauté</Link>
            <Link to="/confidentialite">Confidentialité</Link>
            <Link to="/apparence">Apparence</Link>
            <QuoteRestore />
            <a href={EITT_URL} target="_blank" rel="noopener noreferrer">Site d’EITT <Icon name="external" size={14} /></a>
          </nav>
        </div>
      </footer>

      <nav className="bottomnav" aria-label="Navigation mobile">
        <NavLink to="/" end><Icon name="home" /><span>Accueil</span></NavLink>
        <NavLink to="/entraide"><Icon name="help" /><span>Entraide</span><CountBadge n={helpCount} /></NavLink>
        <NavLink to="/recherche"><Icon name="search" /><span>Recherche</span></NavLink>
        <NavLink to="/messages"><Icon name="chat" /><span>Messages</span><CountBadge n={msgCount} /></NavLink>
        {authed ? (
          <NavLink to="/profil"><Icon name="user" /><span>Profil</span></NavLink>
        ) : (
          <NavLink to="/connexion"><Icon name="user" /><span>{LOCAL ? 'Profil' : 'Connexion'}</span></NavLink>
        )}
      </nav>

      <div className="toast-region" role="status" aria-live="polite">
        {toasts.map((t) => (
          <div key={t.id} className="toast">
            <Icon name="bell" size={18} />
            <div>
              <strong>{t.title}</strong>
              <p>{t.body}</p>
            </div>
            <button type="button" className="icon-btn" onClick={() => dismissToast(t.id)} aria-label="Fermer la notification">
              <Icon name="x" size={16} />
            </button>
          </div>
        ))}
      </div>
    </div>
  )
}
