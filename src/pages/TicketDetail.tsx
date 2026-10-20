import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { get } from '../lib/api'
import { assignerTicket, chargerTicket, cloturerReparation, LIBELLES_GRAVITE, prendreEnCharge } from '../lib/actions'
import { useAuth } from '../lib/auth'
import { useData } from '../lib/data'
import { formatDate, PageHeader, PhotoPicker, toast } from '../components/ui'
import { Icon } from '../components/Icon'
import { COULEURS_GRAVITE } from './Tickets'
import type { Ticket, Utilisateur } from '../types'

export default function TicketDetail() {
  const { id = '' } = useParams()
  const { profil } = useAuth()
  const { lieuCourant } = useData()
  const [t, setT] = useState<Ticket | null | undefined>(undefined)
  const [comment, setComment] = useState('')
  const [photos, setPhotos] = useState<File[]>([])
  const [busy, setBusy] = useState(false)
  const [cloture, setCloture] = useState(false)

  const admin = profil?.role === 'admin'
  const [equipe, setEquipe] = useState<Utilisateur[]>([])

  // Rechargé à chaque mise à jour des données (après une action ou toutes les 20 s)
  const { ticketsActifs } = useData()
  useEffect(() => {
    let ok = true
    chargerTicket(id).then((x) => { if (ok) setT(x) }).catch(() => { if (ok) setT((v) => v ?? null) })
    return () => { ok = false }
  }, [id, ticketsActifs])
  useEffect(() => {
    if (!admin) return
    get<Utilisateur[]>('/utilisateurs').then((u) => setEquipe(u.filter((x) => x.actif))).catch(() => {})
  }, [admin])

  if (t === undefined) return <div className="page"><PageHeader titre="Chargement…" back /></div>
  if (t === null) return <div className="page"><PageHeader titre="Ticket introuvable" back="/tickets" /></div>

  const ctx = { user: profil!, lieu: lieuCourant }
  const g = COULEURS_GRAVITE[t.gravite]

  const prendre = async () => {
    setBusy(true)
    try { await prendreEnCharge(ctx, t); toast('Ticket pris en charge') } catch (e) { toast(String(e), 'err') } finally { setBusy(false) }
  }
  const terminer = async () => {
    setBusy(true)
    try { await cloturerReparation(ctx, t, comment.trim(), photos); toast('Réparation enregistrée'); setCloture(false) }
    catch (e) { toast(String(e), 'err') } finally { setBusy(false) }
  }

  return (
    <div className="page">
      <PageHeader titre={t.numero} sur="Ticket" back="/tickets" droite={<span className="badge" style={{ background: g.t, color: g.c }}>{LIBELLES_GRAVITE[t.gravite]}</span>} />

      <Link to={`/m/${encodeURIComponent(t.materielRef)}`} className="card row" style={{ textDecoration: 'none', color: 'var(--text)', padding: '12px 14px' }}>
        <div className="tile"><Icon name="panel" /></div>
        <div className="grow"><div style={{ fontWeight: 700 }}>{t.materielNom}</div><span className="ref">{t.materielRef}</span></div>
        <Icon name="chevron" size={18} />
      </Link>

      <div className="card stack">
        <div style={{ fontSize: 16, fontWeight: 700, lineHeight: 1.45 }}>{t.description || 'Sans description'}</div>
        {t.photos.length > 0 && <div className="photos">{t.photos.map((p) => <a key={p} className="photo" href={p} target="_blank" rel="noreferrer"><img src={p} alt="Photo du problème" /></a>)}</div>}
        <div className="stack-s small" style={{ color: 'var(--text-3)', gap: 6 }}>
          <div className="row" style={{ gap: 8 }}><Icon name="user" size={16} />Signalé par <strong>{t.signalePar.nom}</strong>{t.signalePar.anonyme ? ' (sans compte)' : ''}</div>
          {t.validePar && <div className="row" style={{ gap: 8 }}><Icon name="check" size={16} />Validé par <strong>{t.validePar.nom}</strong></div>}
          <div className="row" style={{ gap: 8 }}><Icon name="pin" size={16} />{t.lieuNom}{t.gps && <a href={`https://maps.google.com/?q=${t.gps.lat},${t.gps.lng}`} target="_blank" rel="noreferrer">(voir la position)</a>}</div>
          <div className="row" style={{ gap: 8 }}><Icon name="clock" size={16} />{formatDate(t.creeLe)}</div>
        </div>
      </div>

      {t.statut === 'repare' ? (
        <div className="note ok stack-s">
          <strong>Réparé par {t.assigneA?.nom} · {formatDate(t.repareLe)}</strong>
          {t.commentaireReparation && <div>{t.commentaireReparation}</div>}
          {t.photosApres.length > 0 && <div className="photos" style={{ marginTop: 6 }}>{t.photosApres.map((p) => <a key={p} className="photo" href={p} target="_blank" rel="noreferrer"><img src={p} alt="Photo après réparation" /></a>)}</div>}
        </div>
      ) : (
        <div className="stack">
          {admin && (
            <label className="field">Technicien assigné
              <select className="input" value={t.assigneA?.uid ?? ''} onChange={async (e) => {
                const u = equipe.find((x) => x.uid === e.target.value)
                try { await assignerTicket(ctx, t, u ? { uid: u.uid, nom: u.nom } : null); toast(u ? `Assigné à ${u.nom}` : 'Désassigné') } catch (x) { toast(String(x), 'err') }
              }}>
                <option value="">Non assigné</option>
                {equipe.map((u) => <option key={u.uid} value={u.uid}>{u.nom}{u.role === 'admin' ? ' (admin)' : ''}</option>)}
              </select>
            </label>
          )}
          {!admin && t.assigneA && <div className="note info">Assigné à <strong>{t.assigneA.nom}</strong>{t.statut === 'en_cours' ? ' · réparation en cours' : ''}</div>}
          {t.statut === 'en_cours' && admin && <div className="note info">Réparation en cours · {formatDate(t.majLe)}</div>}
          {t.statut === 'ouvert' && <button type="button" className="btn primary block" disabled={busy} onClick={prendre}>Je commence la réparation</button>}
          {!cloture ? (
            <button type="button" className="btn success block" onClick={() => setCloture(true)}><Icon name="check" stroke={2.6} />Marquer comme réparé</button>
          ) : (
            <div className="card stack">
              <h2 className="h2">Clôturer la réparation</h2>
              <label className="field">Ce qui a été fait
                <textarea className="input" rows={3} value={comment} onChange={(e) => setComment(e.target.value)} placeholder="Ex. : module remplacé, carte de réception reflashée" />
              </label>
              <div className="stack-s"><div style={{ fontSize: 14, fontWeight: 700 }}>Photos après réparation</div><PhotoPicker fichiers={photos} onChange={setPhotos} /></div>
              <div className="grid-2">
                <button type="button" className="btn" onClick={() => setCloture(false)}>Annuler</button>
                <button type="button" className="btn success" disabled={busy} onClick={terminer}>{busy ? 'Envoi…' : 'Valider'}</button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
