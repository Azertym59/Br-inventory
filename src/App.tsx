import { Navigate, Route, Routes } from 'react-router-dom'
import { AuthProvider, useAuth } from './lib/auth'
import { DataProvider } from './lib/data'
import { Chargement, ToastHost } from './components/ui'
import Login from './pages/Login'
import Accueil from './pages/Accueil'
import Lieux from './pages/Lieux'
import LieuDetail from './pages/LieuDetail'
import Scan from './pages/Scan'
import Fiche from './pages/Fiche'
import Signalement from './pages/Signalement'
import Tickets from './pages/Tickets'
import TicketDetail from './pages/TicketDetail'
import Inventaire from './pages/Inventaire'
import Etiquettes from './pages/Etiquettes'
import Ajout from './pages/Ajout'
import Admin from './pages/Admin'
import Validation from './pages/Validation'

function Routeur() {
  const { profil, loading, logout, anonyme } = useAuth()
  if (loading) return <Chargement />
  if (!profil) return <Login />
  if (!profil.actif) {
    return (
      <div className="page center stack" style={{ textAlign: 'center' }}>
        <h1 className="h1">Compte désactivé</h1>
        <p className="muted">Demandez à un administrateur de réactiver votre accès.</p>
        <button className="btn" onClick={logout}>Se déconnecter</button>
      </div>
    )
  }
  return (
    <DataProvider>
      <Routes>
        <Route path="/" element={<Accueil />} />
        <Route path="/lieux" element={<Lieux />} />
        <Route path="/lieux/:id" element={<LieuDetail />} />
        <Route path="/scan" element={<Scan />} />
        <Route path="/m/:ref" element={<Fiche />} />
        <Route path="/m/:ref/signaler" element={<Signalement />} />
        <Route path="/inventaire/:lieuId" element={<Inventaire />} />
        {!anonyme && <>
          <Route path="/tickets" element={<Tickets />} />
          <Route path="/tickets/:id" element={<TicketDetail />} />
          <Route path="/etiquettes" element={<Etiquettes />} />
          <Route path="/ajout" element={<Ajout />} />
          <Route path="/admin" element={<Admin />} />
        </>}
        {profil.role === 'admin' && <Route path="/validation" element={<Validation />} />}
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </DataProvider>
  )
}

export default function App() {
  return (
    <AuthProvider>
      <div className="app">
        <Routeur />
        <ToastHost />
      </div>
    </AuthProvider>
  )
}
