import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { messageErreur, post } from '../lib/api'
import { creerMateriel, positionGps } from '../lib/actions'
import { aLeRole, useAuth } from '../lib/auth'
import { useData } from '../lib/data'
import { calculerResolution, couleurFamille, FAMILLES } from '../data/catalogue'
import { PageHeader, PhotoPicker, Sheet, toast } from '../components/ui'
import { Icon } from '../components/Icon'
import type { Categorie, Modele } from '../types'

function slug(s: string) {
  return s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'categorie'
}

export default function Ajout() {
  const nav = useNavigate()
  const { profil } = useAuth()
  const { categories, modeles, lieux, lieuCourant, materiel } = useData()
  const responsable = aLeRole(profil, 'admin')
  const [catId, setCatId] = useState<string>('')
  const [modeleId, setModeleId] = useState<string | null>(null)
  const [quantiteMode, setQuantiteMode] = useState(false)
  const [quantite, setQuantite] = useState('10')
  const [exemplaires, setExemplaires] = useState('1')
  const [numeroter, setNumeroter] = useState(true)
  const [numeroDepart, setNumeroDepart] = useState('1')
  const [valeurs, setValeurs] = useState<Record<string, string>>({})
  const [nom, setNom] = useState('')
  const [nomTouche, setNomTouche] = useState(false)
  const [lieuId, setLieuId] = useState(lieuCourant?.id ?? '')
  const [photo, setPhoto] = useState<File[]>([])
  const [busy, setBusy] = useState('')
  const [nouvelleCat, setNouvelleCat] = useState(false)
  const [nouveauModele, setNouveauModele] = useState(false)

  const cat = categories.find((c) => c.id === catId)
  const modelesCat = modeles.filter((m) => m.categorieId === catId)
  const modele = modelesCat.find((m) => m.id === modeleId) ?? null
  const familles = useMemo(() => {
    const noms = [...FAMILLES.map((f) => f.nom), ...categories.map((c) => c.famille)]
    return [...new Set(noms)].map((f) => ({ nom: f, cats: categories.filter((c) => c.famille === f) })).filter((f) => f.cats.length)
  }, [categories])

  useEffect(() => { if (!lieuId && lieuCourant) setLieuId(lieuCourant.id) }, [lieuCourant, lieuId])

  // Numéro proposé : la suite de la série existante (même catégorie et même modèle)
  useEffect(() => {
    const serie = materiel.filter((m) => m.categorieId === catId && (m.modeleId ?? null) === (modeleId ?? null) && m.numero != null)
    setNumeroDepart(String(serie.length ? Math.max(...serie.map((m) => m.numero!)) + 1 : 1))
  }, [materiel, catId, modeleId])

  // Nom proposé automatiquement (modifiable)
  useEffect(() => {
    if (nomTouche || !cat) return
    const detail = modele?.nom ?? valeurs.modele ?? valeurs.type ?? ''
    const lg = valeurs.longueur ? ` ${valeurs.longueur} m` : ''
    setNom(`${cat.nom}${detail ? ` ${detail}` : ''}${lg}`.trim())
  }, [cat, modele, valeurs, nomTouche])

  const choisirCat = (c: Categorie) => {
    setCatId(c.id); setModeleId(null); setValeurs({}); setQuantiteMode(c.quantiteParDefaut); setNomTouche(false)
  }
  const choisirModele = (m: Modele) => {
    if (modeleId === m.id) { setModeleId(null); return }
    setModeleId(m.id); setValeurs({ ...m.valeurs }); setNomTouche(false)
  }
  const setVal = (k: string, v: string) => {
    const nv = { ...valeurs, [k]: v }
    if ((k === 'dimensions' || k === 'pitch') && cat?.champs.some((c) => c.key === 'resolution')) {
      const r = calculerResolution(nv.dimensions ?? '', nv.pitch ?? '')
      if (r) nv.resolution = r
    }
    setValeurs(nv)
  }

  const champsVisibles = modele ? (cat?.champs ?? []).filter((c) => !modele.valeurs[c.key]) : (cat?.champs ?? [])

  const creer = async (imprimer: boolean) => {
    const lieu = lieux.find((l) => l.id === lieuId)
    if (!cat || !lieu || !profil) { toast('Choisis une catégorie et un lieu', 'err'); return }
    const n = quantiteMode ? 1 : Math.max(1, Math.min(500, parseInt(exemplaires) || 1))
    const depart = Math.max(1, parseInt(numeroDepart) || 1)
    const avecNumero = !quantiteMode && numeroter
    try {
      setBusy(n > 1 ? `Création des ${n} pièces…` : 'Création…')
      const gps = await positionGps(4000)
      const refs = await creerMateriel({ user: profil, lieu }, {
        categorie: cat, modele, nom: nom.trim() || cat.nom, valeurs,
        quantite: quantiteMode ? Math.max(1, parseInt(quantite) || 1) : null, lieu, photo: photo[0] ?? null,
        exemplaires: n, numeroDepart: avecNumero ? depart : null, gps,
      })
      toast(n > 1 ? `${n} matériels créés (${refs[0]} → ${refs[n - 1]})` : `${refs[0]} créé`)
      if (n > 1) nav(`/etiquettes?lieu=${lieu.id}&cat=${cat.id}${modele ? `&modele=${modele.id}` : ''}`)
      else nav(imprimer ? `/etiquettes?ref=${refs[0]}` : `/m/${refs[0]}`)
    } catch (e) {
      toast(`Création impossible : ${messageErreur(e)}`, 'err')
    } finally { setBusy('') }
  }

  return (
    <>
      <div className="page sans-nav">
        <PageHeader titre="Nouveau matériel" back />

        <div className="stack">
          <div style={{ fontSize: 14, fontWeight: 700 }}>Catégorie</div>
          {categories.length === 0 && <div className="note warn">Aucune catégorie : un administrateur doit les installer (Administration).</div>}
          {familles.map((f) => (
            <div key={f.nom} className="card stack-s" style={{ padding: 12, gap: 8 }}>
              <div className="row" style={{ gap: 8 }}>
                <span style={{ width: 8, height: 8, borderRadius: 99, background: couleurFamille(f.nom) }} />
                <span className="small" style={{ fontWeight: 800, letterSpacing: '.06em', textTransform: 'uppercase', color: couleurFamille(f.nom) }}>{f.nom}</span>
              </div>
              <div className="chips" role="radiogroup" aria-label={f.nom}>
                {f.cats.map((c) => (
                  <button key={c.id} type="button" role="radio" className="chip" aria-checked={c.id === catId} onClick={() => choisirCat(c)}
                    style={c.id === catId ? { background: couleurFamille(f.nom), borderColor: couleurFamille(f.nom) } : undefined}>{c.nom}</button>
                ))}
              </div>
            </div>
          ))}
          <button type="button" className="btn" style={{ borderStyle: 'dashed', borderWidth: 2, color: 'var(--accent-ink)' }}
            onClick={() => responsable ? setNouvelleCat(true) : toast('Seul un admin peut créer une catégorie', 'info')}>
            <Icon name="plus" stroke={2.6} size={18} />Autre : créer une catégorie
          </button>
        </div>

        {cat && (
          <>
            {(modelesCat.length > 0 || responsable) && (
              <div className="card stack-s" style={{ gap: 10 }}>
                <div className="row between">
                  <div style={{ fontSize: 14, fontWeight: 700 }}>Modèle type</div>
                  {responsable && <button type="button" className="btn small" style={{ border: 0, color: 'var(--accent-ink)' }} onClick={() => setNouveauModele(true)}>+ Nouveau modèle</button>}
                </div>
                {modelesCat.length === 0 && <div className="muted small">Crée un modèle (ex. « P3.91 outdoor 500 × 1000 ») pour ne plus retaper les caractéristiques.</div>}
                <div className="stack-s" role="radiogroup">
                  {modelesCat.map((m) => (
                    <button key={m.id} type="button" role="radio" aria-checked={m.id === modeleId} onClick={() => choisirModele(m)} className="btn"
                      style={{ justifyContent: 'flex-start', flexDirection: 'column', alignItems: 'flex-start', gap: 2, padding: '8px 14px', ...(m.id === modeleId ? { background: 'var(--text)', color: '#fff', borderColor: 'var(--text)' } : {}) }}>
                      <span style={{ fontWeight: 800 }}>{m.nom}</span>
                      <span className="small" style={{ fontWeight: 600, opacity: 0.85 }}>{cat.champs.filter((c) => m.valeurs[c.key]).map((c) => `${c.label.replace(/\s*\(.*\)/, '')} ${m.valeurs[c.key]}`).join(' · ')}</span>
                    </button>
                  ))}
                </div>
                {modele && <div className="note ok">Caractéristiques pré-remplies depuis le modèle.</div>}
              </div>
            )}

            <div className="stack-s" style={{ gap: 10 }}>
              <div style={{ fontSize: 14, fontWeight: 700 }}>Suivi</div>
              <div className="grid-2" role="radiogroup" aria-label="Mode de suivi">
                {[[false, 'À l’unité', '1 QR = 1 objet'], [true, 'En quantité', '1 QR sur le bac / lot']].map(([v, t, s]) => (
                  <button key={String(v)} type="button" role="radio" aria-checked={quantiteMode === v} onClick={() => setQuantiteMode(v as boolean)} className="btn tall"
                    style={{ minHeight: 64, borderWidth: 2, ...(quantiteMode === v ? { borderColor: v ? 'var(--amber)' : 'var(--accent)', background: v ? 'var(--amber-tint)' : 'var(--accent-tint)' } : {}) }}>
                    <span style={{ fontWeight: 800 }}>{t as string}</span><span className="small muted">{s as string}</span>
                  </button>
                ))}
              </div>
            </div>

            <div className="stack">
              <div style={{ fontSize: 14, fontWeight: 700 }}>Informations · {cat.nom}</div>
              {quantiteMode ? (
                <label className="field">Quantité dans le lot
                  <input className="input" type="number" min={1} inputMode="numeric" value={quantite} onChange={(e) => setQuantite(e.target.value)} />
                </label>
              ) : (
                <>
                  <label className="field">Nombre d'exemplaires à créer
                    <input className="input" type="number" min={1} max={500} inputMode="numeric" aria-label="Nombre d'exemplaires à créer" value={exemplaires} onChange={(e) => setExemplaires(e.target.value)} />
                    <span className="muted small" style={{ fontWeight: 500 }}>Ex. : 195 dalles identiques → 195 fiches et 195 QR codes. Les n° de série se complètent ensuite sur chaque fiche.</span>
                  </label>
                  <div className="card stack-s" style={{ gap: 10, padding: 14 }}>
                    <label className="row between" style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-3)' }}>
                      Numéroter les pièces (« {cat.nom.split(/\s+/)[0]} 001 »…)
                      <input type="checkbox" checked={numeroter} onChange={(e) => setNumeroter(e.target.checked)} style={{ width: 24, height: 24, accentColor: '#2563EB' }} />
                    </label>
                    {numeroter && (
                      <label className="field">Premier numéro
                        <input className="input" type="number" min={1} inputMode="numeric" aria-label="Premier numéro" value={numeroDepart} onChange={(e) => setNumeroDepart(e.target.value)} />
                        <span className="muted small" style={{ fontWeight: 500 }}>
                          {(() => { const d = Math.max(1, parseInt(numeroDepart) || 1); const k = Math.max(1, parseInt(exemplaires) || 1); const p = (x: number) => String(x).padStart(3, '0'); return k > 1 ? `De ${p(d)} à ${p(d + k - 1)}` : `N° ${p(d)}` })()} · imprimé en gros sur l'étiquette
                        </span>
                      </label>
                    )}
                  </div>
                </>
              )}
              {champsVisibles.map((c) => (
                <label key={c.key} className="field">{c.label}
                  <input className="input" placeholder={c.placeholder} value={valeurs[c.key] ?? ''} onChange={(e) => setVal(c.key, e.target.value)} />
                </label>
              ))}
              <label className="field">Nom affiché
                <input className="input" value={nom} onChange={(e) => { setNom(e.target.value); setNomTouche(true) }} />
              </label>
              <label className="field">Lieu
                <select className="input" value={lieuId} onChange={(e) => setLieuId(e.target.value)}>
                  <option value="" disabled>Choisir…</option>
                  {lieux.map((l) => <option key={l.id} value={l.id}>{l.nom}</option>)}
                </select>
              </label>
              <div className="stack-s"><div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-3)' }}>Photo de référence (facultatif)</div>
                <PhotoPicker fichiers={photo} onChange={setPhoto} max={1} /></div>
            </div>
          </>
        )}
      </div>

      {cat && (
        <div className="action-bar"><div className="inner">
          <button type="button" className="btn" disabled={!!busy} onClick={() => creer(false)}>Créer</button>
          <button type="button" className="btn primary" disabled={!!busy} onClick={() => creer(true)}><Icon name="printer" size={20} />{busy || 'Créer + étiquette'}</button>
        </div></div>
      )}

      {nouvelleCat && <NouvelleCategorie onClose={() => setNouvelleCat(false)} onCree={(id) => { setNouvelleCat(false); setCatId(id) }} nbExistantes={categories.length} />}
      {nouveauModele && cat && <NouveauModele cat={cat} valeursInitiales={valeurs} onClose={() => setNouveauModele(false)} onCree={(id, v) => { setNouveauModele(false); setModeleId(id); setValeurs({ ...valeurs, ...v }); setNomTouche(false) }} />}
    </>
  )
}

function NouvelleCategorie({ onClose, onCree }: { onClose: () => void; onCree: (id: string) => void; nbExistantes?: number }) {
  const { rafraichir } = useData()
  const [nom, setNom] = useState('')
  const [famille, setFamille] = useState('Divers')
  const [champs, setChamps] = useState('Modèle, N° de série')
  const [qte, setQte] = useState(false)
  return (
    <Sheet titre="Nouvelle catégorie" onClose={onClose}>
      <form className="stack" onSubmit={async (e) => {
        e.preventDefault()
        if (!nom.trim()) return
        const liste = champs.split(',').map((s) => s.trim()).filter(Boolean).map((label) => ({ key: slug(label).replace(/-/g, '_') || 'champ', label, placeholder: '' }))
        try {
          const r = await post<{ id: string }>('/categories', { nom: nom.trim(), famille, champs: liste, quantiteParDefaut: qte })
          await rafraichir(); toast('Catégorie créée'); onCree(r.id)
        } catch (x) { toast(messageErreur(x), 'err') }
      }}>
        <label className="field">Nom<input className="input" autoFocus value={nom} onChange={(e) => setNom(e.target.value)} placeholder="Ex. : Pied de levage, Talkie-walkie…" /></label>
        <label className="field">Famille
          <select className="input" value={famille} onChange={(e) => setFamille(e.target.value)}>{FAMILLES.map((f) => <option key={f.nom}>{f.nom}</option>)}</select>
        </label>
        <label className="field">Champs à renseigner (séparés par des virgules)<input className="input" value={champs} onChange={(e) => setChamps(e.target.value)} /></label>
        <label className="row between" style={{ fontWeight: 700, fontSize: 14, color: 'var(--text-3)' }}>Suivi en quantité par défaut
          <input type="checkbox" checked={qte} onChange={(e) => setQte(e.target.checked)} style={{ width: 24, height: 24 }} /></label>
        <button className="btn primary block">Créer la catégorie</button>
      </form>
    </Sheet>
  )
}

function NouveauModele({ cat, valeursInitiales, onClose, onCree }: { cat: Categorie; valeursInitiales: Record<string, string>; onClose: () => void; onCree: (id: string, valeurs: Record<string, string>) => void }) {
  const { rafraichir } = useData()
  const [nom, setNom] = useState('')
  const [v, setV] = useState<Record<string, string>>(() => { const x = { ...valeursInitiales }; delete x.serie; return x })
  const champs = cat.champs.filter((c) => c.key !== 'serie')
  return (
    <Sheet titre={`Nouveau modèle · ${cat.nom}`} onClose={onClose}>
      <form className="stack" onSubmit={async (e) => {
        e.preventDefault()
        if (!nom.trim()) return
        try {
          const r = await post<{ id: string }>('/modeles', { categorieId: cat.id, nom: nom.trim(), valeurs: v })
          await rafraichir(); toast('Modèle enregistré'); onCree(r.id, v)
        } catch (x) { toast(messageErreur(x), 'err') }
      }}>
        <label className="field">Nom du modèle<input className="input" autoFocus value={nom} onChange={(e) => setNom(e.target.value)} placeholder="Ex. : P3.91 outdoor 500 × 1000" /></label>
        {champs.map((c) => (
          <label key={c.key} className="field">{c.label}
            <input className="input" placeholder={c.placeholder} value={v[c.key] ?? ''} onChange={(e) => {
              const nv = { ...v, [c.key]: e.target.value }
              if (c.key === 'dimensions' || c.key === 'pitch') { const r = calculerResolution(nv.dimensions ?? '', nv.pitch ?? ''); if (r) nv.resolution = r }
              setV(nv)
            }} />
          </label>
        ))}
        <button className="btn primary block">Enregistrer le modèle</button>
      </form>
    </Sheet>
  )
}
