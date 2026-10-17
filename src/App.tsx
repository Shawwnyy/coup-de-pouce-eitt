import { ErrorBoundary } from './components/ErrorBoundary'
import type { ReactNode } from 'react'
import { RequireAuth } from './components/Guards'
import { Layout } from './components/Layout'
import { EmptyState } from './components/ui'
import { AuthProvider } from './context/AuthContext'
import { NotifyProvider } from './context/NotifyContext'
import { ThemeProvider } from './context/ThemeContext'
import { useDocumentTitle } from './lib/hooks'
import { Link, Router, Routes, type RouteDef } from './lib/router'
import { LOCAL } from './lib/mode'
import { ContactRequestsPage } from './local/Contacts'
import { ExchangePage } from './local/Exchange'
import { ProfilePicker } from './local/ProfilePicker'
import { RoomPage } from './local/Room'
import { ForgotPasswordPage, LoginPage, ResetPasswordPage, SignupPage } from './pages/Auth'
import { HelpDetailPage, HelpListPage, HelpNewPage } from './pages/Help'
import Home from './pages/Home'
import MessagesPage from './pages/Messages'
import ModerationPage from './pages/Moderation'
import PrivacyPage from './pages/Privacy'
import ProfilePage from './pages/Profile'
import RulesPage from './pages/Rules'
import SearchPage from './pages/Search'
import SettingsPage, { AppearancePage } from './pages/Settings'

function NotFound() {
  useDocumentTitle('Page introuvable')
  return (
    <div className="page narrow">
      <EmptyState icon="search" title="Page introuvable" action={<Link to="/" className="btn btn-primary">Retour à l’accueil</Link>}>
        Cette page n’existe pas ou a été déplacée.
      </EmptyState>
    </div>
  )
}

const guarded = (el: ReactNode) => <RequireAuth>{el}</RequireAuth>

const routes: RouteDef[] = [
  { path: '/', element: () => <Home /> },
  { path: '/connexion', element: () => (LOCAL ? <ProfilePicker /> : <LoginPage />) },
  { path: '/inscription', element: () => (LOCAL ? <ProfilePicker /> : <SignupPage />) },
  { path: '/mot-de-passe-oublie', element: () => <ForgotPasswordPage /> },
  { path: '/nouveau-mot-de-passe', element: () => <ResetPasswordPage /> },
  { path: '/demandes', element: () => guarded(<ContactRequestsPage />) },
  { path: '/echanger', element: () => guarded(<ExchangePage />) },
  { path: '/salon', element: () => (LOCAL ? guarded(<RoomPage />) : <NotFound />) },
  { path: '/regles', element: () => <RulesPage /> },
  { path: '/confidentialite', element: () => <PrivacyPage /> },
  { path: '/apparence', element: () => <AppearancePage /> },
  { path: '/recherche', element: () => guarded(<SearchPage />) },
  { path: '/messages/:id?', element: () => guarded(<MessagesPage />) },
  { path: '/entraide', element: () => guarded(<HelpListPage />) },
  { path: '/entraide/nouvelle', element: () => guarded(<HelpNewPage />) },
  { path: '/entraide/:id', element: () => guarded(<HelpDetailPage />) },
  { path: '/moderation', element: () => guarded(<ModerationPage />) },
  { path: '/profil/:id?', element: () => guarded(<ProfilePage />) },
  { path: '/parametres/:section?', element: () => guarded(<SettingsPage />) },
  { path: '*', element: () => <NotFound /> },
]

export default function App() {
  return (
    <ErrorBoundary>
      <Router>
        <AuthProvider>
          <ThemeProvider>
            <NotifyProvider>
              <Layout>
                <ErrorBoundary>
                  <Routes routes={routes} />
                </ErrorBoundary>
              </Layout>
            </NotifyProvider>
          </ThemeProvider>
        </AuthProvider>
      </Router>
    </ErrorBoundary>
  )
}
