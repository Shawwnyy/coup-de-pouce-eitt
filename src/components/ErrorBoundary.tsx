import { Component, type ReactNode } from 'react'
import { hrefTo } from '../lib/router'

export class ErrorBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false }
  static getDerivedStateFromError() {
    return { failed: true }
  }
  componentDidCatch(error: unknown) {
    console.error('Erreur d’affichage', error)
  }
  render() {
    if (!this.state.failed) return this.props.children
    return (
      <div className="page narrow">
        <div className="card stack" role="alert">
          <h1>Oups, quelque chose s’est mal passé</h1>
          <p>Cette page n’a pas pu s’afficher. Vos données ne sont pas perdues.</p>
          <div className="row">
            <button type="button" className="btn btn-primary" onClick={() => window.location.reload()}>Recharger la page</button>
            <a className="btn" href={hrefTo("/")}>Retour à l’accueil</a>
          </div>
        </div>
      </div>
    )
  }
}
