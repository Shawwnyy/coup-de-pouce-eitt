import { useEffect, useState } from 'react'
import * as api from '../lib/api'
import { formatBytes } from '../lib/format'
import type { Attachment } from '../types'
import { Lightbox } from './Dialogs'
import { Icon } from './ui'

function useSignedUrl(bucket: 'chat-media' | 'help-images', path: string) {
  const [url, setUrl] = useState<string | null>(null)
  const [failed, setFailed] = useState(false)
  useEffect(() => {
    let alive = true
    setUrl(null)
    setFailed(false)
    api.signedUrl(bucket, path).then(
      (u) => alive && setUrl(u),
      () => alive && setFailed(true),
    )
    return () => {
      alive = false
    }
  }, [bucket, path])
  return { url, failed, setFailed }
}

export function SignedImage({ bucket, path, alt, className }: { bucket: 'chat-media' | 'help-images'; path: string; alt: string; className?: string }) {
  const { url, failed, setFailed } = useSignedUrl(bucket, path)
  const [zoom, setZoom] = useState(false)
  if (failed) return <p className="media-error">Image indisponible.</p>
  if (!url) return <div className="media-skeleton" aria-label="Chargement de l’image" />
  return (
    <>
      <button type="button" className="media-btn" onClick={() => setZoom(true)} aria-label={`Agrandir : ${alt}`}>
        <img className={className ?? 'media-img'} src={url} alt={alt} loading="lazy" onError={() => setFailed(true)} />
      </button>
      {zoom && <Lightbox src={url} alt={alt} onClose={() => setZoom(false)} />}
    </>
  )
}

export function MediaAttachment({ att }: { att: Attachment }) {
  const isVideo = att.mime_type.startsWith('video/')
  const { url, failed, setFailed } = useSignedUrl('chat-media', att.storage_path)
  if (!isVideo) {
    return (
      <div className="media">
        <SignedImage bucket="chat-media" path={att.storage_path} alt={`${att.mime_type === 'image/gif' ? 'GIF' : 'Image'} joint : ${att.file_name}`} />
      </div>
    )
  }
  if (failed) return <p className="media-error">Vidéo indisponible.</p>
  if (!url) return <div className="media-skeleton" aria-label="Chargement de la vidéo" />
  return (
    <div className="media">
      {/* Pas de lecture automatique : l'utilisateur lance, met en pause et règle le son lui-même. */}
      <video className="media-video" src={url} controls preload="metadata" playsInline onError={() => setFailed(true)}>
        Votre navigateur ne sait pas lire cette vidéo.
      </video>
      <p className="hint">
        <Icon name="video" size={14} /> {att.file_name} · {formatBytes(att.file_size)}
      </p>
    </div>
  )
}
