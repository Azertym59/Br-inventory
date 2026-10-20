import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { collection, limit, onSnapshot, orderBy, query, where } from 'firebase/firestore'
import { db } from '../firebase'
import { LIBELLES_GRAVITE } from '../lib/actions'
import { useData } from '../lib/data'
import { BottomNav, formatDate } from '../components/ui'
import { Icon } from '../components/Icon'
import type { Gravite, StatutTicket, Ticket } from '../types'

export const COULEURS_GRAVITE: Record<Gravite, { c: string; t: string }> = {
  critique: { c: '#B91C1C', t: '#FEE2E2' },
  moyenne: { c: '#92400E', t: '#FEF3C7' },
  faible: { c: '#065F46', t: '#D1FAE5' },
}
const BORD: Record<Gravite, string> = { critique: '#DC2626', moyenne: '#B45309', faible: '#047857' }

export function CarteTicket({ t }: { t: Ticket }) {
  const g = COULEURS_GRAVITE[t.gravite]
  return (
    <Link to={`/tickets/${t.id}`} className="card stack" style={{ gap: 12, textDecoration: 'none', color: 'var(--text)', borderTop: `4px solid ${BORD[t.gravite]}` }}>
      <div className="row between">
        <span className="mono small" style={{ color: 'var(--muted)', fontWeight: 600 }}>{t.numero}</span>
        <span className="badge" style={{ background: g.t, color: g.c }}>{LIBELLES_GRAVITE[t.gravite]}</span>
      </div>
      <div className="stack-s" style={{ gap: 4 }}>
        <div style={{ fontSize: 16, fontWeight: 800 }}>{t.description || 'Sans description'}</div>
        <div className="muted">{t.materielNom} · <span className="ref">{t.materielRef}</span></div>
      </div>
      <div className="chips">
        <span className="badge b-neutre"><Icon name="pin" size={13} />{t.lieuNom}</span>
        {t.photos.length > 0 && <span className="badge b-neutre"><Icon name="camera" size={13} />{t.photos.length} photo(s)</span>}
      </div>
      <div className="row between small" style={{ paddingTop: 10, borderTop: '1px solid var(--divider)', color: 'var(--muted)' }}>
        <span>Signalé par <strong style={{ color: 'var(--text)' }}>{t.signalePar.nom}</strong> · {formatDate(t.creeLe)}</span>
        <span style={{ fontWeight: 700, color: 'var(--text-2)' }}>
          {t.statut === 'repare' ? `Réparé · ${formatDate(t.repareLe, false)}` : t.assigneA ? `→ ${t.assigneA.nom}` : 'Non assigné'}
        </span>
      </div>
    </Link>
  )
}

export default function Tickets() {
  const { ticketsActifs } = useData()
  const [tab, setTab] = useState<StatutTicket>('ouvert')
  const [repares, setRepares] = useState<Ticket[]>([])

  useEffect(() => {
    if (tab !== 'repare') return
    return onSnapshot(
      query(collection(db, 'tickets'), where('statut', '==', 'repare'), orderBy('repareLe', 'desc'), limit(30)),
      (s) => setRepares(s.docs.map((d) => ({ id: d.id, ...d.data() }) as Ticket)),
      (e) => console.error(e),
    )
  }, [tab])

  const ouverts = ticketsActifs.filter((t) => t.statut === 'ouvert')
  const enCours = ticketsActifs.filter((t) => t.statut === 'en_cours')
  const liste = tab === 'ouvert' ? ouverts : tab === 'en_cours' ? enCours : repares
  const ordre: Record<Gravite, number> = { critique: 0, moyenne: 1, faible: 2 }
  const tries = tab === 'repare' ? liste : [...liste].sort((a, b) => ordre[a.gravite] - ordre[b.gravite])

  return (
    <>
      <div className="page">
        <div className="stack-s" style={{ gap: 4 }}><div className="eyebrow">Maintenance</div><h1 className="h1">Tickets</h1></div>
        <div className="seg" role="tablist" aria-label="Statut des tickets">
          <button type="button" role="tab" aria-selected={tab === 'ouvert'} onClick={() => setTab('ouvert')}>Ouverts · {ouverts.length}</button>
          <button type="button" role="tab" aria-selected={tab === 'en_cours'} onClick={() => setTab('en_cours')}>En cours · {enCours.length}</button>
          <button type="button" role="tab" aria-selected={tab === 'repare'} onClick={() => setTab('repare')}>Réparés</button>
        </div>
        <div className="stack">
          {tries.map((t) => <CarteTicket key={t.id} t={t} />)}
          {tries.length === 0 && <div className="card empty">Aucun ticket ici.</div>}
        </div>
      </div>
      <BottomNav />
    </>
  )
}
