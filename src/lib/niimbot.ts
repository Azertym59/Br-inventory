// Impression directe sur Niimbot B1 en Bluetooth (Chrome Android / ordinateur).
// Librairie open source non officielle (NiimBlue). Ce module est chargé à l'ouverture
// de l'écran Étiquettes, pour que le clic « Imprimer » ouvre tout de suite la liste Bluetooth.
import { ImageEncoder, NiimbotBluetoothClient, PageColorType, type PrintDirection } from '@mmote/niimbluelib'

let client: NiimbotBluetoothClient | null = null

export async function connecterImprimante(): Promise<string> {
  if (client?.isConnected()) return client.getModelMetadata()?.model ?? 'Niimbot'
  client = new NiimbotBluetoothClient()
  const info = await client.connect() // doit être appelé directement depuis le clic
  return client.getModelMetadata()?.model ?? info.deviceName ?? 'Niimbot'
}

export function imprimanteConnectee(): boolean {
  return !!client?.isConnected()
}

export async function deconnecterImprimante() {
  await client?.disconnect()
  client = null
}

// Largeur utile de la tête d'impression : la B1 imprime 384 px (48 mm) au maximum.
// direction "top" : la largeur de l'étiquette est contrainte ; "left" : sa hauteur.
export function teteImpression(): { direction: PrintDirection; pixels: number } {
  const meta = client?.getModelMetadata()
  return { direction: meta?.printDirection ?? 'top', pixels: meta?.printheadPixels ?? 384 }
}

export async function imprimerCanvas(canvas: HTMLCanvasElement, quantite = 1): Promise<void> {
  if (!client?.isConnected()) await connecterImprimante()
  const c = client!
  const { direction } = teteImpression()
  const image = ImageEncoder.encodeCanvas(canvas, PageColorType.SingleColor, direction)
  const tache = c.getPrintTaskType() ?? 'B1'
  const job = c.protocol.newPrintTask(tache, { totalPages: quantite })
  c.stopHeartbeat()
  try {
    await job.printInit()
    await job.printPage(image, quantite)
    await job.waitForFinished()
  } finally {
    await job.printEnd().catch(() => false)
    c.startHeartbeat()
  }
}
