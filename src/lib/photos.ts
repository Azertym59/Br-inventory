import imageCompression from 'browser-image-compression'
import { getDownloadURL, ref, uploadBytes } from 'firebase/storage'
import { storage } from '../firebase'

// Compresse sur le téléphone (≈ 300 Ko max) puis envoie dans Firebase Storage
export async function envoyerPhotos(fichiers: File[], dossier: string): Promise<string[]> {
  const urls: string[] = []
  for (let i = 0; i < fichiers.length; i++) {
    const compressee = await imageCompression(fichiers[i], {
      maxSizeMB: 0.3,
      maxWidthOrHeight: 1600,
      useWebWorker: true,
      fileType: 'image/jpeg',
    })
    const chemin = `photos/${dossier}/${Date.now()}-${i}.jpg`
    const r = ref(storage, chemin)
    await uploadBytes(r, compressee, { contentType: 'image/jpeg' })
    urls.push(await getDownloadURL(r))
  }
  return urls
}
