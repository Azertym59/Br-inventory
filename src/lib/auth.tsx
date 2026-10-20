import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import { onAuthStateChanged, signOut, type User } from 'firebase/auth'
import { doc, getDoc, onSnapshot, setDoc } from 'firebase/firestore'
import { auth, db } from '../firebase'
import type { Role, Utilisateur } from '../types'

interface AuthState {
  firebaseUser: User | null
  profil: Utilisateur | null
  loading: boolean
  logout: () => Promise<void>
}

const Ctx = createContext<AuthState>({ firebaseUser: null, profil: null, loading: true, logout: async () => {} })

export function AuthProvider({ children }: { children: ReactNode }) {
  const [firebaseUser, setFirebaseUser] = useState<User | null>(null)
  const [profil, setProfil] = useState<Utilisateur | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let unsubProfil: (() => void) | undefined
    const unsub = onAuthStateChanged(auth, async (u) => {
      unsubProfil?.()
      setFirebaseUser(u)
      if (!u) {
        setProfil(null)
        setLoading(false)
        return
      }
      const ref = doc(db, 'utilisateurs', u.uid)
      try {
        const snap = await getDoc(ref)
        if (!snap.exists()) {
          // Première connexion : fiche créée en technicien, un admin pourra la promouvoir
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

  return (
    <Ctx.Provider value={{ firebaseUser, profil, loading, logout: () => signOut(auth) }}>
      {children}
    </Ctx.Provider>
  )
}

export const useAuth = () => useContext(Ctx)

const RANK: Record<Role, number> = { technicien: 1, responsable: 2, admin: 3 }
export function aLeRole(profil: Utilisateur | null, role: Role): boolean {
  return !!profil && RANK[profil.role] >= RANK[role]
}
