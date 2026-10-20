import { useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { QrCamera } from '../components/QrCamera'
import { Icon } from '../components/Icon'
import { LieuPicker, StatutBadge, toast } from '../components/ui'
import { extraireRef, inventorier } from '../lib/actions'
import { useAuth } from '../lib/auth'
import { useData } from '../lib/data'
import type { Materiel } from '../types'

export default function Scan() {
  const nav = useNavigate()
  const { profil } = useAuth()
  const { materiel, lieuCourant } = useData()
  const [trouve, setTrouve] = useState<Materiel | null>(null)
  const [inconnu, setInconnu] = useState<string | null>(null)
  const [saisie, setSaisie] = useState(false)
  const [ref, setRef] = useState('')
  const [torche, setTorche] = useState(false)
  const [choixLieu, setChoixLieu] = useState(false)
  const [busy, setBusy] = useState(false)
  const toggleTorch = useRef<(() => void) | null>(null)

  const resoudre = (texte: string) => {
    const r = extraireRef(texte)
    const m = r ? materiel.find((x) => x.ref === r) : undefined
    if (m) { setTrouve(m); setInconnu(null) } else { setTrouve(null); setInconnu(r ?? texte) }
  }

  const presentIci = async () => {
    if (!trouve || !profil) return
    if (!lieuCourant) { setChoixLieu(true); return }
    setBusy(true)
    try {
      const { deplace, propose } = await inventorier({ user: profil, lieu: lieuCourant }, trouve, lieuCourant)
      toast(deplace ? `Inventorié · déplacé vers ${lieuCourant.nom}` : propose ? 'Inventorié · déplacement proposé aux admins' : 'Inventorié ✓')
      setTrouve(null)
    } catch (e) { toast('Erreur : ' + String(e), 'err') } finally { setBusy(false) }
  }

  const pause = !!trouve || !!inconnu || saisie

  return (
    <div className="scanner">
      <QrCamera onResult={resoudre} pause={pause} onTorchAvailable={setTorche} torchRef={toggleTorch} />
      <div className="frame" aria-hidden="true" />
      <div className="top">
        <button type="button" className="icon-btn glass" aria-label="Retour" onClick={() => nav('/')}><Icon name="back" stroke={2.2} /></button>
        <button type="button" className="lieu-pill glass" onClick={() => setChoixLieu(true)} style={{ border: '1px solid #2C3342' }}>
          <Icon name="pin" size={16} />{lieuCourant ? lieuCourant.nom : 'Choisir mon lieu'}
        </button>
        {torche ? (
          <button type="button" className="icon-btn glass" aria-label="Lampe torche" style={{ color: '#FBBF24' }} onClick={() => toggleTorch.current?.()}><Icon name="flash" size={20} /></button>
        ) : <span style={{ width: 44 }} />}
      </div>
      <div className="hint">
        <div style={{ fontSize: 18, fontWeight: 800 }}>Visez le QR code du matériel</div>
        <div style={{ fontSize: 14, color: '#C3CAD6' }}>La fiche s'affiche automatiquement</div>
      </div>
      {!pause && (
        <div className="bottom">
          <button type="button" className="btn block glass" onClick={() => setSaisie(true)}>Saisir une référence à la main</button>
        </div>
      )}

      {trouve && (
        <div className="sheet-bg" onClick={() => setTrouve(null)}>
          <div className="sheet" role="dialog" aria-label="Matériel reconnu" onClick={(e) => e.stopPropagation()} style={{ color: 'var(--text)' }}>
            <div className="grip" />
            <div className="row" style={{ gap: 8, color: 'var(--green)', fontSize: 13, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '.06em' }}>
              <Icon name="check" size={18} stroke={3} />QR code reconnu
            </div>
            <div className="stack-s">
              <span className="ref">{trouve.ref}</span>
              <div style={{ fontSize: 19, fontWeight: 800 }}>{trouve.nom}</div>
              <div className="row" style={{ gap: 8 }}><span className="muted">{trouve.lieuNom}</span><StatutBadge statut={trouve.statut} /></div>
            </div>
            {lieuCourant && trouve.lieuId !== lieuCourant.id && (
              <div className="note warn">Ce matériel est enregistré à « {trouve.lieuNom} ». {profil?.role === 'admin' ? `En l'inventoriant ici, il sera déplacé vers « ${lieuCourant.nom} ».` : 'En l\u2019inventoriant ici, un admin sera prévenu pour valider le déplacement.'}</div>
            )}
            <div className="grid-2">
              <button type="button" className="btn success" disabled={busy} onClick={presentIci}><Icon name="check" stroke={2.6} />Présent ici</button>
              <Link to={`/m/${encodeURIComponent(trouve.ref)}`} className="btn primary">Ouvrir la fiche</Link>
            </div>
            <div className="grid-2">
              <Link to={`/m/${encodeURIComponent(trouve.ref)}/signaler`} className="btn danger small">Signaler un problème</Link>
              <button type="button" className="btn small" onClick={() => setTrouve(null)}>Scanner un autre</button>
            </div>
          </div>
        </div>
      )}

      {inconnu && (
        <div className="sheet-bg" onClick={() => setInconnu(null)}>
          <div className="sheet" role="dialog" aria-label="Code inconnu" onClick={(e) => e.stopPropagation()} style={{ color: 'var(--text)' }}>
            <div className="grip" />
            <h2 className="h2">Code non reconnu</h2>
            <div className="note warn" style={{ wordBreak: 'break-all' }}>{inconnu}</div>
            <p className="muted">Ce QR code n'appartient à aucun matériel enregistré.</p>
            <div className="grid-2">
              <button type="button" className="btn" onClick={() => setInconnu(null)}>Réessayer</button>
              {profil?.role !== 'anonyme' ? <Link to="/ajout" className="btn primary">Nouveau matériel</Link> : <span />}
            </div>
          </div>
        </div>
      )}

      {saisie && (
        <div className="sheet-bg" onClick={() => setSaisie(false)}>
          <form className="sheet" onClick={(e) => e.stopPropagation()} style={{ color: 'var(--text)' }}
            onSubmit={(e) => { e.preventDefault(); setSaisie(false); resoudre(ref) }}>
            <div className="grip" />
            <label className="field">Référence du matériel
              <input className="input mono" autoFocus placeholder="Ex. : BR-00042" value={ref} onChange={(e) => setRef(e.target.value.toUpperCase())} />
            </label>
            <button className="btn primary block">Rechercher</button>
          </form>
        </div>
      )}

      {choixLieu && <LieuPicker onClose={() => setChoixLieu(false)} />}
    </div>
  )
}
