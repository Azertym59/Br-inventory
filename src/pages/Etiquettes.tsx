import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { marquerEtiquetes, numeroter, trierSerie } from '../lib/actions'
import { useAuth } from '../lib/auth'
import { useData } from '../lib/data'
import {
  bluetoothDisponible, dessinerEtiquette, exporterExcel, FORMATS, formatParDefaut, memoriserFormat,
  fichierEtiquette, libelleNumero, partagerFichier, plateforme, type FormatEtiquette,
} from '../lib/etiquettes'
import { BottomNav, toast } from '../components/ui'
import { Icon } from '../components/Icon'
import type { Materiel } from '../types'

function Apercu({ m, f }: { m: Materiel | null; f: FormatEtiquette }) {
  const box = useRef<HTMLDivElement>(null)
  useEffect(() => {
    let ok = true
    const exemple = m ?? ({ ref: 'BR-00000', nom: 'Exemple de matériel', categorieNom: '', modeleNom: null, numero: null, lieuNom: '' } as unknown as Materiel)
    dessinerEtiquette(exemple, f).then((c) => {
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
  const { materiel, lieux, categories, modeles, lieuCourant } = useData()
  const [mode, setMode] = useState<'lot' | 'unite'>(params.get('ref') ? 'unite' : 'lot')
  const [format, setFormat] = useState<FormatEtiquette>(formatParDefaut)
  const [lieuId, setLieuId] = useState(params.get('lieu') ?? '')
  const [catId, setCatId] = useState(params.get('cat') ?? '')
  const [modeleId, setModeleId] = useState(params.get('modele') ?? '')
  const [sansEtiquette, setSansEtiquette] = useState(false)
  const [du, setDu] = useState('')
  const [au, setAu] = useState('')
  const [depart, setDepart] = useState('1')
  const [ref, setRef] = useState(params.get('ref') ?? '')
  const [busy, setBusy] = useState('')
  const stop = useRef(false)
  const os = plateforme()
  const bt = bluetoothDisponible()
  const ctx = { user: profil!, lieu: lieuCourant }

  const modelesCat = modeles.filter((m) => m.categorieId === catId)

  // Série filtrée, dans l'ordre des numéros
  const serie = useMemo(() => trierSerie(materiel.filter((m) =>
    (!lieuId || m.lieuId === lieuId) && (!catId || m.categorieId === catId) &&
    (!modeleId || m.modeleId === modeleId) && (!sansEtiquette || !m.etiquetee))), [materiel, lieuId, catId, modeleId, sansEtiquette])
  const sansNumero = serie.filter((m) => m.numero == null)
  const parNumero = serie.length > 0 && sansNumero.length === 0

  // Plage « du n° X au n° Y » : par numéro si toute la série est numérotée, sinon par position
  const lot = useMemo(() => {
    const a = parseInt(du)
    const b = parseInt(au)
    if (!a && !b) return serie
    if (parNumero) return serie.filter((m) => (!a || m.numero! >= a) && (!b || m.numero! <= b))
    return serie.slice(a ? a - 1 : 0, b || serie.length)
  }, [serie, du, au, parNumero])

  const unite = materiel.find((m) => m.ref === ref.trim().toUpperCase()) ?? null

  // Prochain numéro libre pour la catégorie / le modèle choisi
  useEffect(() => {
    const memeSerie = materiel.filter((m) => m.categorieId === catId && (!modeleId || m.modeleId === modeleId) && m.numero != null)
    setDepart(String(memeSerie.length ? Math.max(...memeSerie.map((m) => m.numero!)) + 1 : 1))
  }, [materiel, catId, modeleId])

  const choisirFormat = (f: FormatEtiquette) => { setFormat(f); memoriserFormat(f) }

  // Module Bluetooth préchargé : le clic doit ouvrir la liste des imprimantes sans attendre
  const niimbot = useRef<typeof import('../lib/niimbot') | null>(null)
  useEffect(() => { if (bt) import('../lib/niimbot').then((m) => { niimbot.current = m }).catch(() => {}) }, [bt])

  // Image iPhone préparée d'avance (Safari refuse le partage s'il arrive trop tard après le clic)
  const [fichier, setFichier] = useState<File | null>(null)
  useEffect(() => {
    let ok = true
    if (unite) fichierEtiquette(unite, format).then((f) => { if (ok) setFichier(f) })
    return () => { ok = false; setFichier(null) }
  }, [unite, format])

  const imprimerBluetooth = async (items: Materiel[]) => {
    const n = niimbot.current
    if (!n) { toast('Module d’impression en cours de chargement, réessaie', 'info'); return }
    stop.current = false
    setBusy('Connexion à l’imprimante…')
    const faits: Materiel[] = []
    try {
      await n.connecterImprimante()
      const tete = n.teteImpression()
      for (let i = 0; i < items.length; i++) {
        if (stop.current) break
        setBusy(`Impression ${i + 1} / ${items.length}…`)
        const canvas = await dessinerEtiquette(items[i], format,
          tete.direction === 'top' ? tete.pixels : Infinity, tete.direction === 'left' ? tete.pixels : Infinity)
        await n.imprimerCanvas(canvas)
        faits.push(items[i])
      }
      toast(stop.current ? `Arrêté après ${faits.length} étiquette(s)` : `${faits.length} étiquette(s) imprimée(s)`)
    } catch (e) {
      const msg = String(e)
      toast(msg.includes('cancel') || msg.includes('NotFound') ? 'Aucune imprimante choisie'
        : `Impression interrompue après ${faits.length} étiquette(s) : ${msg}`, 'err')
    } finally {
      if (faits.length) await marquerEtiquetes(ctx, faits).catch(() => {})
      setBusy('')
    }
  }

  const premier = lot[0]
  const dernier = lot[lot.length - 1]

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
            <div className="card stack">
              <label className="field">Catégorie
                <select className="input" value={catId} onChange={(e) => { setCatId(e.target.value); setModeleId(''); setDu(''); setAu('') }}>
                  <option value="">Toutes</option>
                  {categories.map((c) => <option key={c.id} value={c.id}>{c.nom}</option>)}
                </select>
              </label>
              {modelesCat.length > 0 && (
                <label className="field">Modèle
                  <select className="input" value={modeleId} onChange={(e) => { setModeleId(e.target.value); setDu(''); setAu('') }}>
                    <option value="">Tous les modèles</option>
                    {modelesCat.map((m) => <option key={m.id} value={m.id}>{m.nom}</option>)}
                  </select>
                </label>
              )}
              <label className="field">Lieu
                <select className="input" value={lieuId} onChange={(e) => setLieuId(e.target.value)}>
                  <option value="">Tous les lieux</option>
                  {lieux.map((l) => <option key={l.id} value={l.id}>{l.nom}</option>)}
                </select>
              </label>
              <label className="row between" style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-3)', minHeight: 44 }}>
                Uniquement le matériel sans étiquette
                <input type="checkbox" checked={sansEtiquette} onChange={(e) => setSansEtiquette(e.target.checked)} style={{ width: 24, height: 24, accentColor: '#047857' }} />
              </label>
            </div>

            {sansNumero.length > 0 && catId && (
              <div className="note warn stack-s" style={{ gap: 10 }}>
                <div><strong>{sansNumero.length} pièce(s) sans numéro</strong> dans cette sélection. Numérote-les pour imprimer « {libelleNumero({ categorieNom: sansNumero[0].categorieNom, numero: Number(depart) || 1 })} » sur l'étiquette.</div>
                <div className="row" style={{ gap: 8 }}>
                  <label className="field grow" style={{ color: 'inherit' }}>Premier numéro
                    <input className="input" type="number" min={1} inputMode="numeric" value={depart} onChange={(e) => setDepart(e.target.value)} />
                  </label>
                  <button type="button" className="btn small" style={{ alignSelf: 'flex-end', minHeight: 48 }} disabled={!!busy} onClick={async () => {
                    const d = Math.max(1, parseInt(depart) || 1)
                    if (!confirm(`Numéroter ${sansNumero.length} pièce(s) de ${d} à ${d + sansNumero.length - 1}, dans l'ordre des références ?`)) return
                    setBusy('Numérotation…')
                    try { await numeroter(sansNumero, d); toast('Numérotation enregistrée') } catch (e) { toast(String(e), 'err') } finally { setBusy('') }
                  }}>Numéroter</button>
                </div>
              </div>
            )}

            <div className="card stack-s" style={{ gap: 10 }}>
              <div style={{ fontSize: 14, fontWeight: 700 }}>{parNumero ? 'Imprimer du numéro… au numéro…' : 'Imprimer de la n°… à la n°… (position dans la liste)'}</div>
              <div className="grid-2">
                <label className="field">Du<input className="input" type="number" min={1} inputMode="numeric" placeholder={parNumero ? String(serie[0]?.numero ?? 1) : '1'} value={du} onChange={(e) => setDu(e.target.value)} /></label>
                <label className="field">Au<input className="input" type="number" min={1} inputMode="numeric" placeholder={parNumero ? String(serie[serie.length - 1]?.numero ?? '') : String(serie.length)} value={au} onChange={(e) => setAu(e.target.value)} /></label>
              </div>
              <div className="muted small">Laisse vide pour tout imprimer ({serie.length}).</div>
            </div>

            <Apercu m={premier ?? null} f={format} />

            <div className="note info row between">
              <span>{lot.length ? <>Étiquettes à imprimer<br /><span className="small">{premier.numero != null ? libelleNumero(premier) : premier.ref}{lot.length > 1 ? ` → ${dernier.numero != null ? libelleNumero(dernier) : dernier.ref}` : ''}</span></> : 'Aucune étiquette'}</span>
              <span style={{ fontSize: 24, fontWeight: 800 }}>{lot.length}</span>
            </div>

            {bt && (busy && busy.startsWith('Impression') ? (
              <button type="button" className="btn danger block" onClick={() => { stop.current = true }}>Arrêter · {busy}</button>
            ) : (
              <button type="button" className="btn primary block" disabled={!lot.length || !!busy} onClick={() => imprimerBluetooth(lot)}>
                <Icon name="bluetooth" stroke={2.4} />{busy || `Imprimer les ${lot.length} en Bluetooth`}</button>
            ))}
            <button type="button" className={`btn block ${bt ? '' : 'primary'}`} disabled={!lot.length} onClick={async () => { await exporterExcel(lot); toast('Fichier Excel téléchargé') }}>
              <Icon name="download" stroke={2.4} />Exporter Excel pour l'appli Niimbot</button>
            <button type="button" className="btn small block" disabled={!lot.length} onClick={async () => {
              if (!confirm(`Marquer ${lot.length} matériel(s) comme étiqueté(s) ?`)) return
              await marquerEtiquetes(ctx, lot); toast('Marqués comme étiquetés')
            }}>Marquer ce lot comme étiqueté</button>
            <p className="muted small" style={{ lineHeight: 1.5 }}>Appli Niimbot : nouveau modèle → importer Excel → colonne « URL » en QR code, « Modèle », « Numéro » et « Référence » en textes. L'impression Bluetooth fonctionne depuis Chrome sur Android ou ordinateur.</p>
          </>
        ) : (
          <>
            <label className="field">Référence du matériel
              <input className="input mono" placeholder="Ex. : BR-00042" value={ref} onChange={(e) => setRef(e.target.value.toUpperCase())} />
            </label>
            {unite ? (
              <Link to={`/m/${encodeURIComponent(unite.ref)}`} className="card row" style={{ padding: '12px 14px', textDecoration: 'none', color: 'var(--text)' }}>
                <div className="grow"><div style={{ fontWeight: 700 }}>{unite.nom}{unite.numero != null ? ` · ${libelleNumero(unite)}` : ''}</div><span className="ref">{unite.ref}</span> <span className="muted">· {unite.lieuNom}</span></div>
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
                <button type="button" className="btn primary block" disabled={!unite || !fichier} onClick={() => {
                  if (!unite || !fichier) return
                  partagerFichier(fichier).then(async (r) => {
                    await marquerEtiquetes(ctx, [unite]); toast(r === 'partage' ? 'Ouvre-la dans Niimbot pour imprimer' : 'Image téléchargée')
                  }).catch(() => {})
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
