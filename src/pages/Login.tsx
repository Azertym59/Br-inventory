import { useState, type FormEvent } from 'react'
import {
  createUserWithEmailAndPassword, GoogleAuthProvider, sendPasswordResetEmail,
  signInWithEmailAndPassword, signInWithPopup, updateProfile,
} from 'firebase/auth'
import { auth } from '../firebase'
import { useAuth } from '../lib/auth'
import { Icon } from '../components/Icon'

const MESSAGES: Record<string, string> = {
  'auth/invalid-credential': 'Email ou mot de passe incorrect.',
  'auth/email-already-in-use': 'Un compte existe déjà avec cet email.',
  'auth/weak-password': 'Mot de passe trop court (6 caractères minimum).',
  'auth/invalid-email': 'Adresse email invalide.',
  'auth/network-request-failed': 'Pas de connexion réseau.',
  'auth/admin-restricted-operation': 'L’accès sans compte n’est pas activé (Firebase > Authentication > Anonyme).',
  'auth/operation-not-allowed': 'Ce mode de connexion n’est pas activé dans Firebase.',
}

export default function Login() {
  const { continuerSansCompte } = useAuth()
  const [vue, setVue] = useState<'accueil' | 'equipe'>('accueil')
  const [mode, setMode] = useState<'connexion' | 'creation'>('connexion')
  const [nomAnonyme, setNomAnonyme] = useState(() => { try { return localStorage.getItem('nomDeclarant') ?? '' } catch { return '' } })
  const [nom, setNom] = useState('')
  const [email, setEmail] = useState('')
  const [mdp, setMdp] = useState('')
  const [err, setErr] = useState('')
  const [info, setInfo] = useState('')
  const [busy, setBusy] = useState(false)
  const depuisQr = window.location.pathname.startsWith('/m/')

  const erreur = (x: unknown, defaut: string) => {
    const code = (x as { code?: string }).code ?? ''
    if (code !== 'auth/popup-closed-by-user') setErr(MESSAGES[code] ?? defaut)
  }

  const sansCompte = async (e: FormEvent) => {
    e.preventDefault()
    if (nomAnonyme.trim().length < 2) { setErr('Indique ton prénom et ton nom.'); return }
    setErr(''); setBusy(true)
    try { await continuerSansCompte(nomAnonyme.trim()) } catch (x) { erreur(x, 'Impossible de continuer.') } finally { setBusy(false) }
  }

  const go = async (e: FormEvent) => {
    e.preventDefault()
    setErr(''); setInfo(''); setBusy(true)
    try {
      if (mode === 'connexion') await signInWithEmailAndPassword(auth, email.trim(), mdp)
      else {
        try { sessionStorage.setItem('nomInscription', nom.trim()) } catch { /* rien */ }
        const cred = await createUserWithEmailAndPassword(auth, email.trim(), mdp)
        if (nom.trim()) await updateProfile(cred.user, { displayName: nom.trim() })
      }
    } catch (x) { erreur(x, 'Connexion impossible.') } finally { setBusy(false) }
  }

  const google = async () => {
    setErr('')
    try { await signInWithPopup(auth, new GoogleAuthProvider()) } catch (x) { erreur(x, 'Connexion Google impossible.') }
  }

  const oubli = async () => {
    setErr(''); setInfo('')
    if (!email.trim()) { setErr('Saisis ton email d’abord.'); return }
    try { await sendPasswordResetEmail(auth, email.trim()); setInfo('Email de réinitialisation envoyé.') } catch { setErr('Envoi impossible.') }
  }

  return (
    <div className="page" style={{ minHeight: '100dvh', justifyContent: 'center', paddingBottom: 40 }}>
      <div className="stack" style={{ gap: 6, alignItems: 'flex-start' }}>
        <div className="icon-btn" style={{ background: 'var(--accent)', borderColor: 'var(--accent)', color: '#fff', width: 56, height: 56, borderRadius: 18 }}>
          <Icon name="scan" size={30} stroke={2.2} />
        </div>
        <div className="eyebrow" style={{ marginTop: 12 }}>BR · Suivi matériel</div>
        <h1 className="h1">{vue === 'accueil' ? 'Bienvenue' : mode === 'connexion' ? 'Connexion équipe' : 'Créer un compte équipe'}</h1>
      </div>

      {vue === 'accueil' ? (
        <>
          <form className="card stack" onSubmit={sansCompte}>
            <div className="stack-s" style={{ gap: 4 }}>
              <div style={{ fontWeight: 800, fontSize: 16 }}>{depuisQr ? 'Signaler ou inventorier ce matériel' : 'Signaler un problème, faire un inventaire'}</div>
              <div className="muted">Sans mot de passe : ton nom est enregistré avec chaque action, avec le lieu et l'heure.</div>
            </div>
            <label className="field">Prénom et nom
              <input className="input" value={nomAnonyme} onChange={(e) => setNomAnonyme(e.target.value)} autoComplete="name" placeholder="Ex. : Léa Martin" />
            </label>
            {err && <div className="note err">{err}</div>}
            <button className="btn primary block" disabled={busy}>Continuer</button>
          </form>
          <button type="button" className="btn block" onClick={() => { setErr(''); setVue('equipe') }}>
            <Icon name="user" size={20} />Je suis technicien ou admin
          </button>
        </>
      ) : (
        <>
          <form className="stack" onSubmit={go}>
            {mode === 'creation' && (
              <label className="field">Nom et prénom
                <input className="input" value={nom} onChange={(e) => setNom(e.target.value)} autoComplete="name" required />
              </label>
            )}
            <label className="field">Email
              <input className="input" type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" required />
            </label>
            <label className="field">Mot de passe
              <input className="input" type="password" value={mdp} onChange={(e) => setMdp(e.target.value)}
                autoComplete={mode === 'connexion' ? 'current-password' : 'new-password'} required minLength={6} />
            </label>
            {err && <div className="note err">{err}</div>}
            {info && <div className="note ok">{info}</div>}
            <button className="btn primary block" disabled={busy}>{mode === 'connexion' ? 'Se connecter' : 'Créer mon compte'}</button>
            <button type="button" className="btn block" onClick={google}>Continuer avec Google</button>
          </form>
          <div className="row between" style={{ flexWrap: 'wrap' }}>
            <button type="button" className="btn small" style={{ border: 0, background: 'none', color: 'var(--accent-ink)' }}
              onClick={() => setMode(mode === 'connexion' ? 'creation' : 'connexion')}>
              {mode === 'connexion' ? 'Créer un compte' : 'J’ai déjà un compte'}
            </button>
            {mode === 'connexion' && <button type="button" className="btn small" style={{ border: 0, background: 'none', color: 'var(--muted)' }} onClick={oubli}>Mot de passe oublié</button>}
          </div>
          <button type="button" className="btn small" style={{ border: 0, background: 'none' }} onClick={() => { setErr(''); setVue('accueil') }}>
            <Icon name="back" size={18} />Continuer sans compte
          </button>
        </>
      )}
    </div>
  )
}
