import { useEffect, useRef, useState } from 'react'
import QrScanner from 'qr-scanner'

interface Props {
  onResult: (texte: string) => void
  pause?: boolean
  onTorchAvailable?: (dispo: boolean) => void
  torchRef?: React.MutableRefObject<(() => void) | null>
}

// Caméra arrière + détection QR. Ignore les relectures du même code pendant 2,5 s.
export function QrCamera({ onResult, pause, onTorchAvailable, torchRef }: Props) {
  const video = useRef<HTMLVideoElement>(null)
  const scanner = useRef<QrScanner | null>(null)
  const dernier = useRef<{ t: string; at: number }>({ t: '', at: 0 })
  const cb = useRef(onResult)
  cb.current = onResult
  const [erreur, setErreur] = useState('')

  useEffect(() => {
    if (!video.current) return
    const s = new QrScanner(video.current, (r) => {
      const now = Date.now()
      if (r.data === dernier.current.t && now - dernier.current.at < 2500) return
      dernier.current = { t: r.data, at: now }
      navigator.vibrate?.(60)
      cb.current(r.data)
    }, { preferredCamera: 'environment', highlightScanRegion: false, highlightCodeOutline: false, maxScansPerSecond: 8 })
    scanner.current = s
    s.start().then(async () => {
      const t = await s.hasFlash().catch(() => false)
      onTorchAvailable?.(t)
      if (torchRef) torchRef.current = () => { s.toggleFlash().catch(() => {}) }
    }).catch((e) => {
      setErreur(String(e).includes('NotAllowed') || String(e).toLowerCase().includes('permission')
        ? 'Accès à la caméra refusé. Autorise la caméra dans les réglages du navigateur.'
        : 'Caméra indisponible sur cet appareil.')
    })
    return () => { s.stop(); s.destroy(); scanner.current = null }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const s = scanner.current
    if (!s) return
    if (pause) s.pause().catch(() => {})
    else s.start().catch(() => {})
  }, [pause])

  return (
    <>
      <video ref={video} playsInline muted />
      {erreur && <div className="note err" style={{ position: 'absolute', left: 16, right: 16, top: 90, zIndex: 3 }}>{erreur}</div>}
    </>
  )
}
