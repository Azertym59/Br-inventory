import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { get } from './api'
import { suivreAttente, vider } from './outbox'
import { brancherDonnees } from './actions'
import type { Categorie, Lieu, Materiel, Modele, PropositionDeplacement, SignalementAValider, Ticket } from '../types'
import { useAuth } from './auth'

interface Donnees {
  lieux: Lieu[]
  categories: Categorie[]
  modeles: Modele[]
  materiel: Materiel[]
  ticketsActifs: Ticket[]
  signalementsAValider: SignalementAValider[]
  propositionsAValider: PropositionDeplacement[]
}

interface DataState extends Donnees {
  pret: boolean
  horsLigne: boolean
  enAttente: number
  lieuCourant: Lieu | null
  choisirLieu: (id: string | null) => void
  rafraichir: () => Promise<void>
  // Mise à jour immédiate à l'écran (avant la réponse du serveur ou hors ligne)
  modifierLocal: (ref: string, champs: Partial<Materiel>) => void
}

const VIDE: Donnees = { lieux: [], categories: [], modeles: [], materiel: [], ticketsActifs: [], signalementsAValider: [], propositionsAValider: [] }
const Ctx = createContext<DataState | null>(null)
const CLE_CACHE = 'br-donnees'

function lireCache(uid: string): Donnees | null {
  try {
    const c = JSON.parse(localStorage.getItem(CLE_CACHE) ?? 'null') as { uid: string; d: Donnees } | null
    return c && c.uid === uid ? c.d : null
  } catch { return null }
}

export function DataProvider({ children }: { children: ReactNode }) {
  const { profil } = useAuth()
  const uid = profil?.uid ?? ''
  const [d, setD] = useState<Donnees>(() => (uid && lireCache(uid)) || VIDE)
  const [pret, setPret] = useState(() => !!(uid && lireCache(uid)))
  const [horsLigne, setHorsLigne] = useState(false)
  const [attente, setAttente] = useState(0)
  const enCours = useRef(false)
  const [lieuId, setLieuId] = useState<string | null>(() => {
    try { return localStorage.getItem('lieuCourant') } catch { return null }
  })

  const rafraichir = useCallback(async () => {
    if (!uid || enCours.current) return
    enCours.current = true
    try {
      await vider()
      const n = await get<Donnees>('/donnees')
      setD(n)
      setPret(true)
      setHorsLigne(false)
      try { localStorage.setItem(CLE_CACHE, JSON.stringify({ uid, d: n })) } catch { /* trop gros ou indisponible */ }
    } catch {
      setHorsLigne(true)
      setPret(true)
    } finally {
      enCours.current = false
    }
  }, [uid])

  // Chargement initial, puis rafraîchissement régulier et au retour sur l'app
  useEffect(() => {
    if (!uid) return
    void rafraichir()
    const t = setInterval(() => { if (document.visibilityState === 'visible') void rafraichir() }, 20_000)
    const vis = () => { if (document.visibilityState === 'visible') void rafraichir() }
    document.addEventListener('visibilitychange', vis)
    window.addEventListener('online', vis)
    return () => { clearInterval(t); document.removeEventListener('visibilitychange', vis); window.removeEventListener('online', vis) }
  }, [uid, rafraichir])

  useEffect(() => suivreAttente(setAttente), [])

  const modifierLocal = useCallback((ref: string, champs: Partial<Materiel>) =>
    setD((x) => ({ ...x, materiel: x.materiel.map((m) => (m.ref === ref ? { ...m, ...champs } : m)) })), [])
  useEffect(() => { brancherDonnees(() => { void rafraichir() }, modifierLocal) }, [rafraichir, modifierLocal])

  const value = useMemo<DataState>(() => {
    const lieuxTries = [...d.lieux].filter((l) => l.actif !== false)
      .sort((a, b) => (a.type === 'depot' ? -1 : 0) - (b.type === 'depot' ? -1 : 0) || a.nom.localeCompare(b.nom, 'fr'))
    return {
      ...d,
      lieux: lieuxTries,
      pret,
      horsLigne,
      enAttente: attente,
      lieuCourant: lieuxTries.find((l) => l.id === lieuId) ?? null,
      choisirLieu: (id) => {
        setLieuId(id)
        try { if (id) localStorage.setItem('lieuCourant', id); else localStorage.removeItem('lieuCourant') } catch { /* rien */ }
      },
      rafraichir,
      modifierLocal,
    }
  }, [d, pret, horsLigne, attente, lieuId, rafraichir, modifierLocal])

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}

export function useData(): DataState {
  const v = useContext(Ctx)
  if (!v) throw new Error('useData hors DataProvider')
  return v
}
