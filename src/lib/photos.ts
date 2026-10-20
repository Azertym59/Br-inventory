import imageCompression from 'browser-image-compression'
import { api } from './api'

// Compresse sur le téléphone (≈ 300 Ko max) puis envoie au serveur (stockage sur le VPS)
export async function envoyerPhotos(fichiers: File[]): Promise<string[]> {
  const urls: string[] = []
  for (const f of fichiers) {
    const compressee = await imageCompression(f, { maxSizeMB: 0.3, maxWidthOrHeight: 1600, useWebWorker: true, fileType: 'image/jpeg' })
    const fd = new FormData()
    fd.append('photo', new File([compressee], 'photo.jpg', { type: 'image/jpeg' }))
    const r = await api<{ url: string }>('POST', '/photos', fd)
    urls.push(r.url)
  }
  return urls
}
