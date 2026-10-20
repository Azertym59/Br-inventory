import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react'
import { get, HorsLigne, patch, post, quandDeconnecte } from './api'
import type { Role, Utilisateur } from '../types'

interface AuthState {
  profil: Utilisateur | null
  loading: boolean
  configurationRequise: boolean
  anonyme: boolean
  connexion: (email: string, mdp: string) => Promise<void>
  premierAdmin: (nom: string, email: string, mdp: string) => Promise<void>
  continuerSansCompte: (nom: string) => Promise<void>
  changerNomAnonyme: (nom: string) => Promise<void>
  logout: () => Promise<void>
  recharger: () => Promise<void>
}

const Ctx = createContext<AuthState | null>(null)
const CLE_PROFIL = 'br-profil'

interface Session { user: { id: string; nom: string; email: string | null; role: Role; actif: boolean } | null; configurationRequise: boolean }

function versProfil(u: Session['user']): Utilisateur | null {
  return u ? { uid: u.id, nom: u.nom, email: u.email ?? '', role: u.role, actif: u.actif } : null
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [profil, setProfil] = useState<Utilisateur | null>(null)
  const [loading, setLoading] = useState(true)
  const [configurationRequise, setConfig] = useState(false)

  const appliquer = (p: Utilisateur | null) => {
    setProfil(p)
    try { if (p) localStorage.setItem(CLE_PROFIL, JSON.stringify(p)); else localStorage.removeItem(CLE_PROFIL) } catch { /* rien */ }
  }

  const recharger = useCallback(async () => {
    try {
      const s = await get<Session>('/session')
      appliquer(versProfil(s.user))
      setConfig(s.configurationRequise)
    } catch (e) {
      // Hors ligne : on garde la dernière session connue pour pouvoir scanner quand même
      if (e instanceof HorsLigne) {
        try { const p = localStorage.getItem(CLE_PROFIL); if (p) setProfil(JSON.parse(p) as Utilisateur) } catch { /* rien */ }
      }
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    quandDeconnecte(() => { appliquer(null) })
    void recharger()
  }, [recharger])

  const value: AuthState = {
    profil, loading, configurationRequise, anonyme: profil?.role === 'anonyme',
    connexion: async (email, mdp) => { await post('/auth/connexion', { email, mdp }); await recharger() },
    premierAdmin: async (nom, email, mdp) => { await post('/auth/premier-admin', { nom, email, mdp }); await recharger() },
    continuerSansCompte: async (nom) => {
      try { localStorage.setItem('nomDeclarant', nom) } catch { /* rien */ }
      await post('/auth/anonyme', { nom })
      await recharger()
    },
    changerNomAnonyme: async (nom) => {
      await patch('/moi', { nom })
      try { localStorage.setItem('nomDeclarant', nom) } catch { /* rien */ }
      await recharger()
    },
    logout: async () => {
      await post('/auth/deconnexion').catch(() => {})
      appliquer(null)
    },
    recharger,
  }

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}

export function useAuth(): AuthState {
  const v = useContext(Ctx)
  if (!v) throw new Error('useAuth hors AuthProvider')
  return v
}

const RANK: Record<Role, number> = { anonyme: 0, technicien: 1, admin: 2 }
export function aLeRole(profil: Utilisateur | null, role: Role): boolean {
  return !!profil && profil.actif && RANK[profil.role] >= RANK[role]
}
