import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import { onAuthStateChanged, signInAnonymously, signOut, type User } from 'firebase/auth'
import { doc, getDoc, onSnapshot, setDoc } from 'firebase/firestore'
import { auth, db } from '../firebase'
import type { Role, Utilisateur } from '../types'

interface AuthState {
  firebaseUser: User | null
  profil: Utilisateur | null
  loading: boolean
  anonyme: boolean
  logout: () => Promise<void>
  continuerSansCompte: (nom: string) => Promise<void>
  changerNomAnonyme: (nom: string) => void
}

const Ctx = createContext<AuthState | null>(null)
const CLE_NOM = 'nomDeclarant'

function nomLocal(): string {
  try { return localStorage.getItem(CLE_NOM) ?? '' } catch { return '' }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [firebaseUser, setFirebaseUser] = useState<User | null>(null)
  const [profil, setProfil] = useState<Utilisateur | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let unsubProfil: (() => void) | undefined
    const unsub = onAuthStateChanged(auth, async (u) => {
      unsubProfil?.()
      unsubProfil = undefined
      setFirebaseUser(u)
      if (!u) {
        setProfil(null)
        setLoading(false)
        return
      }
      // Sans compte : identité = nom saisi sur le téléphone
      if (u.isAnonymous) {
        setProfil({ uid: u.uid, nom: nomLocal() || 'Anonyme', email: '', role: 'anonyme', actif: true })
        setLoading(false)
        return
      }
      const ref = doc(db, 'utilisateurs', u.uid)
      try {
        const snap = await getDoc(ref)
        if (!snap.exists()) {
          // Premier compte équipe : technicien, un admin pourra le promouvoir
          await setDoc(ref, {
            nom: u.displayName || (u.email ? u.email.split('@')[0] : 'Utilisateur'),
            email: u.email || '',
            role: 'technicien',
            actif: true,
          })
        }
      } catch (e) {
        console.error(e)
      }
      unsubProfil = onSnapshot(ref, (s) => {
        setProfil(s.exists() ? ({ uid: u.uid, ...(s.data() as Omit<Utilisateur, 'uid'>) }) : null)
        setLoading(false)
      }, () => setLoading(false))
    })
    return () => {
      unsub()
      unsubProfil?.()
    }
  }, [])

  const continuerSansCompte = async (nom: string) => {
    try { localStorage.setItem(CLE_NOM, nom) } catch { /* rien */ }
    await signInAnonymously(auth)
  }
  const changerNomAnonyme = (nom: string) => {
    try { localStorage.setItem(CLE_NOM, nom) } catch { /* rien */ }
    setProfil((p) => (p && p.role === 'anonyme' ? { ...p, nom } : p))
  }

  return (
    <Ctx.Provider value={{
      firebaseUser, profil, loading, anonyme: profil?.role === 'anonyme',
      logout: () => signOut(auth), continuerSansCompte, changerNomAnonyme,
    }}>
      {children}
    </Ctx.Provider>
  )
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
