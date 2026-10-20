// Impression directe sur Niimbot B1 en Bluetooth (Chrome Android / ordinateur).
// Librairie open source non officielle (NiimBlue) : chargée seulement quand on imprime.
import type { NiimbotBluetoothClient as Client } from '@mmote/niimbluelib'

let client: Client | null = null

export async function connecterImprimante(): Promise<string> {
  const lib = await import('@mmote/niimbluelib')
  if (client?.isConnected()) return client.getModelMetadata()?.model ?? 'Niimbot'
  client = new lib.NiimbotBluetoothClient()
  const info = await client.connect()
  return client.getModelMetadata()?.model ?? info.deviceName ?? 'Niimbot'
}

export function imprimanteConnectee(): boolean {
  return !!client?.isConnected()
}

export async function deconnecterImprimante() {
  await client?.disconnect()
  client = null
}

export async function imprimerCanvas(canvas: HTMLCanvasElement, quantite = 1): Promise<void> {
  const lib = await import('@mmote/niimbluelib')
  if (!client?.isConnected()) await connecterImprimante()
  const c = client!
  const meta = c.getModelMetadata()
  const direction = meta?.printDirection ?? 'left'
  const image = lib.ImageEncoder.encodeCanvas(canvas, lib.PageColorType.SingleColor, direction)
  const tache = c.getPrintTaskType() ?? 'B1'
  const job = c.protocol.newPrintTask(tache, { totalPages: quantite })
  try {
    await job.printInit()
    await job.printPage(image, quantite)
    await job.waitForFinished()
  } finally {
    await c.protocol.printEnd()
  }
}
