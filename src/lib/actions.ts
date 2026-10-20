import {
  addDoc, collection, doc, getDocs, increment, query, runTransaction, serverTimestamp,
  setDoc, updateDoc, where, writeBatch,
} from 'firebase/firestore'
import { db, REF_PREFIX } from '../firebase'
import type {
  Categorie, Gps, Gravite, Lieu, Materiel, Modele, PropositionDeplacement, SignalementAValider, Statut, Ticket,
  TypeEvenement, Utilisateur,
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
  numero?: number | null
  lieu: Lieu
  photo: File | null
  gps?: Gps | null
}

export async function creerMateriel(ctx: Contexte, n: NouveauMateriel): Promise<string> {
  const num = await prochainNumero('materiel')
  const ref = `${REF_PREFIX}-${String(num).padStart(5, '0')}`
  const photoUrl = n.photo ? (await envoyerPhotos([n.photo], `materiel/${ref}`))[0] : null
  const gps = n.gps !== undefined ? n.gps : await positionGps(4000)
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
    numero: n.numero ?? null,
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

export const estAdmin = (ctx: Contexte) => ctx.user.role === 'admin'

// Scan « présent ici ». Si le matériel est trouvé dans un autre parc :
// un admin le déplace directement, sinon une proposition de déplacement part en validation.
// Les écritures partent dans le cache local et se synchronisent quand le réseau revient :
// on ne les attend pas, sinon l'écran resterait bloqué hors ligne (sous-sols de stades).
function enFond(p: Promise<unknown>, quoi: string) {
  p.catch((e) => console.error(`Échec de synchronisation (${quoi})`, e))
}

function propositionDejaEnvoyee(cle: string): boolean {
  try {
    const deja = JSON.parse(localStorage.getItem('propositionsEnvoyees') ?? '[]') as string[]
    if (deja.includes(cle)) return true
    localStorage.setItem('propositionsEnvoyees', JSON.stringify([...deja.slice(-200), cle]))
  } catch { /* stockage indisponible */ }
  return false
}

export async function inventorier(ctx: Contexte, m: Materiel, lieu: Lieu, gps?: Gps | null): Promise<{ deplace: boolean; propose: boolean }> {
  const position = gps === undefined ? await positionGps(4000) : gps
  const ailleurs = m.lieuId !== lieu.id
  const deplace = ailleurs && estAdmin(ctx)
  const maj: Record<string, unknown> = {
    dernierInventaire: { uid: ctx.user.uid, nom: ctx.user.nom, lieuId: lieu.id, lieuNom: lieu.nom, date: serverTimestamp() },
  }
  if (deplace) {
    maj.lieuId = lieu.id
    maj.lieuNom = lieu.nom
  }
  enFond(updateDoc(doc(db, 'materiel', m.ref), maj), 'inventaire')
  if (deplace) enFond(journal(ctx, m, 'deplacement', `Trouvé à ${lieu.nom} (était à ${m.lieuNom})`, { gps: position, lieu }), 'journal')
  if (ailleurs && !deplace && !propositionDejaEnvoyee(`${m.ref}>${lieu.id}`)) {
    enFond(addDoc(collection(db, 'propositions'), {
      materielRef: m.ref, materielNom: m.nom, deLieuId: m.lieuId, deLieuNom: m.lieuNom,
      versLieuId: lieu.id, versLieuNom: lieu.nom, par: { uid: ctx.user.uid, nom: ctx.user.nom },
      statut: 'a_valider', creeLe: serverTimestamp(),
    }), 'proposition')
  }
  enFond(journal(ctx, m, 'inventaire', ailleurs && !deplace ? `Inventorié à ${lieu.nom} (attendu à ${m.lieuNom})` : 'Inventorié', { gps: position, lieu }), 'journal')
  return { deplace, propose: ailleurs && !deplace }
}

// Re-dispatch de plusieurs matériels vers un autre parc (admin)
export async function deplacerLot(ctx: Contexte, items: Materiel[], vers: Lieu) {
  for (let i = 0; i < items.length; i += 200) {
    const batch = writeBatch(db)
    for (const m of items.slice(i, i + 200)) {
      if (m.lieuId === vers.id) continue
      batch.update(doc(db, 'materiel', m.ref), { lieuId: vers.id, lieuNom: vers.nom })
      batch.set(doc(collection(db, 'evenements')), {
        materielRef: m.ref, materielNom: m.nom, type: 'deplacement', titre: `Re-dispatch : ${m.lieuNom} → ${vers.nom}`,
        userId: ctx.user.uid, userNom: ctx.user.nom, lieuId: vers.id, lieuNom: vers.nom,
        gps: null, commentaire: null, photos: [], date: serverTimestamp(),
      })
    }
    await batch.commit()
  }
}

export async function traiterProposition(ctx: Contexte, p: PropositionDeplacement, accepter: boolean, materiel: Materiel | undefined) {
  if (accepter && materiel && materiel.lieuId !== p.versLieuId) {
    await updateDoc(doc(db, 'materiel', p.materielRef), { lieuId: p.versLieuId, lieuNom: p.versLieuNom })
    await journal(ctx, materiel, 'deplacement', `Déplacement validé : ${materiel.lieuNom} → ${p.versLieuNom} (signalé par ${p.par.nom})`,
      { lieu: { id: p.versLieuId, nom: p.versLieuNom, type: 'autre', actif: true } })
  }
  await updateDoc(doc(db, 'propositions', p.id), {
    statut: accepter ? 'valide' : 'rejete', traitePar: { uid: ctx.user.uid, nom: ctx.user.nom }, traiteLe: serverTimestamp(),
  })
}

export async function deplacer(ctx: Contexte, m: Materiel, vers: Lieu, commentaire?: string) {
  const gps = await positionGps(4000)
  await updateDoc(doc(db, 'materiel', m.ref), { lieuId: vers.id, lieuNom: vers.nom })
  await journal(ctx, m, 'deplacement', `Déplacé : ${m.lieuNom} → ${vers.nom}`, { gps, commentaire: commentaire || null })
}

export async function changerStatut(ctx: Contexte, m: Materiel, statut: Statut, commentaire?: string) {
  enFond(updateDoc(doc(db, 'materiel', m.ref), { statut }), 'statut')
  enFond(journal(ctx, m, 'statut', `Statut : ${LIBELLES_STATUT[statut]}`, { commentaire: commentaire || null }), 'journal')
}

export async function modifierMateriel(ctx: Contexte, m: Materiel, champs: Partial<Pick<Materiel, 'nom' | 'valeurs' | 'quantite' | 'numero'>>) {
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

async function numeroTicket(): Promise<string> {
  try {
    return `T-${String(await prochainNumero('tickets')).padStart(4, '0')}`
  } catch {
    return `T-${Date.now().toString(36).toUpperCase()}`
  }
}

async function ouvrirTicket(
  m: Pick<Materiel, 'ref' | 'nom' | 'statut'>,
  t: { lieuId: string; lieuNom: string; description: string; gravite: Gravite; photos: string[]; gps: Gps | null;
    signalePar: Ticket['signalePar']; validePar: Ticket['validePar'] },
): Promise<string> {
  const numero = await numeroTicket()
  await addDoc(collection(db, 'tickets'), {
    numero, materielRef: m.ref, materielNom: m.nom, ...t,
    statut: 'ouvert', assigneA: null, photosApres: [], commentaireReparation: null,
    creeLe: serverTimestamp(), majLe: serverTimestamp(), repareLe: null,
  })
  const nouveau = STATUT_SELON_GRAVITE[t.gravite]
  await updateDoc(doc(db, 'materiel', m.ref), {
    ticketsOuverts: increment(1),
    ...(RANG_STATUT[nouveau] > RANG_STATUT[m.statut] ? { statut: nouveau } : {}),
  })
  return numero
}

// Signalement : un membre de l'équipe ouvre directement un ticket ;
// sans compte, le signalement attend la validation d'un admin.
export async function signaler(
  ctx: Contexte, m: Materiel,
  s: { description: string; gravite: Gravite; photos: File[] },
): Promise<{ numero: string | null; aValider: boolean }> {
  const lieu = ctx.lieu ?? { id: m.lieuId, nom: m.lieuNom, type: 'autre' as const, actif: true }
  const [gps, photos] = await Promise.all([
    positionGps(5000),
    s.photos.length ? envoyerPhotos(s.photos, `tickets/${m.ref}`) : Promise.resolve([] as string[]),
  ])
  if (ctx.user.role === 'anonyme') {
    await addDoc(collection(db, 'signalements'), {
      materielRef: m.ref, materielNom: m.nom, lieuId: lieu.id, lieuNom: lieu.nom,
      description: s.description, gravite: s.gravite, photos, gps,
      declarant: { uid: ctx.user.uid, nom: ctx.user.nom }, statut: 'a_valider', creeLe: serverTimestamp(),
    })
    await journal(ctx, m, 'signalement', `Problème signalé (${s.gravite}), en attente de validation`, { gps, commentaire: s.description, photos, lieu })
    return { numero: null, aValider: true }
  }
  const numero = await ouvrirTicket(m, {
    lieuId: lieu.id, lieuNom: lieu.nom, description: s.description, gravite: s.gravite, photos, gps,
    signalePar: { uid: ctx.user.uid, nom: ctx.user.nom }, validePar: null,
  })
  await journal(ctx, m, 'signalement', `Problème signalé (${s.gravite}) · ${numero}`, { gps, commentaire: s.description, photos, lieu })
  return { numero, aValider: false }
}

export async function traiterSignalement(ctx: Contexte, s: SignalementAValider, accepter: boolean, materiel: Materiel | undefined, gravite?: Gravite) {
  let numero: string | null = null
  if (accepter && !materiel) throw new Error('Matériel introuvable : impossible de créer le ticket')
  if (accepter && materiel) {
    numero = await ouvrirTicket(materiel, {
      lieuId: s.lieuId, lieuNom: s.lieuNom, description: s.description, gravite: gravite ?? s.gravite, photos: s.photos, gps: s.gps,
      signalePar: { uid: s.declarant.uid, nom: s.declarant.nom, anonyme: true },
      validePar: { uid: ctx.user.uid, nom: ctx.user.nom },
    })
    await journal(ctx, materiel, 'statut', `Signalement de ${s.declarant.nom} validé · ${numero}`)
  }
  await updateDoc(doc(db, 'signalements', s.id), {
    statut: accepter ? 'valide' : 'rejete', ticket: numero, traitePar: { uid: ctx.user.uid, nom: ctx.user.nom }, traiteLe: serverTimestamp(),
  })
}

export async function assignerTicket(ctx: Contexte, t: Ticket, a: { uid: string; nom: string } | null) {
  await updateDoc(doc(db, 'tickets', t.id), { assigneA: a, majLe: serverTimestamp() })
  await journal(ctx, { ref: t.materielRef, nom: t.materielNom }, 'statut', a ? `${t.numero} assigné à ${a.nom}` : `${t.numero} désassigné`)
}

export async function prendreEnCharge(ctx: Contexte, t: Ticket) {
  await updateDoc(doc(db, 'tickets', t.id), {
    statut: 'en_cours', assigneA: t.assigneA ?? { uid: ctx.user.uid, nom: ctx.user.nom }, majLe: serverTimestamp(),
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

// Numérotation d'une série (ex. 195 dalles → Dalle 001 à Dalle 195), dans l'ordre donné
export async function numeroter(items: Materiel[], depart: number) {
  for (let i = 0; i < items.length; i += 400) {
    const batch = writeBatch(db)
    items.slice(i, i + 400).forEach((m, j) => batch.update(doc(db, 'materiel', m.ref), { numero: depart + i + j }))
    await batch.commit()
  }
}

// Ordre d'une série : par numéro, puis par référence
export function trierSerie<T extends Pick<Materiel, 'ref' | 'numero'>>(items: T[]): T[] {
  return [...items].sort((a, b) =>
    (a.numero ?? Number.MAX_SAFE_INTEGER) - (b.numero ?? Number.MAX_SAFE_INTEGER) || a.ref.localeCompare(b.ref))
}
