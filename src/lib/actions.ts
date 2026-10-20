import {
  addDoc, collection, doc, getDocs, increment, query, runTransaction, serverTimestamp,
  setDoc, updateDoc, where, writeBatch,
} from 'firebase/firestore'
import { db, REF_PREFIX } from '../firebase'
import type {
  Categorie, Gps, Gravite, Lieu, Materiel, Modele, Statut, Ticket, TypeEvenement, Utilisateur,
} from '../types'
import { envoyerPhotos } from './photos'

export interface Contexte {
  user: Utilisateur
  lieu: Lieu | null
}

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

function avecDelai<T>(p: Promise<T>, ms: number): Promise<T> {
  return Promise.race([p, new Promise<T>((_, rej) => setTimeout(() => rej(new Error('hors-ligne')), ms))])
}

// Compteur séquentiel (BR-00042, T-0128). Nécessite le réseau.
async function prochainNumero(compteur: 'materiel' | 'tickets'): Promise<number> {
  const ref = doc(db, 'compteurs', compteur)
  return avecDelai(runTransaction(db, async (tx) => {
    const snap = await tx.get(ref)
    const n = ((snap.exists() ? (snap.data().n as number) : 0) || 0) + 1
    tx.set(ref, { n }, { merge: true })
    return n
  }), 8000)
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

async function journal(
  ctx: Contexte,
  m: Pick<Materiel, 'ref' | 'nom'>,
  type: TypeEvenement,
  titre: string,
  extra: { gps?: Gps | null; commentaire?: string | null; photos?: string[]; lieu?: Lieu | null } = {},
) {
  const lieu = extra.lieu !== undefined ? extra.lieu : ctx.lieu
  await addDoc(collection(db, 'evenements'), {
    materielRef: m.ref,
    materielNom: m.nom,
    type,
    titre,
    userId: ctx.user.uid,
    userNom: ctx.user.nom,
    lieuId: lieu?.id ?? null,
    lieuNom: lieu?.nom ?? null,
    gps: extra.gps ?? null,
    commentaire: extra.commentaire ?? null,
    photos: extra.photos ?? [],
    date: serverTimestamp(),
  })
}

// ---------- matériel ----------

export interface NouveauMateriel {
  categorie: Categorie
  modele: Modele | null
  nom: string
  valeurs: Record<string, string>
  quantite: number | null
  lieu: Lieu
  photo: File | null
}

export async function creerMateriel(ctx: Contexte, n: NouveauMateriel): Promise<string> {
  const num = await prochainNumero('materiel')
  const ref = `${REF_PREFIX}-${String(num).padStart(5, '0')}`
  const photoUrl = n.photo ? (await envoyerPhotos([n.photo], `materiel/${ref}`))[0] : null
  const gps = await positionGps(4000)
  const data: Omit<Materiel, 'creeLe' | 'dernierInventaire'> & Record<string, unknown> = {
    ref,
    nom: n.nom,
    categorieId: n.categorie.id,
    categorieNom: n.categorie.nom,
    famille: n.categorie.famille,
    modeleId: n.modele?.id ?? null,
    modeleNom: n.modele?.nom ?? null,
    valeurs: n.valeurs,
    quantite: n.quantite,
    lieuId: n.lieu.id,
    lieuNom: n.lieu.nom,
    statut: 'ok',
    etiquetee: false,
    photoUrl,
    ticketsOuverts: 0,
    creePar: { uid: ctx.user.uid, nom: ctx.user.nom },
  }
  await setDoc(doc(db, 'materiel', ref), {
    ...data,
    creeLe: serverTimestamp(),
    dernierInventaire: { uid: ctx.user.uid, nom: ctx.user.nom, lieuId: n.lieu.id, lieuNom: n.lieu.nom, date: serverTimestamp() },
  })
  await journal(ctx, { ref, nom: n.nom }, 'creation', 'Création', { gps, lieu: n.lieu })
  return ref
}

// Scan « présent ici » : si le matériel est trouvé ailleurs que prévu, il est déplacé automatiquement.
export async function inventorier(ctx: Contexte, m: Materiel, lieu: Lieu, gps?: Gps | null): Promise<{ deplace: boolean }> {
  const position = gps === undefined ? await positionGps(4000) : gps
  const deplace = m.lieuId !== lieu.id
  const maj: Record<string, unknown> = {
    dernierInventaire: { uid: ctx.user.uid, nom: ctx.user.nom, lieuId: lieu.id, lieuNom: lieu.nom, date: serverTimestamp() },
  }
  if (deplace) {
    maj.lieuId = lieu.id
    maj.lieuNom = lieu.nom
  }
  await updateDoc(doc(db, 'materiel', m.ref), maj)
  if (deplace) await journal(ctx, m, 'deplacement', `Trouvé à ${lieu.nom} (était à ${m.lieuNom})`, { gps: position, lieu })
  await journal(ctx, m, 'inventaire', 'Inventorié', { gps: position, lieu })
  return { deplace }
}

export async function deplacer(ctx: Contexte, m: Materiel, vers: Lieu, commentaire?: string) {
  const gps = await positionGps(4000)
  await updateDoc(doc(db, 'materiel', m.ref), { lieuId: vers.id, lieuNom: vers.nom })
  await journal(ctx, m, 'deplacement', `Déplacé : ${m.lieuNom} → ${vers.nom}`, { gps, commentaire: commentaire || null })
}

export async function changerStatut(ctx: Contexte, m: Materiel, statut: Statut, commentaire?: string) {
  await updateDoc(doc(db, 'materiel', m.ref), { statut })
  await journal(ctx, m, 'statut', `Statut : ${LIBELLES_STATUT[statut]}`, { commentaire: commentaire || null })
}

export async function modifierMateriel(ctx: Contexte, m: Materiel, champs: Partial<Pick<Materiel, 'nom' | 'valeurs' | 'quantite'>>) {
  await updateDoc(doc(db, 'materiel', m.ref), champs)
  await journal(ctx, m, 'modification', 'Fiche modifiée')
}

export async function marquerEtiquetes(ctx: Contexte, items: Materiel[]) {
  for (let i = 0; i < items.length; i += 200) {
    const batch = writeBatch(db)
    for (const m of items.slice(i, i + 200)) {
      batch.update(doc(db, 'materiel', m.ref), { etiquetee: true })
      batch.set(doc(collection(db, 'evenements')), {
        materielRef: m.ref, materielNom: m.nom, type: 'etiquette', titre: 'Étiquette imprimée',
        userId: ctx.user.uid, userNom: ctx.user.nom, lieuId: ctx.lieu?.id ?? null, lieuNom: ctx.lieu?.nom ?? null,
        gps: null, commentaire: null, photos: [], date: serverTimestamp(),
      })
    }
    await batch.commit()
  }
}

// ---------- tickets ----------

const STATUT_SELON_GRAVITE: Record<Gravite, Statut> = { faible: 'surveiller', moyenne: 'surveiller', critique: 'panne' }
const RANG_STATUT: Record<Statut, number> = { ok: 0, surveiller: 1, reparation: 2, panne: 3, hs: 4 }

export async function signaler(
  ctx: Contexte, m: Materiel,
  s: { description: string; gravite: Gravite; photos: File[] },
): Promise<string> {
  const lieu = ctx.lieu ?? { id: m.lieuId, nom: m.lieuNom, type: 'autre' as const, actif: true }
  const [gps, photos] = await Promise.all([
    positionGps(5000),
    s.photos.length ? envoyerPhotos(s.photos, `tickets/${m.ref}`) : Promise.resolve([] as string[]),
  ])
  let numero: string
  try {
    numero = `T-${String(await prochainNumero('tickets')).padStart(4, '0')}`
  } catch {
    numero = `T-${Date.now().toString(36).toUpperCase()}`
  }
  const ticket: Omit<Ticket, 'id' | 'creeLe' | 'majLe' | 'repareLe'> = {
    numero,
    materielRef: m.ref,
    materielNom: m.nom,
    lieuId: lieu.id,
    lieuNom: lieu.nom,
    description: s.description,
    gravite: s.gravite,
    statut: 'ouvert',
    signalePar: { uid: ctx.user.uid, nom: ctx.user.nom },
    assigneA: null,
    photos,
    photosApres: [],
    gps,
    commentaireReparation: null,
  }
  await addDoc(collection(db, 'tickets'), { ...ticket, creeLe: serverTimestamp(), majLe: serverTimestamp(), repareLe: null })
  const nouveau = STATUT_SELON_GRAVITE[s.gravite]
  await updateDoc(doc(db, 'materiel', m.ref), {
    ticketsOuverts: increment(1),
    ...(RANG_STATUT[nouveau] > RANG_STATUT[m.statut] ? { statut: nouveau } : {}),
  })
  await journal(ctx, m, 'signalement', `Problème signalé (${s.gravite}) · ${numero}`, {
    gps, commentaire: s.description, photos, lieu,
  })
  return numero
}

export async function prendreEnCharge(ctx: Contexte, t: Ticket) {
  await updateDoc(doc(db, 'tickets', t.id), {
    statut: 'en_cours', assigneA: { uid: ctx.user.uid, nom: ctx.user.nom }, majLe: serverTimestamp(),
  })
  await updateDoc(doc(db, 'materiel', t.materielRef), { statut: 'reparation' })
  await journal(ctx, { ref: t.materielRef, nom: t.materielNom }, 'statut', `${t.numero} pris en charge`)
}

export async function cloturerReparation(ctx: Contexte, t: Ticket, commentaire: string, photos: File[]) {
  const urls = photos.length ? await envoyerPhotos(photos, `tickets/${t.materielRef}`) : []
  await updateDoc(doc(db, 'tickets', t.id), {
    statut: 'repare', commentaireReparation: commentaire || null, photosApres: urls,
    assigneA: t.assigneA ?? { uid: ctx.user.uid, nom: ctx.user.nom },
    majLe: serverTimestamp(), repareLe: serverTimestamp(),
  })
  // S'il ne reste aucun autre ticket ouvert, le matériel repasse « OK »
  const autres = await getDocs(query(collection(db, 'tickets'), where('materielRef', '==', t.materielRef)))
  const restants = autres.docs.filter((d) => d.id !== t.id && d.data().statut !== 'repare').length
  await updateDoc(doc(db, 'materiel', t.materielRef), {
    ticketsOuverts: restants,
    ...(restants === 0 ? { statut: 'ok' } : {}),
  })
  await journal(ctx, { ref: t.materielRef, nom: t.materielNom }, 'reparation', `Réparé · ${t.numero}`, {
    commentaire: commentaire || null, photos: urls,
  })
}

// ---------- libellés ----------

export const LIBELLES_STATUT: Record<Statut, string> = {
  ok: 'OK', surveiller: 'À surveiller', panne: 'En panne', reparation: 'En réparation', hs: 'Hors service',
}
export const LIBELLES_GRAVITE: Record<Gravite, string> = { faible: 'Faible', moyenne: 'Moyenne', critique: 'Critique' }
