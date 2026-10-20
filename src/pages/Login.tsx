import { useState, type FormEvent } from 'react'
import {
  createUserWithEmailAndPassword, GoogleAuthProvider, sendPasswordResetEmail,
  signInWithEmailAndPassword, signInWithPopup, updateProfile,
} from 'firebase/auth'
import { auth } from '../firebase'
import { Icon } from '../components/Icon'

const MESSAGES: Record<string, string> = {
  'auth/invalid-credential': 'Email ou mot de passe incorrect.',
  'auth/email-already-in-use': 'Un compte existe déjà avec cet email.',
  'auth/weak-password': 'Mot de passe trop court (6 caractères minimum).',
  'auth/invalid-email': 'Adresse email invalide.',
  'auth/network-request-failed': 'Pas de connexion réseau.',
}

export default function Login() {
  const [mode, setMode] = useState<'connexion' | 'creation'>('connexion')
  const [nom, setNom] = useState('')
  const [email, setEmail] = useState('')
  const [mdp, setMdp] = useState('')
  const [err, setErr] = useState('')
  const [info, setInfo] = useState('')
  const [busy, setBusy] = useState(false)

  const go = async (e: FormEvent) => {
    e.preventDefault()
    setErr(''); setInfo(''); setBusy(true)
    try {
      if (mode === 'connexion') await signInWithEmailAndPassword(auth, email.trim(), mdp)
      else {
        const cred = await createUserWithEmailAndPassword(auth, email.trim(), mdp)
        if (nom.trim()) await updateProfile(cred.user, { displayName: nom.trim() })
      }
    } catch (x) {
      const code = (x as { code?: string }).code ?? ''
      setErr(MESSAGES[code] ?? 'Connexion impossible.')
    } finally { setBusy(false) }
  }

  const google = async () => {
    setErr('')
    try { await signInWithPopup(auth, new GoogleAuthProvider()) } catch (x) {
      const code = (x as { code?: string }).code ?? ''
      if (code !== 'auth/popup-closed-by-user') setErr(MESSAGES[code] ?? 'Connexion Google impossible.')
    }
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
        <h1 className="h1">{mode === 'connexion' ? 'Connexion' : 'Créer un compte'}</h1>
      </div>
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
      <div className="row between">
        <button type="button" className="btn small" style={{ border: 0, background: 'none', color: 'var(--accent-ink)' }}
          onClick={() => setMode(mode === 'connexion' ? 'creation' : 'connexion')}>
          {mode === 'connexion' ? 'Créer un compte' : 'J’ai déjà un compte'}
        </button>
        {mode === 'connexion' && <button type="button" className="btn small" style={{ border: 0, background: 'none', color: 'var(--muted)' }} onClick={oubli}>Mot de passe oublié</button>}
      </div>
    </div>
  )
}
