import { get, HorsLigne, patch, post } from './api'
import { envoyerOuMettreEnAttente } from './outbox'
import { envoyerPhotos } from './photos'
import type {
  Gps, Gravite, Inventaire, Lieu, Materiel, Modele, Categorie, PropositionDeplacement, SignalementAValider, Statut, Ticket, Utilisateur,
} from '../types'

export interface Contexte {
  user: Utilisateur
  lieu: Lieu | null
}

// Le fournisseur de données s'abonne ici pour se rafraîchir / se mettre à jour après chaque action
let apres: (() => void) | null = null
let local: ((ref: string, champs: Partial<Materiel>) => void) | null = null
export function brancherDonnees(rafraichir: () => void, modifierLocal: (ref: string, champs: Partial<Materiel>) => void) {
  apres = rafraichir
  local = modifierLocal
}
const fini = () => { apres?.() }

// ---------- utilitaires ----------

export function positionGps(timeoutMs = 6000): Promise<Gps | null> {
  return new Promise((resolve) => {
    if (!('geolocation' in navigator)) return resolve(null)
    const t = setTimeout(() => resolve(null), timeoutMs + 500)
    navigator.geolocation.getCurrentPosition(
      (p) => { clearTimeout(t); resolve({ lat: p.coords.latitude, lng: p.coords.longitude, precision: Math.round(p.coords.accuracy) }) },
      () => { clearTimeout(t); resolve(null) },
      { enableHighAccuracy: true, timeout: timeoutMs, maximumAge: 60000 },
    )
  })
}

export function urlMateriel(ref: string): string {
  return `${window.location.origin}/m/${encodeURIComponent(ref)}`
}

export function extraireRef(texte: string): string | null {
  const t = texte.trim()
  const m = t.match(/\/m\/([^/?#\s]+)/)
  if (m) return decodeURIComponent(m[1]).toUpperCase()
  const r = t.toUpperCase().match(/^[A-Z0-9]{1,6}-\d{3,}$/)
  return r ? r[0] : null
}

export const estAdmin = (ctx: Contexte) => ctx.user.role === 'admin'

// ---------- matériel ----------

export interface NouveauMateriel {
  categorie: Categorie
  modele: Modele | null
  nom: string
  valeurs: Record<string, string>
  quantite: number | null
  lieu: Lieu
  photo: File | null
  exemplaires?: number
  numeroDepart?: number | null
  gps?: Gps | null
}

// Crée une pièce ou une série complète (numérotée si numeroDepart est fourni)
export async function creerMateriel(_ctx: Contexte, n: NouveauMateriel): Promise<string[]> {
  const photoUrl = n.photo ? (await envoyerPhotos([n.photo]))[0] : null
  const r = await post<{ refs: string[] }>('/materiel', {
    categorieId: n.categorie.id, modeleId: n.modele?.id ?? null, nom: n.nom, valeurs: n.valeurs,
    quantite: n.quantite, lieuId: n.lieu.id, photoUrl, exemplaires: n.exemplaires ?? 1,
    numeroDepart: n.numeroDepart ?? null, gps: n.gps ?? null,
  })
  fini()
  return r.refs
}

// Scan « présent ici ». Hors ligne, le scan est gardé et envoyé au retour du réseau.
export async function inventorier(ctx: Contexte, m: Materiel, lieu: Lieu, gps?: Gps | null, inventaireId?: string | null): Promise<{ deplace: boolean; propose: boolean; enAttente: boolean }> {
  const position = gps === undefined ? await positionGps(4000) : gps
  const ailleurs = m.lieuId !== lieu.id
  local?.(m.ref, {
    dernierInventaire: { uid: ctx.user.uid, nom: ctx.user.nom, lieuId: lieu.id, lieuNom: lieu.nom, date: new Date().toISOString() },
    ...(ailleurs && estAdmin(ctx) ? { lieuId: lieu.id, lieuNom: lieu.nom } : {}),
  })
  const r = await envoyerOuMettreEnAttente<{ deplace: boolean; propose: boolean }>(
    'POST', `/materiel/${encodeURIComponent(m.ref)}/inventaire`, { lieuId: lieu.id, gps: position, inventaireId: inventaireId ?? null }, `Inventaire ${m.ref}`)
  if (r) fini()
  return r ? { ...r, enAttente: false } : { deplace: ailleurs && estAdmin(ctx), propose: ailleurs && !estAdmin(ctx), enAttente: true }
}

// Re-dispatch vers un autre parc (admin)
export async function deplacerLot(_ctx: Contexte, items: Materiel[], vers: Lieu, commentaire?: string) {
  await post('/materiel/deplacer', { refs: items.map((m) => m.ref), lieuId: vers.id, commentaire: commentaire ?? null })
  fini()
}
export const deplacer = (ctx: Contexte, m: Materiel, vers: Lieu, commentaire?: string) => deplacerLot(ctx, [m], vers, commentaire)

export async function changerStatut(_ctx: Contexte, m: Materiel, statut: Statut, commentaire?: string) {
  local?.(m.ref, { statut })
  const r = await envoyerOuMettreEnAttente('PATCH', `/materiel/${encodeURIComponent(m.ref)}`, { statut, commentaire: commentaire ?? null }, `Statut ${m.ref}`)
  if (r) fini()
}

export async function modifierMateriel(_ctx: Contexte, m: Materiel, champs: Partial<Pick<Materiel, 'nom' | 'valeurs' | 'quantite' | 'numero'>>) {
  await patch(`/materiel/${encodeURIComponent(m.ref)}`, champs)
  fini()
}

export async function marquerEtiquetes(_ctx: Contexte, items: Materiel[]) {
  for (let i = 0; i < items.length; i += 1000) await post('/materiel/etiquetes', { refs: items.slice(i, i + 1000).map((m) => m.ref) })
  fini()
}

// Numérotation d'une série (ex. 195 dalles → Dalle 001 à Dalle 195), dans l'ordre donné
export async function numeroter(items: Materiel[], depart: number) {
  await post('/materiel/numeroter', { refs: items.map((m) => m.ref), depart })
  fini()
}

// Ordre d'une série : par numéro, puis par référence
export function trierSerie<T extends Pick<Materiel, 'ref' | 'numero'>>(items: T[]): T[] {
  return [...items].sort((a, b) =>
    (a.numero ?? Number.MAX_SAFE_INTEGER) - (b.numero ?? Number.MAX_SAFE_INTEGER) || a.ref.localeCompare(b.ref))
}

// ---------- signalements, tickets, validations ----------

// Membre de l'équipe : ticket ouvert directement. Sans compte : signalement à valider par un admin.
export async function signaler(
  ctx: Contexte, m: Materiel, s: { description: string; gravite: Gravite; photos: File[] },
): Promise<{ numero: string | null; aValider: boolean }> {
  const lieu = ctx.lieu ?? { id: m.lieuId }
  const [gps, photos] = await Promise.all([positionGps(5000), s.photos.length ? envoyerPhotos(s.photos) : Promise.resolve([] as string[])])
  const r = await post<{ numero: string | null; aValider: boolean }>('/signalements', {
    ref: m.ref, description: s.description, gravite: s.gravite, photos, gps, lieuId: lieu.id,
  })
  fini()
  return r
}

export async function traiterSignalement(_ctx: Contexte, s: SignalementAValider, accepter: boolean, _m?: Materiel, gravite?: Gravite) {
  await post(`/signalements/${s.id}/traiter`, { accepter, gravite: gravite ?? null })
  fini()
}

export async function traiterProposition(_ctx: Contexte, p: PropositionDeplacement, accepter: boolean, _m?: Materiel) {
  await post(`/propositions/${p.id}/traiter`, { accepter })
  fini()
}

export async function assignerTicket(_ctx: Contexte, t: Ticket, a: { uid: string; nom: string } | null) {
  await post(`/tickets/${t.id}/assigner`, { uid: a?.uid ?? null })
  fini()
}

export async function prendreEnCharge(_ctx: Contexte, t: Ticket) {
  await post(`/tickets/${t.id}/prendre`)
  fini()
}

export async function cloturerReparation(_ctx: Contexte, t: Ticket, commentaire: string, photos: File[]) {
  const urls = photos.length ? await envoyerPhotos(photos) : []
  await post(`/tickets/${t.id}/cloturer`, { commentaire, photos: urls })
  fini()
}

export const chargerTicket = (id: string) => get<Ticket>(`/tickets/${id}`)

// ---------- inventaires ----------

export const demarrerInventaire = (lieuId: string) => post<Inventaire>('/inventaires', { lieuId })
export const lireInventaire = (id: string) => get<Inventaire>(`/inventaires/${id}`)
export async function cloturerInventaire(id: string) {
  try { await post(`/inventaires/${id}/cloturer`) } catch (e) { if (!(e instanceof HorsLigne)) throw e }
}

// ---------- libellés ----------

export const LIBELLES_STATUT: Record<Statut, string> = {
  ok: 'OK', surveiller: 'À surveiller', panne: 'En panne', reparation: 'En réparation', hs: 'Hors service',
}
export const LIBELLES_GRAVITE: Record<Gravite, string> = { faible: 'Faible', moyenne: 'Moyenne', critique: 'Critique' }
