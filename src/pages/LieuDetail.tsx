import { useMemo, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { deplacerLot } from '../lib/actions'
import { useAuth } from '../lib/auth'
import { useData } from '../lib/data'
import { BottomNav, LieuPicker, PageHeader, StatutBadge, toast } from '../components/ui'
import { Icon } from '../components/Icon'

export default function LieuDetail() {
  const { id } = useParams()
  const { profil, anonyme } = useAuth()
  const admin = profil?.role === 'admin'
  const { lieux, materiel, lieuCourant } = useData()
  const lieu = lieux.find((l) => l.id === id)
  const [famille, setFamille] = useState<string | null>(null)
  const [selection, setSelection] = useState<Set<string> | null>(null)
  const [choixDest, setChoixDest] = useState(false)
  const [busy, setBusy] = useState(false)

  const items = useMemo(() => materiel.filter((m) => m.lieuId === id), [materiel, id])
  const familles = useMemo(() => [...new Set(items.map((m) => m.famille))].sort(), [items])
  const visibles = famille ? items.filter((m) => m.famille === famille) : items

  if (!lieu) return <div className="page"><PageHeader titre="Lieu introuvable" back="/lieux" /></div>

  const basculer = (ref: string) => {
    const s = new Set(selection)
    if (s.has(ref)) s.delete(ref); else s.add(ref)
    setSelection(s)
  }

  const redispatcher = async (destId: string) => {
    const dest = lieux.find((l) => l.id === destId)
    if (!dest || !selection || dest.id === lieu.id) return
    const choisis = items.filter((m) => selection.has(m.ref))
    setBusy(true)
    try {
      await deplacerLot({ user: profil!, lieu: lieuCourant }, choisis, dest)
      toast(`${choisis.length} matériel(s) envoyé(s) vers ${dest.nom}`)
      setSelection(null)
    } catch (e) { toast(String(e), 'err') } finally { setBusy(false) }
  }

  return (
    <>
      <div className="page" style={selection ? { paddingBottom: 170 } : undefined}>
        <PageHeader titre={lieu.nom} sur={`${items.length} équipement(s)`} back="/lieux" />
        <div className="grid-2">
          <Link to={`/inventaire/${lieu.id}`} className="btn primary small">Lancer un inventaire</Link>
          {admin ? (
            <button type="button" className="btn small" onClick={() => setSelection(selection ? null : new Set())}>
              <Icon name="move" size={18} />{selection ? 'Annuler' : 'Re-dispatcher'}</button>
          ) : !anonyme ? <Link to={`/etiquettes?lieu=${lieu.id}`} className="btn small">Étiquettes</Link> : <span />}
        </div>
        {familles.length > 1 && (
          <div className="chips">
            <button type="button" className="chip" aria-selected={!famille} onClick={() => setFamille(null)}>Tout</button>
            {familles.map((f) => <button key={f} type="button" className="chip" aria-selected={famille === f} onClick={() => setFamille(f)}>{f}</button>)}
          </div>
        )}
        {selection && (
          <div className="row between">
            <span className="muted">{selection.size} sélectionné(s)</span>
            <button type="button" className="btn small" onClick={() => setSelection(new Set(visibles.map((m) => m.ref)))}>Tout sélectionner</button>
          </div>
        )}
        <div className="card flush">
          {visibles.length === 0 && <div className="empty">Aucun matériel ici.</div>}
          {visibles.map((m) => selection ? (
            <label key={m.ref} className="list-item">
              <input type="checkbox" checked={selection.has(m.ref)} onChange={() => basculer(m.ref)} style={{ width: 22, height: 22, accentColor: '#2563EB' }} />
              <div className="grow">
                <div style={{ fontWeight: 700 }}>{m.nom}{m.quantite ? <span className="muted"> × {m.quantite}</span> : null}</div>
                <div className="muted"><span className="ref">{m.ref}</span> · {m.categorieNom}</div>
              </div>
            </label>
          ) : (
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
      {selection ? (
        <div className="action-bar"><div className="inner">
          <button type="button" className="btn primary" disabled={!selection.size || busy} onClick={() => setChoixDest(true)}>
            <Icon name="move" stroke={2.4} />Envoyer {selection.size} vers un autre parc</button>
        </div></div>
      ) : <BottomNav />}
      {choixDest && <LieuPicker titre="Envoyer vers…" onClose={() => setChoixDest(false)} onPick={redispatcher} />}
    </>
  )
}
