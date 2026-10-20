import { useState, type FormEvent } from 'react'
import { messageErreur } from '../lib/api'
import { useAuth } from '../lib/auth'
import { Icon } from '../components/Icon'

export default function Login() {
  const { configurationRequise, connexion, premierAdmin, continuerSansCompte } = useAuth()
  const [vue, setVue] = useState<'accueil' | 'equipe'>('accueil')
  const [nomAnonyme, setNomAnonyme] = useState(() => { try { return localStorage.getItem('nomDeclarant') ?? '' } catch { return '' } })
  const [nom, setNom] = useState('')
  const [email, setEmail] = useState('')
  const [mdp, setMdp] = useState('')
  const [mdp2, setMdp2] = useState('')
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)
  const depuisQr = window.location.pathname.startsWith('/m/')

  const lancer = async (f: () => Promise<void>) => {
    setErr(''); setBusy(true)
    try { await f() } catch (x) { setErr(messageErreur(x)) } finally { setBusy(false) }
  }

  const entete = (titre: string) => (
    <div className="stack" style={{ gap: 6, alignItems: 'flex-start' }}>
      <div className="icon-btn" style={{ background: 'var(--accent)', borderColor: 'var(--accent)', color: '#fff', width: 56, height: 56, borderRadius: 18 }}>
        <Icon name="scan" size={30} stroke={2.2} />
      </div>
      <div className="eyebrow" style={{ marginTop: 12 }}>BR · Suivi matériel</div>
      <h1 className="h1">{titre}</h1>
    </div>
  )

  // Tout premier lancement : création du compte administrateur
  if (configurationRequise) {
    return (
      <div className="page" style={{ minHeight: '100dvh', justifyContent: 'center', paddingBottom: 40 }}>
        {entete('Créer le compte administrateur')}
        <div className="note info">Première ouverture de l'application : ce compte aura tous les droits. Tu créeras ensuite les comptes de l'équipe depuis « Équipe ».</div>
        <form className="stack" onSubmit={(e: FormEvent) => {
          e.preventDefault()
          if (mdp !== mdp2) { setErr('Les deux mots de passe sont différents'); return }
          void lancer(() => premierAdmin(nom.trim(), email.trim(), mdp))
        }}>
          <label className="field">Prénom et nom<input className="input" value={nom} onChange={(e) => setNom(e.target.value)} autoComplete="name" required /></label>
          <label className="field">Email<input className="input" type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" required /></label>
          <label className="field">Mot de passe (8 caractères minimum)<input className="input" type="password" value={mdp} onChange={(e) => setMdp(e.target.value)} autoComplete="new-password" required minLength={8} /></label>
          <label className="field">Confirmer le mot de passe<input className="input" type="password" value={mdp2} onChange={(e) => setMdp2(e.target.value)} autoComplete="new-password" required minLength={8} /></label>
          {err && <div className="note err">{err}</div>}
          <button className="btn primary block" disabled={busy}>Créer le compte administrateur</button>
        </form>
      </div>
    )
  }

  return (
    <div className="page" style={{ minHeight: '100dvh', justifyContent: 'center', paddingBottom: 40 }}>
      {entete(vue === 'accueil' ? 'Bienvenue' : 'Connexion équipe')}

      {vue === 'accueil' ? (
        <>
          <form className="card stack" onSubmit={(e: FormEvent) => {
            e.preventDefault()
            if (nomAnonyme.trim().length < 2) { setErr('Indique ton prénom et ton nom.'); return }
            void lancer(() => continuerSansCompte(nomAnonyme.trim()))
          }}>
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
          <form className="stack" onSubmit={(e: FormEvent) => { e.preventDefault(); void lancer(() => connexion(email.trim(), mdp)) }}>
            <label className="field">Email
              <input className="input" type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" required />
            </label>
            <label className="field">Mot de passe
              <input className="input" type="password" value={mdp} onChange={(e) => setMdp(e.target.value)} autoComplete="current-password" required />
            </label>
            {err && <div className="note err">{err}</div>}
            <button className="btn primary block" disabled={busy}>Se connecter</button>
          </form>
          <p className="muted small" style={{ lineHeight: 1.5 }}>Pas de compte ou mot de passe oublié ? Demande à un administrateur : il crée les comptes et peut réinitialiser ton mot de passe.</p>
          <button type="button" className="btn small" style={{ border: 0, background: 'none' }} onClick={() => { setErr(''); setVue('accueil') }}>
            <Icon name="back" size={18} />Continuer sans compte
          </button>
        </>
      )}
    </div>
  )
}
