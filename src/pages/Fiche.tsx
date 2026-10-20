import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { collection, limit, onSnapshot, orderBy, query, where } from 'firebase/firestore'
import { db } from '../firebase'
import { changerStatut, deplacer, inventorier, LIBELLES_STATUT, modifierMateriel } from '../lib/actions'
import { useAuth } from '../lib/auth'
import { libelleNumero } from '../lib/etiquettes'
import { useData } from '../lib/data'
import { BackButton, formatDate, LieuPicker, PageHeader, Sheet, StatutBadge, toast } from '../components/ui'
import { Icon } from '../components/Icon'
import type { Evenement, Statut, TypeEvenement } from '../types'

const COULEUR: Record<TypeEvenement, string> = {
  creation: '#7C3AED', inventaire: '#047857', signalement: '#DC2626', deplacement: '#2563EB',
  reparation: '#047857', etiquette: '#475569', modification: '#475569', statut: '#B45309',
}

export default function Fiche() {
  const { ref = '' } = useParams()
  const { profil, anonyme } = useAuth()
  const admin = profil?.role === 'admin'
  const { materiel, categories, lieuCourant, lieux, ticketsActifs, pret } = useData()
  const m = materiel.find((x) => x.ref === ref)
  const [histo, setHisto] = useState<Evenement[]>([])
  const [busy, setBusy] = useState(false)
  const [sheet, setSheet] = useState<null | 'lieu-inv' | 'deplacer' | 'statut' | 'modifier'>(null)
  const [edition, setEdition] = useState<Record<string, string>>({})
  const [nomEdit, setNomEdit] = useState('')
  const [qteEdit, setQteEdit] = useState('')
  const [numEdit, setNumEdit] = useState('')

  useEffect(() => {
    if (anonyme) return
    return onSnapshot(
      query(collection(db, 'evenements'), where('materielRef', '==', ref), orderBy('date', 'desc'), limit(40)),
      (s) => setHisto(s.docs.map((d) => ({ id: d.id, ...d.data() }) as Evenement)),
      (e) => console.error(e),
    )
  }, [ref, anonyme])

  if (!m) {
    return (
      <div className="page">
        <PageHeader titre={pret ? 'Matériel introuvable' : 'Chargement…'} back />
        {pret && <div className="note warn">Aucun matériel avec la référence <span className="mono">{ref}</span>.</div>}
      </div>
    )
  }

  const ctx = { user: profil!, lieu: lieuCourant }
  const cat = categories.find((c) => c.id === m.categorieId)
  const tickets = ticketsActifs.filter((t) => t.materielRef === m.ref)
  const inventorieAujourdhui = m.dernierInventaire?.date && m.dernierInventaire.date.toDate().toDateString() === new Date().toDateString()

  const presentIci = async (lieuId?: string) => {
    const lieu = lieux.find((l) => l.id === (lieuId ?? lieuCourant?.id))
    if (!lieu) { setSheet('lieu-inv'); return }
    setBusy(true)
    try {
      const { deplace, propose } = await inventorier({ ...ctx, lieu }, m, lieu)
      toast(deplace ? `Inventorié · déplacé vers ${lieu.nom}` : propose ? `Inventorié · déplacement vers ${lieu.nom} proposé aux admins` : 'Inventorié ✓')
    } catch (e) { toast('Erreur : ' + String(e), 'err') } finally { setBusy(false) }
  }

  const infos: [string, string][] = [
    ['Catégorie', m.categorieNom],
    ...(m.numero != null ? [['Numéro', libelleNumero(m)] as [string, string]] : []),
    ...(m.modeleNom ? [['Modèle type', m.modeleNom] as [string, string]] : []),
    ...(cat?.champs ?? []).filter((c) => m.valeurs?.[c.key]).map((c) => [c.label, m.valeurs[c.key]] as [string, string]),
    ...(m.quantite ? [['Quantité', String(m.quantite)] as [string, string]] : []),
    ['Étiquette', m.etiquetee ? 'Imprimée' : 'À imprimer'],
    ['Créé par', `${m.creePar?.nom ?? '—'}`],
  ]

  const ouvrirModif = () => {
    setEdition({ ...(m.valeurs ?? {}) }); setNomEdit(m.nom); setQteEdit(m.quantite ? String(m.quantite) : ''); setNumEdit(m.numero != null ? String(m.numero) : ''); setSheet('modifier')
  }

  return (
    <div className="page">
      <div className="row between">
        <BackButton />
        <span className="ref" style={{ fontSize: 14, padding: '8px 12px', borderRadius: 10, background: 'var(--accent-tint)', border: '1px solid var(--accent-border)' }}>{m.ref}</span>
        {anonyme ? <span style={{ width: 44 }} /> : <Link to={`/etiquettes?ref=${encodeURIComponent(m.ref)}`} className="icon-btn" aria-label="Imprimer l'étiquette"><Icon name="printer" size={20} /></Link>}
      </div>

      {m.photoUrl && <div className="card flush" style={{ height: 180 }}><img src={m.photoUrl} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} /></div>}

      <div className="stack-s" style={{ gap: 10 }}>
        <div className="row" style={{ gap: 8, flexWrap: 'wrap' }}>
          <StatutBadge statut={m.statut} />
          {tickets.length > 0 && <span className="badge b-neutre">{tickets.length} ticket(s) ouvert(s)</span>}
        </div>
        <h1 className="h1">{m.nom}{m.numero != null ? <span style={{ color: 'var(--accent-ink)' }}> · {libelleNumero(m)}</span> : null}{m.quantite ? <span style={{ color: 'var(--muted)' }}> × {m.quantite}</span> : null}</h1>
        <div className="row muted" style={{ gap: 6, fontSize: 14 }}><Icon name="pin" size={16} />{m.lieuNom}</div>
      </div>

      {m.dernierInventaire && (
        <div className={`note ${inventorieAujourdhui ? 'ok' : 'info'}`}>
          Dernier inventaire : <strong>{m.dernierInventaire.nom}</strong> · {m.dernierInventaire.lieuNom} · {formatDate(m.dernierInventaire.date)}
        </div>
      )}

      <div className="grid-2">
        <button type="button" className="btn tall success" disabled={busy} onClick={() => presentIci()}>
          <Icon name="check" stroke={2.4} />{lieuCourant ? `Présent à ${lieuCourant.nom}` : 'Inventorié ici'}</button>
        <Link to={`/m/${encodeURIComponent(m.ref)}/signaler`} className="btn tall danger"><Icon name="alert" stroke={2.4} />Signaler un problème</Link>
        {admin && <button type="button" className="btn tall" onClick={() => setSheet('deplacer')}><Icon name="move" color="#1D4ED8" />Déplacer vers un autre parc</button>}
        {!anonyme && <button type="button" className="btn tall" onClick={() => setSheet('statut')}><Icon name="wrench" color="#1D4ED8" />Changer le statut</button>}
      </div>

      {tickets.length > 0 && (
        <div className="stack">
          <h2 className="h2">Tickets ouverts</h2>
          {tickets.map((t) => (
            <Link key={t.id} to={`/tickets/${t.id}`} className="card row" style={{ textDecoration: 'none', color: 'var(--text)', padding: 14 }}>
              <div className="grow"><div style={{ fontWeight: 700 }}>{t.description.slice(0, 60) || 'Sans description'}</div>
                <div className="muted"><span className="mono">{t.numero}</span> · {t.statut === 'en_cours' ? `pris en charge par ${t.assigneA?.nom}` : 'ouvert'}</div></div>
              <Icon name="chevron" size={18} />
            </Link>
          ))}
        </div>
      )}

      <div className="card flush" style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))' }}>
        {infos.map(([k, v]) => (
          <div key={k} style={{ padding: '13px 16px', borderBottom: '1px solid var(--divider)' }}>
            <div className="small" style={{ fontWeight: 600, color: 'var(--muted)' }}>{k}</div>
            <div style={{ fontSize: 14, fontWeight: 700, wordBreak: 'break-word' }}>{v}</div>
          </div>
        ))}
      </div>
      {!anonyme && <button type="button" className="btn small" onClick={ouvrirModif}><Icon name="edit" size={18} />Modifier la fiche</button>}

      {!anonyme && <div className="stack">
        <h2 className="h2">Historique</h2>
        <div className="tl">
          {histo.map((e) => (
            <div key={e.id} className="tl-item">
              <div className="tl-rail"><div className="tl-dot" style={{ background: COULEUR[e.type], boxShadow: `0 0 0 2px ${COULEUR[e.type]}` }} /><div className="tl-line" /></div>
              <div className="tl-body">
                <div style={{ fontSize: 14, fontWeight: 700 }}>{e.titre}</div>
                {e.commentaire && <div style={{ fontSize: 13, color: 'var(--text-2)' }}>{e.commentaire}</div>}
                <div style={{ fontSize: 13, color: 'var(--text-3)' }}>{e.userNom} · {e.lieuNom ?? 'lieu inconnu'}{e.gps ? ' (GPS)' : ''}</div>
                <div className="muted small">{formatDate(e.date)}</div>
                {e.photos?.length > 0 && <div className="row" style={{ gap: 6, marginTop: 4 }}>{e.photos.map((p) => <a key={p} href={p} target="_blank" rel="noreferrer"><img src={p} alt="" style={{ width: 56, height: 56, objectFit: 'cover', borderRadius: 10 }} /></a>)}</div>}
              </div>
            </div>
          ))}
          {histo.length === 0 && <div className="muted">Aucun événement.</div>}
        </div>
      </div>}

      {sheet === 'lieu-inv' && <LieuPicker titre="Où se trouve ce matériel ?" onClose={() => setSheet(null)} onPick={(id) => presentIci(id)} />}
      {sheet === 'deplacer' && <LieuPicker titre="Déplacer vers…" onClose={() => setSheet(null)} onPick={async (id) => {
        const l = lieux.find((x) => x.id === id)
        if (!l || l.id === m.lieuId) return
        try { await deplacer(ctx, m, l); toast(`Déplacé vers ${l.nom}`) } catch (e) { toast(String(e), 'err') }
      }} />}
      {sheet === 'statut' && (
        <Sheet titre="Statut du matériel" onClose={() => setSheet(null)}>
          <div className="stack-s">
            {(Object.keys(LIBELLES_STATUT) as Statut[]).map((s) => (
              <button key={s} type="button" className="btn" aria-pressed={m.statut === s} style={m.statut === s ? { borderColor: 'var(--text)', borderWidth: 2 } : undefined}
                onClick={async () => { setSheet(null); if (s !== m.statut) { await changerStatut(ctx, m, s); toast('Statut mis à jour') } }}>
                <StatutBadge statut={s} />
              </button>
            ))}
          </div>
        </Sheet>
      )}
      {sheet === 'modifier' && (
        <Sheet titre="Modifier la fiche" onClose={() => setSheet(null)}>
          <form className="stack" onSubmit={async (e) => {
            e.preventDefault()
            try {
              await modifierMateriel(ctx, m, { nom: nomEdit.trim() || m.nom, valeurs: edition, quantite: qteEdit ? Number(qteEdit) : m.quantite, numero: numEdit ? Number(numEdit) : null })
              toast('Fiche enregistrée'); setSheet(null)
            } catch (x) { toast(String(x), 'err') }
          }}>
            <label className="field">Nom<input className="input" value={nomEdit} onChange={(e) => setNomEdit(e.target.value)} /></label>
            {m.quantite === null && <label className="field">Numéro de la pièce (facultatif)<input className="input" type="number" min={1} inputMode="numeric" value={numEdit} onChange={(e) => setNumEdit(e.target.value)} /></label>}
            {m.quantite !== null && <label className="field">Quantité<input className="input" type="number" min={1} value={qteEdit} onChange={(e) => setQteEdit(e.target.value)} /></label>}
            {(cat?.champs ?? []).map((c) => (
              <label key={c.key} className="field">{c.label}
                <input className="input" placeholder={c.placeholder} value={edition[c.key] ?? ''} onChange={(e) => setEdition({ ...edition, [c.key]: e.target.value })} />
              </label>
            ))}
            <button className="btn primary block">Enregistrer</button>
          </form>
        </Sheet>
      )}
    </div>
  )
}
