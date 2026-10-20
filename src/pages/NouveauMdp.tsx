import { useEffect, useState, type FormEvent } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { get, messageErreur, post } from '../lib/api'
import { useAuth } from '../lib/auth'
import { Chargement, toast } from '../components/ui'
import { Icon } from '../components/Icon'

interface Lien { nom: string; email: string; type: 'invitation' | 'reinitialisation' }

// Page ouverte depuis un email (invitation ou mot de passe oublié) : /mdp/<jeton>
export default function NouveauMdp() {
  const { jeton = '' } = useParams()
  const { recharger } = useAuth()
  const navigate = useNavigate()
  const [lien, setLien] = useState<Lien | null>(null)
  const [invalide, setInvalide] = useState('')
  const [mdp, setMdp] = useState('')
  const [mdp2, setMdp2] = useState('')
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    get<Lien>(`/auth/jeton/${encodeURIComponent(jeton)}`).then(setLien).catch((e) => setInvalide(messageErreur(e)))
  }, [jeton])

  const valider = async (e: FormEvent) => {
    e.preventDefault()
    if (mdp.length < 8) { setErr('8 caractères minimum'); return }
    if (mdp !== mdp2) { setErr('Les deux mots de passe sont différents'); return }
    setErr(''); setBusy(true)
    try {
      await post(`/auth/jeton/${encodeURIComponent(jeton)}`, { mdp })
      await recharger()
      toast(lien?.type === 'invitation' ? 'Compte activé, bienvenue !' : 'Mot de passe changé')
      navigate('/', { replace: true })
    } catch (x) {
      setErr(messageErreur(x))
    } finally {
      setBusy(false)
    }
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

  if (!lien && !invalide) return <Chargement />

  return (
    <div className="page" style={{ minHeight: '100dvh', justifyContent: 'center', paddingBottom: 40 }}>
      {invalide ? (
        <>
          {entete('Lien expiré')}
          <div className="note err">{invalide}</div>
          <p className="muted">Sur l'écran de connexion, « Mot de passe oublié ? » t'envoie un nouveau lien. Tu peux aussi demander à un administrateur.</p>
          <button type="button" className="btn primary block" onClick={() => navigate('/', { replace: true })}>Aller à la connexion</button>
        </>
      ) : lien && (
        <>
          {entete(lien.type === 'invitation' ? 'Choisis ton mot de passe' : 'Nouveau mot de passe')}
          <p className="muted">Bonjour {lien.nom}{lien.type === 'invitation' ? ', bienvenue sur BR Inventaire.' : '.'} Ton identifiant : <strong>{lien.email}</strong></p>
          <form className="stack" onSubmit={(e) => void valider(e)}>
            {/* Champ caché : permet au gestionnaire de mots de passe d'associer le mot de passe au bon email */}
            <input type="email" value={lien.email} autoComplete="username" readOnly hidden />
            <label className="field">Mot de passe (8 caractères minimum)
              <input className="input" type="password" value={mdp} onChange={(e) => setMdp(e.target.value)} autoComplete="new-password" required minLength={8} autoFocus />
            </label>
            <label className="field">Confirmer le mot de passe
              <input className="input" type="password" value={mdp2} onChange={(e) => setMdp2(e.target.value)} autoComplete="new-password" required minLength={8} />
            </label>
            {err && <div className="note err">{err}</div>}
            <button className="btn primary block" disabled={busy}>{lien.type === 'invitation' ? 'Activer mon compte' : 'Enregistrer le mot de passe'}</button>
          </form>
        </>
      )}
    </div>
  )
}
