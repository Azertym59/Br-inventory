import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import { collection, onSnapshot, query, where } from 'firebase/firestore'
import { db } from '../firebase'
import type { Categorie, Lieu, Materiel, Modele, PropositionDeplacement, SignalementAValider, Ticket } from '../types'
import { useAuth } from './auth'

interface DataState {
  pret: boolean
  lieux: Lieu[]
  categories: Categorie[]
  modeles: Modele[]
  materiel: Materiel[]
  ticketsActifs: Ticket[]
  signalementsAValider: SignalementAValider[]
  propositionsAValider: PropositionDeplacement[]
  lieuCourant: Lieu | null
  choisirLieu: (id: string | null) => void
}

const Ctx = createContext<DataState | null>(null)

function useCollection<T>(path: string, enabled: boolean, idKey = 'id', onlyActive?: [string, string[]]): [T[], boolean] {
  const [items, setItems] = useState<T[]>([])
  const [loaded, setLoaded] = useState(false)
  useEffect(() => {
    if (!enabled) return
    const ref = collection(db, path)
    const q = onlyActive ? query(ref, where(onlyActive[0], 'in', onlyActive[1])) : ref
    return onSnapshot(q, (snap) => {
      setItems(snap.docs.map((d) => ({ [idKey]: d.id, ...d.data() }) as T))
      setLoaded(true)
    }, (e) => {
      console.error(path, e)
      setLoaded(true)
    })
  }, [path, enabled, idKey, onlyActive?.[0]]) // eslint-disable-line react-hooks/exhaustive-deps
  return [items, loaded]
}

const ACTIFS: [string, string[]] = ['statut', ['ouvert', 'en_cours']]
const A_VALIDER: [string, string[]] = ['statut', ['a_valider']]

export function DataProvider({ children }: { children: ReactNode }) {
  const { profil } = useAuth()
  const on = !!profil?.actif
  const membre = on && profil?.role !== 'anonyme'
  const admin = on && profil?.role === 'admin'
  const [lieux, l1] = useCollection<Lieu>('lieux', on)
  const [categories, l2] = useCollection<Categorie>('categories', on)
  const [modeles] = useCollection<Modele>('modeles', membre)
  const [materiel, l3] = useCollection<Materiel>('materiel', on, 'ref')
  const [ticketsActifs] = useCollection<Ticket>('tickets', membre, 'id', ACTIFS)
  const [signalementsAValider] = useCollection<SignalementAValider>('signalements', admin, 'id', A_VALIDER)
  const [propositionsAValider] = useCollection<PropositionDeplacement>('propositions', admin, 'id', A_VALIDER)
  const [lieuId, setLieuId] = useState<string | null>(() => {
    try { return localStorage.getItem('lieuCourant') } catch { return null }
  })

  const value = useMemo<DataState>(() => {
    const tri = <T extends { nom: string }>(a: T[]) => [...a].sort((x, y) => x.nom.localeCompare(y.nom, 'fr'))
    const lieuxTries = [...lieux].filter((l) => l.actif !== false)
      .sort((a, b) => (a.type === 'depot' ? -1 : 0) - (b.type === 'depot' ? -1 : 0) || a.nom.localeCompare(b.nom, 'fr'))
    return {
      pret: l1 && l2 && l3,
      lieux: lieuxTries,
      categories: [...categories].sort((a, b) => (a.ordre ?? 0) - (b.ordre ?? 0)),
      modeles: tri(modeles),
      materiel: [...materiel].sort((a, b) => a.ref.localeCompare(b.ref)),
      ticketsActifs: [...ticketsActifs].sort((a, b) => (b.creeLe?.toMillis() ?? Date.now()) - (a.creeLe?.toMillis() ?? Date.now())),
      signalementsAValider,
      propositionsAValider,
      lieuCourant: lieuxTries.find((l) => l.id === lieuId) ?? null,
      choisirLieu: (id) => {
        setLieuId(id)
        try { if (id) localStorage.setItem('lieuCourant', id); else localStorage.removeItem('lieuCourant') } catch { /* stockage indisponible */ }
      },
    }
  }, [lieux, categories, modeles, materiel, ticketsActifs, signalementsAValider, propositionsAValider, lieuId, l1, l2, l3])

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}

export function useData(): DataState {
  const v = useContext(Ctx)
  if (!v) throw new Error('useData hors DataProvider')
  return v
}
