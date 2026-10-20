import { useState } from 'react'
import { Link } from 'react-router-dom'
import { LIBELLES_GRAVITE, traiterProposition, traiterSignalement } from '../lib/actions'
import { useAuth } from '../lib/auth'
import { useData } from '../lib/data'
import { formatDate, PageHeader, toast } from '../components/ui'
import { Icon } from '../components/Icon'
import { COULEURS_GRAVITE } from './Tickets'
import type { Gravite, PropositionDeplacement, SignalementAValider } from '../types'

export default function Validation() {
  const { profil } = useAuth()
  const { signalementsAValider, propositionsAValider, materiel, lieuCourant } = useData()
  const [tab, setTab] = useState<'signalements' | 'deplacements'>('signalements')
  const [busy, setBusy] = useState<string | null>(null)
  const ctx = { user: profil!, lieu: lieuCourant }
  const parRef = new Map(materiel.map((m) => [m.ref, m]))
  const tri = <T extends { creeLe: { toMillis: () => number } | null }>(a: T[]) => [...a].sort((x, y) => (x.creeLe?.toMillis() ?? 0) - (y.creeLe?.toMillis() ?? 0))

  const sig = async (s: SignalementAValider, ok: boolean, g?: Gravite) => {
    setBusy(s.id)
    try { await traiterSignalement(ctx, s, ok, parRef.get(s.materielRef), g); toast(ok ? 'Ticket créé' : 'Signalement rejeté') }
    catch (e) { toast(String(e), 'err') } finally { setBusy(null) }
  }
  const prop = async (p: PropositionDeplacement, ok: boolean) => {
    setBusy(p.id)
    try { await traiterProposition(ctx, p, ok, parRef.get(p.materielRef)); toast(ok ? `Déplacé vers ${p.versLieuNom}` : 'Proposition rejetée') }
    catch (e) { toast(String(e), 'err') } finally { setBusy(null) }
  }

  return (
    <div className="page">
      <PageHeader titre="À valider" sur="Admin" back="/" />
      <div className="seg" role="tablist">
        <button type="button" role="tab" aria-selected={tab === 'signalements'} onClick={() => setTab('signalements')}>Signalements · {signalementsAValider.length}</button>
        <button type="button" role="tab" aria-selected={tab === 'deplacements'} onClick={() => setTab('deplacements')}>Déplacements · {propositionsAValider.length}</button>
      </div>

      {tab === 'signalements' ? (
        <div className="stack">
          <div className="note info">Signalements faits sans compte. Valider crée le ticket et met le matériel « à surveiller » ou « en panne ».</div>
          {tri(signalementsAValider).map((s) => {
            const g = COULEURS_GRAVITE[s.gravite]
            return (
              <div key={s.id} className="card stack" style={{ gap: 12 }}>
                <div className="row between">
                  <Link to={`/m/${encodeURIComponent(s.materielRef)}`} className="ref" style={{ textDecoration: 'none' }}>{s.materielRef}</Link>
                  <span className="badge" style={{ background: g.t, color: g.c }}>{LIBELLES_GRAVITE[s.gravite]}</span>
                </div>
                <div className="stack-s" style={{ gap: 4 }}>
                  <div style={{ fontSize: 16, fontWeight: 800 }}>{s.description}</div>
                  <div className="muted">{s.materielNom}</div>
                </div>
                {s.photos.length > 0 && <div className="photos">{s.photos.map((p) => <a key={p} className="photo" href={p} target="_blank" rel="noreferrer"><img src={p} alt="Photo du problème" /></a>)}</div>}
                <div className="small" style={{ color: 'var(--text-3)' }}>
                  <strong>{s.declarant.nom}</strong> (sans compte) · {s.lieuNom}{s.gps ? ' · GPS' : ''} · {formatDate(s.creeLe)}
                </div>
                <div className="grid-2">
                  <button type="button" className="btn small" disabled={busy === s.id} onClick={() => sig(s, false)}><Icon name="x" size={18} />Rejeter</button>
                  <button type="button" className="btn small success" disabled={busy === s.id} onClick={() => sig(s, true)}><Icon name="check" size={18} stroke={2.6} />Valider</button>
                </div>
              </div>
            )
          })}
          {signalementsAValider.length === 0 && <div className="card empty">Rien à valider.</div>}
        </div>
      ) : (
        <div className="stack">
          <div className="note info">Matériel scanné dans un autre parc que celui enregistré. Valider le déplace dans le nouveau parc.</div>
          {tri(propositionsAValider).map((p) => (
            <div key={p.id} className="card stack" style={{ gap: 12 }}>
              <div className="row between">
                <Link to={`/m/${encodeURIComponent(p.materielRef)}`} className="ref" style={{ textDecoration: 'none' }}>{p.materielRef}</Link>
                <span className="muted small">{formatDate(p.creeLe)}</span>
              </div>
              <div style={{ fontSize: 16, fontWeight: 800 }}>{p.materielNom}</div>
              <div className="row" style={{ gap: 8, flexWrap: 'wrap', fontWeight: 700 }}>
                <span className="badge b-neutre">{p.deLieuNom}</span><Icon name="move" size={18} /><span className="badge b-ok">{p.versLieuNom}</span>
              </div>
              <div className="small" style={{ color: 'var(--text-3)' }}>Vu par <strong>{p.par.nom}</strong></div>
              <div className="grid-2">
                <button type="button" className="btn small" disabled={busy === p.id} onClick={() => prop(p, false)}>Laisser à {p.deLieuNom}</button>
                <button type="button" className="btn small primary" disabled={busy === p.id} onClick={() => prop(p, true)}>Déplacer</button>
              </div>
            </div>
          ))}
          {propositionsAValider.length === 0 && <div className="card empty">Rien à valider.</div>}
        </div>
      )}
    </div>
  )
}
