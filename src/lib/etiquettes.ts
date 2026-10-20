import QRCode from 'qrcode'
import writeXlsxFile from 'write-excel-file/browser'
import type { Materiel } from '../types'
import { urlMateriel } from './actions'

export interface FormatEtiquette {
  id: string
  label: string
  largeurMm: number
  hauteurMm: number
}

export const FORMATS: FormatEtiquette[] = [
  { id: '40x30', label: '40 × 30', largeurMm: 40, hauteurMm: 30 },
  { id: '50x30', label: '50 × 30', largeurMm: 50, hauteurMm: 30 },
  { id: '50x50', label: '50 × 50', largeurMm: 50, hauteurMm: 50 },
]

export function formatParDefaut(): FormatEtiquette {
  let id = '50x30'
  try { id = localStorage.getItem('formatEtiquette') || id } catch { /* rien */ }
  return FORMATS.find((f) => f.id === id) ?? FORMATS[1]
}
export function memoriserFormat(f: FormatEtiquette) {
  try { localStorage.setItem('formatEtiquette', f.id) } catch { /* rien */ }
}

const PX_PAR_MM = 8 // 203 dpi, la résolution de la Niimbot B1

function ajusterTexte(ctx: CanvasRenderingContext2D, texte: string, maxW: number, taille: number, poids: string, police: string): number {
  let t = taille
  ctx.font = `${poids} ${t}px ${police}`
  while (ctx.measureText(texte).width > maxW && t > 10) {
    t -= 1
    ctx.font = `${poids} ${t}px ${police}`
  }
  return t
}

function couper(ctx: CanvasRenderingContext2D, texte: string, maxW: number, maxLignes: number): string[] {
  const mots = texte.split(/\s+/)
  const lignes: string[] = []
  let cur = ''
  for (const mot of mots) {
    const essai = cur ? `${cur} ${mot}` : mot
    if (ctx.measureText(essai).width <= maxW) cur = essai
    else {
      if (cur) lignes.push(cur)
      cur = mot
      if (lignes.length === maxLignes) break
    }
  }
  if (cur && lignes.length < maxLignes) lignes.push(cur)
  const res = lignes.slice(0, maxLignes)
  if (res.join(' ').split(/\s+/).length < mots.length && res.length) {
    let der = res[res.length - 1]
    while (der && ctx.measureText(der + '…').width > maxW) der = der.slice(0, -1)
    res[res.length - 1] = der + '…'
  }
  return res
}

// Dessine l'étiquette (QR + référence + nom) en noir et blanc, à la taille réelle d'impression
// maxW / maxH : limite de la tête d'impression (la B1 imprime 384 px = 48 mm de large)
export async function dessinerEtiquette(
  m: Pick<Materiel, 'ref' | 'nom'>, f: FormatEtiquette, sousTitre = '', maxW = Infinity, maxH = Infinity,
): Promise<HTMLCanvasElement> {
  const W = Math.min(f.largeurMm * PX_PAR_MM, maxW)
  const H = Math.min(f.hauteurMm * PX_PAR_MM, maxH)
  const c = document.createElement('canvas')
  c.width = W
  c.height = H
  const ctx = c.getContext('2d')!
  ctx.fillStyle = '#fff'
  ctx.fillRect(0, 0, W, H)
  ctx.fillStyle = '#000'
  ctx.textBaseline = 'top'

  const marge = 2 * PX_PAR_MM
  const carre = Math.abs(f.hauteurMm - f.largeurMm) < 6
  const qrTaille = carre ? Math.round(H * 0.62) : H - marge * 2
  const qr = document.createElement('canvas')
  await QRCode.toCanvas(qr, urlMateriel(m.ref), { margin: 0, width: qrTaille, errorCorrectionLevel: 'M', color: { dark: '#000', light: '#fff' } })
  const mono = '"JetBrains Mono", ui-monospace, monospace'
  const sans = 'Inter, system-ui, sans-serif'

  if (carre) {
    ctx.drawImage(qr, Math.round((W - qrTaille) / 2), marge)
    ctx.textAlign = 'center'
    const y = marge + qrTaille + 8
    const t1 = ajusterTexte(ctx, m.ref, W - marge * 2, 34, '700', mono)
    ctx.fillText(m.ref, W / 2, y)
    ajusterTexte(ctx, m.nom, W - marge * 2, 22, '700', sans)
    ctx.fillText(couper(ctx, m.nom, W - marge * 2, 1)[0] ?? '', W / 2, y + t1 + 6)
  } else {
    ctx.drawImage(qr, marge, marge)
    ctx.textAlign = 'left'
    const x = marge + qrTaille + 12
    const maxW = W - x - marge
    let y = marge + 4
    const t1 = ajusterTexte(ctx, m.ref, maxW, 34, '700', mono)
    ctx.fillText(m.ref, x, y)
    y += t1 + 10
    ctx.font = `700 22px ${sans}`
    for (const ligne of couper(ctx, m.nom, maxW, 3)) {
      ctx.fillText(ligne, x, y)
      y += 26
    }
    if (sousTitre) {
      // Nom du lieu en entier : on réduit la police, puis on passe sur 2 lignes si besoin
      let taille = 17
      ctx.font = `600 ${taille}px ${sans}`
      while (ctx.measureText(sousTitre).width > maxW && taille > 14) {
        taille -= 1
        ctx.font = `600 ${taille}px ${sans}`
      }
      const lignes = ctx.measureText(sousTitre).width <= maxW ? [sousTitre] : couper(ctx, sousTitre, maxW, 2)
      const interligne = taille + 3
      let yb = H - marge - taille - (lignes.length - 1) * interligne
      for (const l of lignes) {
        ctx.fillText(l, x, yb)
        yb += interligne
      }
    }
  }
  return c
}

// iPhone : l'image est préparée à l'avance, car Safari n'autorise le partage
// que directement au moment du clic.
export async function fichierEtiquette(m: Materiel, f: FormatEtiquette): Promise<File> {
  const canvas = await dessinerEtiquette(m, f, m.lieuNom)
  const blob: Blob = await new Promise((res) => canvas.toBlob((b) => res(b!), 'image/png'))
  return new File([blob], `${m.ref}.png`, { type: 'image/png' })
}

export function partagerFichier(fichier: File): Promise<'partage' | 'telecharge'> {
  const nav = navigator as Navigator & { canShare?: (d: ShareData) => boolean }
  if (nav.canShare?.({ files: [fichier] })) {
    return navigator.share({ files: [fichier], title: fichier.name.replace('.png', '') }).then(() => 'partage' as const)
  }
  const a = document.createElement('a')
  a.href = URL.createObjectURL(fichier)
  a.download = fichier.name
  a.click()
  setTimeout(() => URL.revokeObjectURL(a.href), 5000)
  return Promise.resolve('telecharge')
}

// Impression par lot : fichier Excel à importer dans l'appli Niimbot (colonne URL = QR code)
export async function exporterExcel(items: Materiel[]) {
  const entete = ['Référence', 'Nom', 'Catégorie', 'Lieu', 'URL'].map((v) => ({ value: v, fontWeight: 'bold' as const }))
  const lignes = items.map((m) => [
    { value: m.ref }, { value: m.nom }, { value: m.categorieNom }, { value: m.lieuNom }, { value: urlMateriel(m.ref) },
  ])
  const date = new Date().toISOString().slice(0, 10)
  await writeXlsxFile([entete, ...lignes], {
    columns: [{ width: 14 }, { width: 34 }, { width: 22 }, { width: 22 }, { width: 46 }],
    sheet: 'Etiquettes',
  }).toFile(`etiquettes-${date}.xlsx`)
}

export function plateforme(): 'android' | 'ios' | 'autre' {
  const ua = navigator.userAgent
  if (/iPhone|iPad|iPod/i.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1)) return 'ios'
  if (/Android/i.test(ua)) return 'android'
  return 'autre'
}

export function bluetoothDisponible(): boolean {
  return typeof navigator !== 'undefined' && 'bluetooth' in navigator
}
