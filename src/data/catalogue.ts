import type { Categorie, Champ } from '../types'

// Catégories installées au premier démarrage (modifiables ensuite dans Administration).
const c = (key: string, label: string, placeholder = ''): Champ => ({ key, label, placeholder })
const serie = c('serie', 'N° de série', 'Ex. : SN-39-0817')
const modele = (ph = '') => c('modele', 'Modèle', ph)
const longueur = c('longueur', 'Longueur (m)', 'Ex. : 20')

export const FAMILLES: { nom: string; couleur: string }[] = [
  { nom: 'Affichage', couleur: '#1D4ED8' },
  { nom: 'Pilotage vidéo', couleur: '#6D28D9' },
  { nom: 'Câblage data & vidéo', couleur: '#0369A1' },
  { nom: 'Électrique', couleur: '#B45309' },
  { nom: 'Informatique', couleur: '#15803D' },
  { nom: 'Divers', couleur: '#475569' },
]

export function couleurFamille(famille: string): string {
  return FAMILLES.find((f) => f.nom === famille)?.couleur ?? '#475569'
}

type Def = Omit<Categorie, 'ordre'>

export const CATEGORIES_PAR_DEFAUT: Def[] = [
  // Affichage
  { id: 'moniteur-led', nom: 'Moniteur LED', famille: 'Affichage', quantiteParDefaut: false,
    champs: [modele('Ex. : moniteur de contrôle 24"'), c('taille', 'Taille (pouces)', 'Ex. : 24'), c('resolution', 'Résolution (pixels)', 'Ex. : 1920 × 1080'), serie] },
  { id: 'dalle-led', nom: 'Dalle LED', famille: 'Affichage', quantiteParDefaut: false,
    champs: [modele('Ex. : P3.91 outdoor'), c('pitch', 'Pitch (mm)', 'Ex. : 3.91'), c('dimensions', 'Dimensions L × H (mm)', 'Ex. : 500 × 1000'), c('resolution', 'Résolution L × H (pixels)', 'Ex. : 128 × 256'), serie] },
  { id: 'module-led', nom: 'Module LED', famille: 'Affichage', quantiteParDefaut: true,
    champs: [c('compatible', 'Dalle compatible', 'Ex. : P3.91 outdoor'), c('resolution', 'Résolution (pixels)', 'Ex. : 64 × 64'), c('lot', 'Lot / date de fabrication', 'Ex. : 2025-03')] },

  // Pilotage vidéo
  { id: 'processeur', nom: 'Processeur Novastar', famille: 'Pilotage vidéo', quantiteParDefaut: false,
    champs: [modele('Ex. : MCTRL4K, VX1000'), serie, c('firmware', 'Version firmware', 'Ex. : V4.6')] },
  { id: 'carte-reception', nom: 'Carte de réception', famille: 'Pilotage vidéo', quantiteParDefaut: true,
    champs: [modele('Ex. : A8s, A10s Pro'), c('firmware', 'Version firmware', 'Ex. : V4.6')] },
  { id: 'hub', nom: 'Hub', famille: 'Pilotage vidéo', quantiteParDefaut: false,
    champs: [modele('Ex. : HUB75'), serie] },
  { id: 'cvt', nom: 'CVT (convertisseur fibre)', famille: 'Pilotage vidéo', quantiteParDefaut: false,
    champs: [modele('Ex. : CVT4K-S'), serie] },
  { id: 'matrice', nom: 'Matrice vidéo', famille: 'Pilotage vidéo', quantiteParDefaut: false,
    champs: [modele(), c('es', 'Entrées / sorties', 'Ex. : 8 × 8'), serie] },

  // Câblage
  { id: 'strap-rj45', nom: 'Strap RJ45', famille: 'Câblage data & vidéo', quantiteParDefaut: true,
    champs: [c('longueur', 'Longueur (m)', 'Ex. : 0,5'), c('cat', 'Catégorie', 'Ex. : Cat6')] },
  { id: 'longueur-rj45', nom: 'Longueur RJ45', famille: 'Câblage data & vidéo', quantiteParDefaut: false,
    champs: [longueur, c('connecteurs', 'Connecteurs', 'Ex. : etherCON / RJ45'), c('cat', 'Catégorie', 'Ex. : Cat6')] },
  { id: 'fibre', nom: 'Fibre optique', famille: 'Câblage data & vidéo', quantiteParDefaut: false,
    champs: [longueur, c('type', 'Type', 'Monomode / multimode'), c('connecteurs', 'Connecteurs', 'Ex. : LC, opticalCON')] },
  { id: 'cable-video', nom: 'Câble vidéo', famille: 'Câblage data & vidéo', quantiteParDefaut: false,
    champs: [c('type', 'Type', 'HDMI, DVI, DisplayPort, SDI…'), longueur] },

  // Électrique
  { id: 'alimentation', nom: 'Alimentation', famille: 'Électrique', quantiteParDefaut: true,
    champs: [modele(), c('puissance', 'Puissance (W)', 'Ex. : 200')] },
  { id: 'main-power', nom: 'Câble main power', famille: 'Électrique', quantiteParDefaut: false,
    champs: [longueur, c('connecteurs', 'Connecteurs', 'Ex. : powerCON TRUE1')] },
  { id: 'strap-power', nom: 'Strap powerCON / TRUE1', famille: 'Électrique', quantiteParDefaut: true,
    champs: [c('type', 'Type', 'powerCON / TRUE1'), c('longueur', 'Longueur (m)', 'Ex. : 0,5')] },
  { id: 'cable-p17', nom: 'Câble 32 / 63 A', famille: 'Électrique', quantiteParDefaut: false,
    champs: [c('amperage', 'Ampérage', '32 A ou 63 A'), c('phase', 'Mono / Tri', 'Ex. : Tri'), longueur] },
  { id: 'champignon', nom: 'Champignon (coffret)', famille: 'Électrique', quantiteParDefaut: false,
    champs: [c('entree', 'Calibre entrée', 'Ex. : 63 A tri'), c('sorties', 'Sorties', 'Ex. : 6 × 16 A'), serie] },
  { id: 'disjoncteur', nom: 'Disjoncteur', famille: 'Électrique', quantiteParDefaut: false,
    champs: [c('calibre', 'Calibre (A)', 'Ex. : 16'), c('differentiel', 'Différentiel (mA)', 'Ex. : 30')] },

  // Informatique
  { id: 'ordinateur', nom: 'Ordinateur', famille: 'Informatique', quantiteParDefaut: false,
    champs: [modele(), serie, c('logiciels', 'Logiciels installés', 'Ex. : NovaLCT, Resolume')] },
  { id: 'clavier', nom: 'Clavier', famille: 'Informatique', quantiteParDefaut: false,
    champs: [modele(), c('connexion', 'Filaire / sans fil')] },
  { id: 'souris', nom: 'Souris', famille: 'Informatique', quantiteParDefaut: false,
    champs: [modele(), c('connexion', 'Filaire / sans fil')] },
]

// Résolution calculée automatiquement à partir des dimensions et du pitch
export function calculerResolution(dimensions: string, pitch: string): string | null {
  const p = parseFloat(pitch.replace(',', '.'))
  const m = dimensions.replace(/\s/g, '').match(/^(\d+(?:[.,]\d+)?)[x×*](\d+(?:[.,]\d+)?)$/i)
  if (!p || !m) return null
  const w = Math.round(parseFloat(m[1].replace(',', '.')) / p)
  const h = Math.round(parseFloat(m[2].replace(',', '.')) / p)
  return `${w} × ${h}`
}
