import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { marquerEtiquetes } from '../lib/actions'
import { useAuth } from '../lib/auth'
import { useData } from '../lib/data'
import {
  bluetoothDisponible, dessinerEtiquette, exporterExcel, FORMATS, formatParDefaut, memoriserFormat,
  partagerEtiquette, plateforme, type FormatEtiquette,
} from '../lib/etiquettes'
import { BottomNav, toast } from '../components/ui'
import { Icon } from '../components/Icon'
import type { Materiel } from '../types'

function Apercu({ m, f }: { m: Materiel | null; f: FormatEtiquette }) {
  const box = useRef<HTMLDivElement>(null)
  useEffect(() => {
    let ok = true
    const exemple = m ?? ({ ref: 'BR-00000', nom: 'Exemple de matériel', lieuNom: '' } as Materiel)
    dessinerEtiquette(exemple, f, exemple.lieuNom).then((c) => {
      if (!ok || !box.current) return
      c.style.width = `${f.largeurMm * 4}px`
      box.current.replaceChildren(c)
    })
    return () => { ok = false }
  }, [m, f])
  return (
    <div className="label-preview">
      <div ref={box} />
      <div className="muted small">Aperçu à l'échelle · {f.label} mm{f.largeurMm > 48 && f.hauteurMm > 48 ? ' · la B1 imprime 48 mm utiles' : ''}</div>
    </div>
  )
}

export default function Etiquettes() {
  const [params] = useSearchParams()
  const { profil } = useAuth()
  const { materiel, lieux, categories, lieuCourant } = useData()
  const [mode, setMode] = useState<'lot' | 'unite'>(params.get('ref') ? 'unite' : 'lot')
  const [format, setFormat] = useState<FormatEtiquette>(formatParDefaut)
  const [lieuId, setLieuId] = useState(params.get('lieu') ?? '')
  const [catId, setCatId] = useState('')
  const [sansEtiquette, setSansEtiquette] = useState(true)
  const [ref, setRef] = useState(params.get('ref') ?? '')
  const [busy, setBusy] = useState('')
  const os = plateforme()
  const bt = bluetoothDisponible()
  const ctx = { user: profil!, lieu: lieuCourant }

  const lot = useMemo(() => materiel.filter((m) =>
    (!lieuId || m.lieuId === lieuId) && (!catId || m.categorieId === catId) && (!sansEtiquette || !m.etiquetee)), [materiel, lieuId, catId, sansEtiquette])
  const unite = materiel.find((m) => m.ref === ref.trim().toUpperCase()) ?? null

  const choisirFormat = (f: FormatEtiquette) => { setFormat(f); memoriserFormat(f) }

  const imprimerBluetooth = async (items: Materiel[]) => {
    setBusy('Connexion à l’imprimante…')
    try {
      const { connecterImprimante, imprimerCanvas } = await import('../lib/niimbot')
      await connecterImprimante()
      for (let i = 0; i < items.length; i++) {
        setBusy(`Impression ${i + 1} / ${items.length}…`)
        await imprimerCanvas(await dessinerEtiquette(items[i], format, items[i].lieuNom))
      }
      await marquerEtiquetes(ctx, items)
      toast(`${items.length} étiquette(s) imprimée(s)`)
    } catch (e) {
      const msg = String(e)
      toast(msg.includes('cancel') || msg.includes('NotFound') ? 'Aucune imprimante choisie' : 'Impression impossible : ' + msg, 'err')
    } finally { setBusy('') }
  }

  return (
    <>
      <div className="page">
        <div className="stack-s" style={{ gap: 4 }}><div className="eyebrow">Niimbot B1</div><h1 className="h1">Étiquettes QR</h1></div>

        <div className="seg" role="tablist" aria-label="Mode d'impression">
          <button type="button" role="tab" aria-selected={mode === 'lot'} onClick={() => setMode('lot')}>Par lot</button>
          <button type="button" role="tab" aria-selected={mode === 'unite'} onClick={() => setMode('unite')}>À l'unité</button>
        </div>

        <div className="stack-s" style={{ gap: 10 }}>
          <div style={{ fontSize: 14, fontWeight: 700 }}>Format d'étiquette</div>
          <div className="grid-3" role="radiogroup" aria-label="Format">
            {FORMATS.map((f) => <button key={f.id} type="button" role="radio" className="chip mono" aria-checked={format.id === f.id} onClick={() => choisirFormat(f)} style={{ minHeight: 44 }}>{f.label}</button>)}
          </div>
        </div>

        {mode === 'lot' ? (
          <>
            <Apercu m={lot[0] ?? null} f={format} />
            <div className="card stack">
              <label className="field">Lieu
                <select className="input" value={lieuId} onChange={(e) => setLieuId(e.target.value)}>
                  <option value="">Tous les lieux</option>
                  {lieux.map((l) => <option key={l.id} value={l.id}>{l.nom}</option>)}
                </select>
              </label>
              <label className="field">Catégorie
                <select className="input" value={catId} onChange={(e) => setCatId(e.target.value)}>
                  <option value="">Toutes</option>
                  {categories.map((c) => <option key={c.id} value={c.id}>{c.nom}</option>)}
                </select>
              </label>
              <label className="row between" style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-3)', minHeight: 44 }}>
                Uniquement le matériel sans étiquette
                <input type="checkbox" checked={sansEtiquette} onChange={(e) => setSansEtiquette(e.target.checked)} style={{ width: 24, height: 24, accentColor: '#047857' }} />
              </label>
            </div>
            <div className="note info row between"><span>Étiquettes à imprimer</span><span style={{ fontSize: 24, fontWeight: 800 }}>{lot.length}</span></div>
            <button type="button" className="btn primary block" disabled={!lot.length} onClick={async () => { await exporterExcel(lot); toast('Fichier Excel téléchargé') }}>
              <Icon name="download" stroke={2.4} />Exporter Excel pour l'appli Niimbot</button>
            {bt && <button type="button" className="btn block" disabled={!lot.length || !!busy} onClick={() => imprimerBluetooth(lot)}>
              <Icon name="bluetooth" />{busy || `Imprimer les ${lot.length} en Bluetooth`}</button>}
            <button type="button" className="btn small block" disabled={!lot.length} onClick={async () => {
              if (!confirm(`Marquer ${lot.length} matériel(s) comme étiqueté(s) ?`)) return
              await marquerEtiquetes(ctx, lot); toast('Marqués comme étiquetés')
            }}>Marquer ce lot comme étiqueté</button>
            <p className="muted small" style={{ lineHeight: 1.5 }}>Dans l'appli Niimbot : nouveau modèle → importer Excel → associer la colonne « URL » à un QR code et « Référence » / « Nom » à des textes.</p>
          </>
        ) : (
          <>
            <label className="field">Référence du matériel
              <input className="input mono" placeholder="Ex. : BR-00042" value={ref} onChange={(e) => setRef(e.target.value.toUpperCase())} />
            </label>
            {unite ? (
              <Link to={`/m/${encodeURIComponent(unite.ref)}`} className="card row" style={{ padding: '12px 14px', textDecoration: 'none', color: 'var(--text)' }}>
                <div className="grow"><div style={{ fontWeight: 700 }}>{unite.nom}</div><span className="ref">{unite.ref}</span> <span className="muted">· {unite.lieuNom}</span></div>
                {unite.etiquetee && <span className="badge b-ok">Déjà étiqueté</span>}
              </Link>
            ) : ref && <div className="note warn">Référence inconnue.</div>}
            <Apercu m={unite} f={format} />
            {bt && os !== 'ios' ? (
              <>
                <div className="note ok">Impression directe en Bluetooth vers la Niimbot B1 (allume-la, la première fois choisis-la dans la liste).</div>
                <button type="button" className="btn primary block" disabled={!unite || !!busy} onClick={() => unite && imprimerBluetooth([unite])}>
                  <Icon name="bluetooth" stroke={2.4} />{busy || 'Imprimer directement'}</button>
              </>
            ) : (
              <>
                <div className="note warn">{os === 'ios' ? 'Sur iPhone, l’impression passe par l’appli Niimbot : l’étiquette est générée en image au bon format.' : 'Ce navigateur ne gère pas le Bluetooth : l’étiquette est générée en image.'}</div>
                <button type="button" className="btn primary block" disabled={!unite} onClick={async () => {
                  if (!unite) return
                  const r = await partagerEtiquette(unite, format).catch(() => null)
                  if (r) { await marquerEtiquetes(ctx, [unite]); toast(r === 'partage' ? 'Ouvre-la dans Niimbot pour imprimer' : 'Image téléchargée') }
                }}><Icon name="share" stroke={2.4} />{os === 'ios' ? 'Partager vers Niimbot' : 'Télécharger l’image'}</button>
              </>
            )}
          </>
        )}
      </div>
      <BottomNav />
    </>
  )
}
