import { useMemo, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { useData } from '../lib/data'
import { BottomNav, PageHeader, StatutBadge } from '../components/ui'
import { Icon } from '../components/Icon'

export default function LieuDetail() {
  const { id } = useParams()
  const { lieux, materiel } = useData()
  const lieu = lieux.find((l) => l.id === id)
  const [famille, setFamille] = useState<string | null>(null)

  const items = useMemo(() => materiel.filter((m) => m.lieuId === id), [materiel, id])
  const familles = useMemo(() => [...new Set(items.map((m) => m.famille))].sort(), [items])
  const visibles = famille ? items.filter((m) => m.famille === famille) : items

  if (!lieu) return <div className="page"><PageHeader titre="Lieu introuvable" back="/lieux" /></div>

  return (
    <>
      <div className="page">
        <PageHeader titre={lieu.nom} sur={`${items.length} équipement(s)`} back="/lieux" />
        <div className="grid-2">
          <Link to={`/inventaire/${lieu.id}`} className="btn primary small">Lancer un inventaire</Link>
          <Link to={`/etiquettes?lieu=${lieu.id}`} className="btn small">Étiquettes</Link>
        </div>
        {familles.length > 1 && (
          <div className="chips">
            <button type="button" className="chip" aria-selected={!famille} onClick={() => setFamille(null)}>Tout</button>
            {familles.map((f) => <button key={f} type="button" className="chip" aria-selected={famille === f} onClick={() => setFamille(f)}>{f}</button>)}
          </div>
        )}
        <div className="card flush">
          {visibles.length === 0 && <div className="empty">Aucun matériel ici.</div>}
          {visibles.map((m) => (
            <Link key={m.ref} to={`/m/${encodeURIComponent(m.ref)}`} className="list-item">
              <div className="grow">
                <div style={{ fontWeight: 700 }}>{m.nom}{m.quantite ? <span className="muted"> × {m.quantite}</span> : null}</div>
                <div className="muted"><span className="ref">{m.ref}</span> · {m.categorieNom}</div>
              </div>
              <StatutBadge statut={m.statut} />
              <Icon name="chevron" size={18} />
            </Link>
          ))}
        </div>
      </div>
      <BottomNav />
    </>
  )
}
