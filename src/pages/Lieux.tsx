import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../lib/auth'
import { useData } from '../lib/data'
import { BottomNav } from '../components/ui'
import { Icon } from '../components/Icon'

type Filtre = 'tous' | 'stades' | 'depot'

export default function Lieux() {
  const { lieux, materiel } = useData()
  const { anonyme } = useAuth()
  const [filtre, setFiltre] = useState<Filtre>('tous')
  const [q, setQ] = useState('')

  const recherche = q.trim().toLowerCase()
  const resultats = useMemo(() => recherche.length < 2 ? [] : materiel.filter((m) =>
    m.ref.toLowerCase().includes(recherche) || m.nom.toLowerCase().includes(recherche) ||
    m.categorieNom.toLowerCase().includes(recherche) || Object.values(m.valeurs ?? {}).some((v) => v.toLowerCase().includes(recherche)),
  ).slice(0, 40), [materiel, recherche])

  const liste = lieux.filter((l) => filtre === 'tous' || (filtre === 'depot' ? l.type === 'depot' : l.type !== 'depot'))

  return (
    <>
      <div className="page">
        <div className="stack-s" style={{ gap: 4 }}>
          <div className="eyebrow">{lieux.length} lieu(x) · {materiel.length} équipement(s)</div>
          <h1 className="h1">Lieux</h1>
        </div>

        <label className="row card" style={{ padding: '0 14px', minHeight: 50, gap: 10, color: 'var(--muted)' }}>
          <Icon name="search" size={18} />
          <span className="sr-only">Rechercher un matériel</span>
          <input type="search" placeholder="Rechercher un matériel, une réf., un n° de série" value={q} onChange={(e) => setQ(e.target.value)}
            style={{ flex: 1, minWidth: 0, border: 0, outline: 'none', background: 'transparent', fontSize: 15, color: 'var(--text)' }} />
        </label>

        {recherche.length >= 2 ? (
          <div className="card flush">
            {resultats.length === 0 && <div className="empty">Aucun résultat</div>}
            {resultats.map((m) => (
              <Link key={m.ref} to={`/m/${encodeURIComponent(m.ref)}`} className="list-item">
                <div className="grow"><div style={{ fontWeight: 700 }}>{m.nom}</div><div className="muted"><span className="ref">{m.ref}</span> · {m.lieuNom}</div></div>
                <Icon name="chevron" size={18} />
              </Link>
            ))}
          </div>
        ) : (
          <>
            <div className="chips" role="tablist" aria-label="Filtrer">
              {([['tous', 'Tous'], ['stades', 'Stades'], ['depot', 'Dépôt']] as [Filtre, string][]).map(([id, l]) => (
                <button key={id} type="button" role="tab" className="chip" aria-selected={filtre === id} onClick={() => setFiltre(id)}>{l}</button>
              ))}
            </div>
            <div className="stack">
              {liste.map((l) => {
                const items = materiel.filter((m) => m.lieuId === l.id)
                const ok = items.filter((m) => m.statut === 'ok').length
                const surv = items.filter((m) => m.statut === 'surveiller' || m.statut === 'reparation').length
                const panne = items.length - ok - surv
                const pct = (n: number) => (items.length ? `${(n / items.length) * 100}%` : '0%')
                return (
                  <div key={l.id} className="card stack" style={{ gap: 14 }}>
                    <Link to={`/lieux/${l.id}`} className="row" style={{ textDecoration: 'none', color: 'var(--text)' }}>
                      <div className="tile" style={{ width: 48, height: 48, ...(l.type === 'depot' ? { background: '#F3E8FF', color: '#6D28D9' } : {}) }}>{l.nom.replace(/^Stade\s+/i, '').slice(0, 3).toUpperCase()}</div>
                      <div className="grow"><div style={{ fontSize: 16, fontWeight: 800 }}>{l.nom}</div><div className="muted">{l.type === 'depot' ? 'Dépôt' : 'Stade'}{l.adresse ? ` · ${l.adresse}` : ''}</div></div>
                      <div style={{ textAlign: 'right' }}><div style={{ fontSize: 22, fontWeight: 800 }}>{items.length}</div><div className="muted small">équip.</div></div>
                    </Link>
                    <div className="health" aria-hidden="true">
                      <div style={{ width: pct(ok), background: 'var(--green)' }} />
                      <div style={{ width: pct(surv), background: 'var(--amber)' }} />
                      <div style={{ width: pct(panne), background: 'var(--red)' }} />
                    </div>
                    <div className="row small" style={{ gap: 14, fontWeight: 600, color: 'var(--text-3)', flexWrap: 'wrap' }}>
                      <span>{ok} OK</span><span>{surv} à surveiller</span><span>{panne} en panne</span>
                    </div>
                    <div className={anonyme ? 'stack' : 'grid-2'}>
                      <Link to={`/inventaire/${l.id}`} className="btn small">Lancer un inventaire</Link>
                      {!anonyme && <Link to={`/etiquettes?lieu=${l.id}`} className="btn small">Étiquettes du lieu</Link>}
                    </div>
                  </div>
                )
              })}
              {liste.length === 0 && <div className="card empty">Aucun lieu.</div>}
            </div>
          </>
        )}
      </div>
      <BottomNav />
    </>
  )
}
