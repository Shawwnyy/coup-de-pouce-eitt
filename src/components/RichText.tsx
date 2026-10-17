import { useMemo, useState } from 'react'
import { splitText, type LinkInfo } from '../lib/links'
import { Icon } from './ui'

const REL = 'noopener noreferrer nofollow ugc'

export function LinkCard({ info }: { info: LinkInfo }) {
  const [showImg, setShowImg] = useState(false)
  const [imgError, setImgError] = useState(false)
  const icon = info.kind === 'image' ? 'image' : info.kind === 'page' ? 'link' : 'video'
  return (
    <div className="link-card">
      <div className="link-card-head">
        <Icon name={icon} />
        <div className="link-card-title">
          <strong>{info.host}</strong>
          {info.path && <span className="muted"> {info.path}</span>}
        </div>
      </div>
      {info.kind === 'video-platform' && <p className="hint">Vidéo hébergée par {info.platform}. Elle ne démarre qu’après ouverture du lien.</p>}
      {info.kind === 'video-file' && <p className="hint">Fichier vidéo hébergé ailleurs : il ne se lance pas dans la conversation.</p>}
      {info.warnings.length > 0 && (
        <div className="link-warn" role="note">
          <Icon name="alert" size={18} />
          <div>
            <strong>Signes à vérifier avant d’ouvrir ce lien</strong>
            <ul>
              {info.warnings.map((w) => (
                <li key={w}>{w}</li>
              ))}
            </ul>
          </div>
        </div>
      )}
      <div className="row">
        <a className="btn btn-sm" href={info.url} target="_blank" rel={REL}>
          Ouvrir le lien <Icon name="external" size={16} />
        </a>
        {info.kind === 'image' && !showImg && (
          <button type="button" className="btn btn-sm" onClick={() => setShowImg(true)} title={`L’image sera chargée depuis ${info.host}`}>
            <Icon name="eye" size={16} /> Afficher l’image
          </button>
        )}
      </div>
      {showImg && !imgError && (
        <img className="link-img" src={info.url} alt={`Image liée depuis ${info.host}`} referrerPolicy="no-referrer" loading="lazy" onError={() => setImgError(true)} />
      )}
      {imgError && <p className="field-error">Cette image n’a pas pu être chargée.</p>}
      <p className="hint">Site extérieur à Coup de Pouce : restez prudent et vérifiez l’adresse avant de saisir la moindre information.</p>
    </div>
  )
}

/** Texte brut + liens analysés. Aucun HTML n'est jamais interprété. */
export function RichText({ text, cards = true }: { text: string; cards?: boolean }) {
  const segs = useMemo(() => splitText(text), [text])
  const links = useMemo(() => {
    const seen = new Set<string>()
    return segs.flatMap((s) => (s.type === 'link' && !seen.has(s.info.url) && seen.add(s.info.url) ? [s.info] : []))
  }, [segs])
  if (!text.trim()) return null
  return (
    <>
      <p className="rich">
        {segs.map((s, i) =>
          s.type === 'text' ? (
            <span key={i}>{s.text}</span>
          ) : (
            <a key={i} className="inline-link" href={s.info.url} target="_blank" rel={REL}>
              {s.info.host}
              {s.info.path}
            </a>
          ),
        )}
      </p>
      {cards && links.map((l) => <LinkCard key={l.url} info={l} />)}
    </>
  )
}
