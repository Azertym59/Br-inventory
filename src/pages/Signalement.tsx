import { useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { LIBELLES_GRAVITE, signaler } from '../lib/actions'
import { useAuth } from '../lib/auth'
import { useData } from '../lib/data'
import { LieuCourantPill, PageHeader, PhotoPicker, toast } from '../components/ui'
import { Icon } from '../components/Icon'
import type { Gravite } from '../types'

const GRAV: { id: Gravite; sub: string; couleur: string; tint: string }[] = [
  { id: 'faible', sub: 'Utilisable', couleur: '#047857', tint: '#ECFDF5' },
  { id: 'moyenne', sub: 'Dégradé', couleur: '#B45309', tint: '#FFFBEB' },
  { id: 'critique', sub: 'Hors service', couleur: '#DC2626', tint: '#FEF2F2' },
]

export default function Signalement() {
  const { ref = '' } = useParams()
  const { profil } = useAuth()
  const { materiel, lieuCourant } = useData()
  const m = materiel.find((x) => x.ref === ref)
  const [gravite, setGravite] = useState<Gravite>('moyenne')
  const [description, setDescription] = useState('')
  const [photos, setPhotos] = useState<File[]>([])
  const [envoi, setEnvoi] = useState(false)
  const [numero, setNumero] = useState<string | null>(null)

  if (!m) return <div className="page"><PageHeader titre="Matériel introuvable" back /></div>

  const envoyer = async () => {
    if (!description.trim()) { toast('Décris le problème en quelques mots', 'err'); return }
    setEnvoi(true)
    try {
      setNumero(await signaler({ user: profil!, lieu: lieuCourant }, m, { description: description.trim(), gravite, photos }))
    } catch (e) {
      toast('Envoi impossible : ' + (String(e).includes('hors-ligne') ? 'pas de réseau' : String(e)), 'err')
    } finally { setEnvoi(false) }
  }

  if (numero) {
    return (
      <div className="page center stack" style={{ textAlign: 'center', minHeight: '90dvh', gap: 18 }}>
        <div style={{ width: 88, height: 88, borderRadius: 28, background: 'var(--green)', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <Icon name="check" size={46} stroke={2.8} />
        </div>
        <h1 className="h1">Ticket créé</h1>
        <div className="ref" style={{ fontSize: 15 }}>{numero} · gravité {LIBELLES_GRAVITE[gravite].toLowerCase()}</div>
        <p className="muted" style={{ fontSize: 15, lineHeight: 1.5 }}>Le signalement est enregistré avec ton nom, le lieu et l'heure.</p>
        <div className="stack" style={{ width: '100%' }}>
          <Link to="/tickets" className="btn primary block">Voir les tickets</Link>
          <Link to="/scan" className="btn block">Scanner un autre matériel</Link>
        </div>
      </div>
    )
  }

  return (
    <>
      <div className="page sans-nav">
        <PageHeader titre="Signaler un problème" back />
        <div className="card row" style={{ padding: '12px 14px' }}>
          <div className="tile"><Icon name="panel" /></div>
          <div className="grow"><div style={{ fontWeight: 700 }}>{m.nom}</div><span className="ref">{m.ref}</span></div>
        </div>

        <div className="stack-s" style={{ gap: 10 }}>
          <div style={{ fontSize: 14, fontWeight: 700 }}>Gravité</div>
          <div className="grid-3" role="radiogroup" aria-label="Gravité">
            {GRAV.map((g) => {
              const on = g.id === gravite
              return (
                <button key={g.id} type="button" role="radio" aria-checked={on} onClick={() => setGravite(g.id)}
                  style={{ minHeight: 64, borderRadius: 16, border: `2px solid ${on ? g.couleur : 'transparent'}`, background: on ? g.couleur : g.tint, color: on ? '#fff' : g.couleur, cursor: 'pointer', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 3 }}>
                  <span style={{ fontSize: 15, fontWeight: 800 }}>{LIBELLES_GRAVITE[g.id]}</span>
                  <span style={{ fontSize: 11, fontWeight: 600 }}>{g.sub}</span>
                </button>
              )
            })}
          </div>
        </div>

        <label className="field">Description
          <textarea className="input" rows={4} value={description} onChange={(e) => setDescription(e.target.value)}
            placeholder="Ex. : 3 lignes de pixels morts en bas à gauche, apparu après la pluie" />
        </label>

        <div className="stack-s" style={{ gap: 10 }}>
          <div className="row between"><div style={{ fontSize: 14, fontWeight: 700 }}>Photos</div><div className="muted small">{photos.length} / 3 · compressées avant envoi</div></div>
          <PhotoPicker fichiers={photos} onChange={setPhotos} />
        </div>

        <div className="note info stack-s" style={{ gap: 8 }}>
          <div className="small" style={{ fontWeight: 800, letterSpacing: '.06em', textTransform: 'uppercase' }}>Enregistré automatiquement</div>
          <div className="row" style={{ gap: 10 }}><Icon name="user" size={18} />{profil?.nom}</div>
          <div className="row" style={{ gap: 10, flexWrap: 'wrap' }}><Icon name="pin" size={18} />{lieuCourant ? `${lieuCourant.nom} · position GPS` : <>Lieu non choisi <LieuCourantPill /></>}</div>
          <div className="row" style={{ gap: 10 }}><Icon name="clock" size={18} />{new Date().toLocaleString('fr-FR', { dateStyle: 'short', timeStyle: 'short' })}</div>
        </div>
      </div>
      <div className="action-bar"><div className="inner">
        <button type="button" className="btn danger" disabled={envoi} onClick={envoyer}>{envoi ? 'Envoi…' : 'Envoyer le signalement'}</button>
      </div></div>
    </>
  )
}
