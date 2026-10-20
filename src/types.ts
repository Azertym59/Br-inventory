// Dates : chaînes ISO renvoyées par le serveur
type Timestamp = string

export type Role = 'anonyme' | 'technicien' | 'admin'

export interface Utilisateur {
  uid: string
  nom: string
  email: string
  role: Role
  actif: boolean
  // Invitation envoyée, mot de passe pas encore choisi
  enAttente?: boolean
}

export type TypeLieu = 'stade' | 'depot' | 'autre'

export interface Lieu {
  id: string
  nom: string
  type: TypeLieu
  adresse?: string
  actif: boolean
}

export interface Champ {
  key: string
  label: string
  placeholder?: string
}

export interface Categorie {
  id: string
  nom: string
  famille: string
  champs: Champ[]
  quantiteParDefaut: boolean
  ordre: number
}

export interface Modele {
  id: string
  categorieId: string
  nom: string
  valeurs: Record<string, string>
}

export type Statut = 'ok' | 'surveiller' | 'panne' | 'reparation' | 'hs'

export interface Trace {
  uid: string
  nom: string
  lieuId: string | null
  lieuNom: string | null
  date: Timestamp | null
}

export interface Materiel {
  ref: string
  nom: string
  categorieId: string
  categorieNom: string
  famille: string
  modeleId: string | null
  modeleNom: string | null
  valeurs: Record<string, string>
  quantite: number | null
  numero?: number | null // n° de la pièce dans sa série (ex. dalle 042)
  lieuId: string
  lieuNom: string
  statut: Statut
  etiquetee: boolean
  photoUrl: string | null
  ticketsOuverts: number
  dernierInventaire: Trace | null
  creeLe: Timestamp | null
  creePar: { uid: string; nom: string }
}

export type TypeEvenement =
  | 'creation'
  | 'inventaire'
  | 'signalement'
  | 'deplacement'
  | 'reparation'
  | 'etiquette'
  | 'modification'
  | 'statut'

export interface Gps {
  lat: number
  lng: number
  precision: number
}

export interface Evenement {
  id: string
  materielRef: string
  materielNom: string
  type: TypeEvenement
  titre: string
  userId: string
  userNom: string
  lieuId: string | null
  lieuNom: string | null
  gps: Gps | null
  commentaire: string | null
  photos: string[]
  date: Timestamp | null
}

export type Gravite = 'faible' | 'moyenne' | 'critique'
export type StatutTicket = 'ouvert' | 'en_cours' | 'repare'

export interface Ticket {
  id: string
  numero: string
  materielRef: string
  materielNom: string
  lieuId: string
  lieuNom: string
  description: string
  gravite: Gravite
  statut: StatutTicket
  signalePar: { uid: string; nom: string; anonyme?: boolean }
  validePar?: { uid: string; nom: string } | null
  assigneA: { uid: string; nom: string } | null
  photos: string[]
  photosApres: string[]
  gps: Gps | null
  commentaireReparation: string | null
  creeLe: Timestamp | null
  majLe: Timestamp | null
  repareLe: Timestamp | null
}

export interface Inventaire {
  id: string
  lieuId: string
  lieuNom: string
  par: { uid: string; nom: string }
  scannes: string[]
  attendus: string[]
  demarreLe: Timestamp | null
  termineLe: Timestamp | null
}

// Signalement fait sans compte : un admin le valide (→ ticket) ou le rejette
export interface SignalementAValider {
  id: string
  materielRef: string
  materielNom: string
  lieuId: string
  lieuNom: string
  description: string
  gravite: Gravite
  photos: string[]
  gps: Gps | null
  declarant: { uid: string; nom: string }
  statut: 'a_valider' | 'valide' | 'rejete'
  creeLe: Timestamp | null
}

// Matériel trouvé ailleurs que prévu lors d'un inventaire : un admin valide le déplacement
export interface PropositionDeplacement {
  id: string
  materielRef: string
  materielNom: string
  deLieuId: string
  deLieuNom: string
  versLieuId: string
  versLieuNom: string
  par: { uid: string; nom: string }
  statut: 'a_valider' | 'valide' | 'rejete'
  creeLe: Timestamp | null
}
