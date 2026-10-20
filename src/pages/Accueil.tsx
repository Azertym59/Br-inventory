import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { get } from '../lib/api'
import { aLeRole, useAuth } from '../lib/auth'
import { useData } from '../lib/data'
import { BottomNav, formatDate, LieuCourantPill } from '../components/ui'
import { Icon } from '../components/Icon'
import { LogoBR } from '../components/LogoBR'
import type { Evenement, TypeEvenement } from '../types'

const COULEUR_EVT: Record<TypeEvenement, string> = {
  creation: '#7C3AED', inventaire: '#047857', signalement: '#DC2626', deplacement: '#2563EB',
  reparation: '#047857', etiquette: '#475569', modification: '#475569', statut: '#B45309',
}

export default function Accueil() {
  const { profil, anonyme, logout, changerNomAnonyme } = useAuth()
  const { materiel, lieux, ticketsActifs, pret, signalementsAValider, propositionsAValider } = useData()
  const [evts, setEvts] = useState<Evenement[]>([])
  const aValider = signalementsAValider.length + propositionsAValider.length

  useEffect(() => {
    if (anonyme) return
    let ok = true
    get<Evenement[]>('/evenements?limite=8').then((e) => { if (ok) setEvts(e) }).catch(() => {})
    return () => { ok = false }
  }, [anonyme, materiel])

  const stats = useMemo(() => {
    const parLieu = new Map<string, { nb: number; tickets: number }>()
    for (const m of materiel) {
      const x = parLieu.get(m.lieuId) ?? { nb: 0, tickets: 0 }
      x.nb += 1
      parLieu.set(m.lieuId, x)
    }
    for (const t of ticketsActifs) {
      const x = parLieu.get(t.lieuId) ?? { nb: 0, tickets: 0 }
      x.tickets += 1
      parLieu.set(t.lieuId, x)
    }
    const debutMois = new Date(); debutMois.setDate(1); debutMois.setHours(0, 0, 0, 0)
    return {
      parLieu,
      critiques: ticketsActifs.filter((t) => t.gravite === 'critique').length,
      aEtiqueter: materiel.filter((m) => !m.etiquetee).length,
      ceMois: materiel.filter((m) => (m.creeLe ? Date.parse(m.creeLe) : Date.now()) >= debutMois.getTime()).length,
      enPanne: materiel.filter((m) => m.statut === 'panne' || m.statut === 'hs').length,
    }
  }, [materiel, ticketsActifs])

  const prenom = profil?.nom.split(' ')[0] ?? ''

  return (
    <>
      <div className="page">
        <div className="row between">
          <div className="stack-s" style={{ gap: 6 }}>
            <div className="row" style={{ gap: 10 }}>
              <LogoBR hauteur={26} />
              <div className="eyebrow">Bonjour {prenom}</div>
            </div>
            <h1 className="h1">Tableau de bord</h1>
          </div>
          {anonyme ? (
            <button type="button" className="btn small" onClick={logout}><Icon name="user" size={18} />Équipe</button>
          ) : (
            <div className="row" style={{ gap: 8 }}>
              <Link to="/ajout" className="icon-btn dark" aria-label="Ajouter un matériel"><Icon name="plus" stroke={2.6} /></Link>
              <Link to="/admin" className="icon-btn" aria-label="Réglages et compte"><Icon name="settings" size={20} /></Link>
            </div>
          )}
        </div>

        {anonyme && (
          <div className="note info row between" style={{ gap: 10 }}>
            <span>Tes actions sont enregistrées au nom de <strong>{profil?.nom}</strong>.</span>
            <button type="button" className="btn small" onClick={() => { const n = prompt('Ton prénom et nom', profil?.nom ?? ''); if (n && n.trim().length > 1) changerNomAnonyme(n.trim()) }}>Modifier</button>
          </div>
        )}

        {aValider > 0 && (
          <Link to="/validation" className="card row" style={{ background: 'var(--amber-tint)', borderColor: 'var(--amber-border)', textDecoration: 'none', color: 'var(--amber-ink)' }}>
            <div className="tile" style={{ background: '#FEF3C7', color: 'var(--amber)' }}><Icon name="alert" /></div>
            <div className="grow"><div style={{ fontWeight: 800 }}>{aValider} élément(s) à valider</div>
              <div className="small" style={{ fontWeight: 600 }}>{signalementsAValider.length} signalement(s) · {propositionsAValider.length} déplacement(s)</div></div>
            <Icon name="chevron" />
          </Link>
        )}

        <LieuCourantPill />

        <Link to="/scan" className="card row" style={{ background: 'var(--accent)', borderColor: 'var(--accent)', color: '#fff', textDecoration: 'none', padding: 18, gap: 16 }}>
          <div style={{ width: 52, height: 52, borderRadius: 16, background: '#fff', color: 'var(--accent)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Icon name="scan" size={28} />
          </div>
          <div className="grow stack-s" style={{ gap: 3 }}>
            <div style={{ fontSize: 18, fontWeight: 800 }}>Scanner un matériel</div>
            <div style={{ fontSize: 13, fontWeight: 600, opacity: 0.9 }}>Inventorier ou signaler un problème</div>
          </div>
          <Icon name="chevron" stroke={2.5} />
        </Link>

        {!anonyme && <div className="grid-2">
          <Link to="/lieux" className="card kpi"><div className="lbl">Matériel suivi</div><div className="val">{materiel.length}</div>
            <div className="small" style={{ color: 'var(--green)', fontWeight: 700 }}>+{stats.ceMois} ce mois</div></Link>
          <Link to="/tickets" className={`card kpi ${ticketsActifs.length ? 'red' : ''}`}><div className="lbl">Tickets ouverts</div><div className="val">{ticketsActifs.length}</div>
            <div className="small lbl" style={{ fontWeight: 700 }}>{stats.critiques} critique(s)</div></Link>
          <Link to="/lieux" className={`card kpi ${stats.enPanne ? 'amber' : ''}`}><div className="lbl">En panne / HS</div><div className="val">{stats.enPanne}</div>
            <div className="small lbl" style={{ fontWeight: 700 }}>à réparer</div></Link>
          <Link to="/etiquettes" className="card kpi"><div className="lbl">À étiqueter</div><div className="val">{stats.aEtiqueter}</div>
            <div className="small" style={{ color: 'var(--accent-ink)', fontWeight: 700 }}>Imprimer le lot</div></Link>
        </div>}

        <div className="stack">
          <div className="row between"><h2 className="h2">Par lieu</h2><Link to="/lieux" className="small" style={{ fontWeight: 700, textDecoration: 'none' }}>Tout voir</Link></div>
          <div className="card flush">
            {pret && lieux.length === 0 && <div className="empty">Aucun lieu pour l'instant. {aLeRole(profil, 'admin') ? <Link to="/admin">Créer les lieux</Link> : 'Un admin doit les créer.'}</div>}
            {lieux.map((l) => {
              const s = stats.parLieu.get(l.id)
              return (
                <Link key={l.id} to={`/lieux/${l.id}`} className="list-item">
                  <div className="tile" style={l.type === 'depot' ? { background: '#F3E8FF', color: '#6D28D9' } : undefined}>{l.nom.replace(/^Stade\s+/i, '').slice(0, 3).toUpperCase()}</div>
                  <div className="grow"><div style={{ fontWeight: 700 }}>{l.nom}</div><div className="muted">{l.type === 'depot' ? 'Dépôt' : 'Stade'} · {s?.nb ?? 0} équipement(s)</div></div>
                  {!!s?.tickets && <span className="badge b-panne">{s.tickets} ticket(s)</span>}
                </Link>
              )
            })}
          </div>
        </div>

        {!anonyme && <div className="stack">
          <h2 className="h2">Activité récente</h2>
          {evts.length === 0 && <div className="card empty">Rien pour l'instant : scanne ton premier matériel.</div>}
          {evts.map((e) => (
            <Link key={e.id} to={`/m/${encodeURIComponent(e.materielRef)}`} className="card row" style={{ alignItems: 'flex-start', textDecoration: 'none', color: 'var(--text)', padding: 14 }}>
              <span style={{ width: 10, height: 10, borderRadius: 99, marginTop: 5, flex: 'none', background: COULEUR_EVT[e.type] }} />
              <div className="grow stack-s" style={{ gap: 3 }}>
                <div style={{ fontSize: 14, fontWeight: 700 }}>{e.userNom} <span style={{ color: 'var(--muted)', fontWeight: 600 }}>· {e.titre}</span></div>
                <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-2)' }}>{e.materielNom} · <span className="ref">{e.materielRef}</span></div>
                <div className="muted small">{e.lieuNom ?? 'Lieu inconnu'} · {formatDate(e.date)}</div>
              </div>
            </Link>
          ))}
        </div>}
      </div>
      <BottomNav />
    </>
  )
}
