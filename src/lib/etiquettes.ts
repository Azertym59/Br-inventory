import QRCode from 'qrcode'
import writeXlsxFile from 'write-excel-file/browser'
import type { Materiel } from '../types'
import { urlMateriel } from './actions'
import { dessinerLogo } from './logo'

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

// Textes d'une étiquette.
// Avec un numéro : « Dalle ifix 8 » + « Dalle 042 » en gros, la référence et le lieu.
export function contenuEtiquette(m: Pick<Materiel, 'ref' | 'nom' | 'categorieNom' | 'modeleNom' | 'numero' | 'lieuNom'>) {
  const mot = (m.categorieNom || '').split(/\s+/)[0] || ''
  const titre = m.modeleNom && mot ? `${mot} ${m.modeleNom}` : m.nom
  const grand = m.numero != null ? `${mot || 'N°'} ${String(m.numero).padStart(3, '0')}` : null
  return { ref: m.ref, titre, grand, sous: m.lieuNom || '' }
}

export function libelleNumero(m: Pick<Materiel, 'categorieNom' | 'numero'>): string {
  if (m.numero == null) return ''
  const mot = (m.categorieNom || '').split(/\s+/)[0] || 'N°'
  return `${mot} ${String(m.numero).padStart(3, '0')}`
}

function ecrireBas(ctx: CanvasRenderingContext2D, texte: string, x: number, maxW: number, basY: number, sans: string) {
  // Nom du lieu en entier : police réduite, puis 2 lignes si besoin
  let taille = 17
  ctx.font = `600 ${taille}px ${sans}`
  while (ctx.measureText(texte).width > maxW && taille > 14) {
    taille -= 1
    ctx.font = `600 ${taille}px ${sans}`
  }
  const lignes = ctx.measureText(texte).width <= maxW ? [texte] : couper(ctx, texte, maxW, 2)
  const interligne = taille + 3
  let yb = basY - taille - (lignes.length - 1) * interligne
  for (const l of lignes) {
    ctx.fillText(l, x, yb)
    yb += interligne
  }
}

// Le canvas dessine avec la police de secours si Inter n'est pas encore chargée :
// on attend les polices de l'étiquette (une seule fois, 3 s max si le réseau est absent)
let polices: Promise<unknown> | null = null
function policesPretes() {
  polices ??= Promise.race([
    Promise.all(['700 19px Inter', '800 50px Inter', '600 17px Inter', '600 17px "JetBrains Mono"'].map((p) => document.fonts.load(p))),
    new Promise((r) => setTimeout(r, 3000)),
  ]).catch(() => {})
  return polices
}

// QR code net : chaque module fait un nombre entier de points (la B1 imprime à 8 points/mm),
// au plus proche de la taille visée
async function qrCode(url: string, cibleMm: number): Promise<HTMLCanvasElement> {
  const modules = QRCode.create(url, { errorCorrectionLevel: 'M' }).modules.size
  const scale = Math.max(4, Math.round((cibleMm * PX_PAR_MM) / modules))
  const qr = document.createElement('canvas')
  await QRCode.toCanvas(qr, url, { margin: 0, scale, errorCorrectionLevel: 'M', color: { dark: '#000', light: '#fff' } })
  return qr
}

// Titre à côté du logo : une ligne (police réduite si besoin), sinon deux
function ecrireTitre(ctx: CanvasRenderingContext2D, texte: string, x: number, maxW: number, milieuY: number, sans: string) {
  const t = ajusterTexte(ctx, texte, maxW, 21, '700', sans)
  if (ctx.measureText(texte).width <= maxW && t >= 16) {
    ctx.fillText(texte, x, Math.round(milieuY - t / 2))
    return
  }
  ctx.font = `700 16px ${sans}`
  const lignes = couper(ctx, texte, maxW, 2)
  let y = Math.round(milieuY - (lignes.length * 18) / 2)
  for (const l of lignes) { ctx.fillText(l, x, y); y += 18 }
}

// Dessine l'étiquette en noir et blanc, à la taille réelle d'impression.
// maxW / maxH : limite de la tête d'impression (la B1 imprime 384 px = 48 mm de large)
export async function dessinerEtiquette(
  m: Pick<Materiel, 'ref' | 'nom' | 'categorieNom' | 'modeleNom' | 'numero' | 'lieuNom'>, f: FormatEtiquette, maxW = Infinity, maxH = Infinity,
): Promise<HTMLCanvasElement> {
  await policesPretes()
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

  const t = contenuEtiquette(m)
  const marge = 2 * PX_PAR_MM
  const carre = Math.abs(f.hauteurMm - f.largeurMm) < 6
  const mono = '"JetBrains Mono", ui-monospace, monospace'
  const sans = 'Inter, system-ui, sans-serif'
  // Gros texte : « Dalle 042 », ou la référence pour le matériel sans numéro
  const principal = t.grand ?? t.ref
  const policePrincipal = t.grand ? sans : mono
  // Logo BR en noir, lettres ajourées (impression thermique noir et blanc)
  const logo = (x: number, y: number, h: number) => dessinerLogo(ctx, x, y, h, { fond: '#000', lettres: '#fff', marge: 0.3 })

  if (carre) {
    // En haut : logo + modèle ; au centre : QR ; en bas : numéro, référence, lieu
    const hLogo = 6 * PX_PAR_MM
    const wLogo = logo(marge, marge, hLogo)
    ctx.fillStyle = '#000'
    ctx.textAlign = 'left'
    ecrireTitre(ctx, t.titre, marge + wLogo + 10, W - marge * 2 - wLogo - 10, marge + hLogo / 2, sans)
    const qr = await qrCode(urlMateriel(m.ref), 25)
    let y = marge + hLogo + 10
    ctx.drawImage(qr, Math.round((W - qr.width) / 2), y)
    y += qr.width + 6
    ctx.textAlign = 'center'
    const t1 = ajusterTexte(ctx, principal, W - marge * 2, 42, '800', policePrincipal)
    ctx.fillText(principal, W / 2, y)
    y += t1 + 4
    if (t.grand) {
      ajusterTexte(ctx, t.ref, W - marge * 2, 16, '600', mono)
      ctx.fillText(t.ref, W / 2, y)
      y += 20
    }
    if (t.sous && y + 16 <= H - marge) {
      ajusterTexte(ctx, t.sous, W - marge * 2, 16, '600', sans)
      ctx.fillText(t.sous, W / 2, y)
    }
    return c
  }

  // À gauche : QR et logo dessous ; à droite : modèle, numéro en gros, référence, lieu en bas
  const qr = await qrCode(urlMateriel(m.ref), f.largeurMm >= 45 ? 19 : 15)
  const hLogo = 5 * PX_PAR_MM
  const hautQr = H - marge * 2 - hLogo - 8
  ctx.drawImage(qr, marge, marge + Math.max(0, Math.round((hautQr - qr.height) / 2)))
  logo(marge, H - marge - hLogo, hLogo)
  ctx.fillStyle = '#000'
  ctx.textAlign = 'left'
  const x = marge + qr.width + 14
  const largeur = W - x - marge
  let y = marge + 2
  ctx.font = `700 19px ${sans}`
  for (const ligne of couper(ctx, t.titre, largeur, 2)) {
    ctx.fillText(ligne, x, y)
    y += 23
  }
  y += 4
  const tg = ajusterTexte(ctx, principal, largeur, 52, '800', policePrincipal)
  ctx.fillText(principal, x, y)
  y += tg + 8
  if (t.grand) {
    ajusterTexte(ctx, t.ref, largeur, 17, '600', mono)
    ctx.fillText(t.ref, x, y)
  }
  if (t.sous) ecrireBas(ctx, t.sous, x, largeur, H - marge, sans)
  return c
}

// iPhone : l'image est préparée à l'avance, car Safari n'autorise le partage
// que directement au moment du clic.
export async function fichierEtiquette(m: Materiel, f: FormatEtiquette): Promise<File> {
  const canvas = await dessinerEtiquette(m, f)
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
  const entete = ['Référence', 'Modèle', 'Numéro', 'Nom', 'Catégorie', 'Lieu', 'URL'].map((v) => ({ value: v, fontWeight: 'bold' as const }))
  const lignes = items.map((m) => {
    const t = contenuEtiquette(m)
    return [
      { value: m.ref }, { value: t.titre }, { value: t.grand ?? '' }, { value: m.nom }, { value: m.categorieNom },
      { value: m.lieuNom }, { value: urlMateriel(m.ref) },
    ]
  })
  const date = new Date().toISOString().slice(0, 10)
  await writeXlsxFile([entete, ...lignes], {
    columns: [{ width: 14 }, { width: 22 }, { width: 14 }, { width: 34 }, { width: 22 }, { width: 22 }, { width: 46 }],
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
