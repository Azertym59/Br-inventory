import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { addDoc, collection, doc, setDoc } from 'firebase/firestore'
import { db } from '../firebase'
import { creerMateriel } from '../lib/actions'
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
  const { categories, modeles, lieux, lieuCourant } = useData()
  const responsable = aLeRole(profil, 'responsable')
  const [catId, setCatId] = useState<string>('')
  const [modeleId, setModeleId] = useState<string | null>(null)
  const [quantiteMode, setQuantiteMode] = useState(false)
  const [quantite, setQuantite] = useState('10')
  const [exemplaires, setExemplaires] = useState('1')
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
    const n = quantiteMode ? 1 : Math.max(1, Math.min(200, parseInt(exemplaires) || 1))
    const refs: string[] = []
    try {
      for (let i = 0; i < n; i++) {
        setBusy(n > 1 ? `Création ${i + 1} / ${n}…` : 'Création…')
        refs.push(await creerMateriel({ user: profil, lieu }, {
          categorie: cat, modele, nom: nom.trim() || cat.nom, valeurs: i === 0 ? valeurs : { ...valeurs, serie: '' },
          quantite: quantiteMode ? Math.max(1, parseInt(quantite) || 1) : null, lieu, photo: i === 0 ? photo[0] ?? null : null,
        }))
      }
      toast(n > 1 ? `${n} matériels créés (${refs[0]} → ${refs[n - 1]})` : `${refs[0]} créé`)
      if (n > 1) nav(`/etiquettes?lieu=${lieu.id}`)
      else nav(imprimer ? `/etiquettes?ref=${refs[0]}` : `/m/${refs[0]}`)
    } catch (e) {
      toast(String(e).includes('hors-ligne') ? 'Pas de réseau : la création nécessite une connexion' : 'Erreur : ' + String(e), 'err')
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
            onClick={() => responsable ? setNouvelleCat(true) : toast('Seul un responsable peut créer une catégorie', 'info')}>
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
                <label className="field">Nombre d'exemplaires à créer
                  <input className="input" type="number" min={1} max={200} inputMode="numeric" value={exemplaires} onChange={(e) => setExemplaires(e.target.value)} />
                  <span className="muted small" style={{ fontWeight: 500 }}>Ex. : 24 dalles identiques → 24 fiches et 24 QR codes. Les n° de série se complètent ensuite sur chaque fiche.</span>
                </label>
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
      {nouveauModele && cat && <NouveauModele cat={cat} valeursInitiales={valeurs} onClose={() => setNouveauModele(false)} onCree={(id) => { setNouveauModele(false); setModeleId(id) }} />}
    </>
  )
}

function NouvelleCategorie({ onClose, onCree, nbExistantes }: { onClose: () => void; onCree: (id: string) => void; nbExistantes: number }) {
  const [nom, setNom] = useState('')
  const [famille, setFamille] = useState('Divers')
  const [champs, setChamps] = useState('Modèle, N° de série')
  const [qte, setQte] = useState(false)
  return (
    <Sheet titre="Nouvelle catégorie" onClose={onClose}>
      <form className="stack" onSubmit={async (e) => {
        e.preventDefault()
        if (!nom.trim()) return
        const id = `${slug(nom)}-${Date.now().toString(36)}`
        const liste = champs.split(',').map((s) => s.trim()).filter(Boolean).map((label) => ({ key: slug(label).replace(/-/g, '_') || 'champ', label, placeholder: '' }))
        await setDoc(doc(db, 'categories', id), { nom: nom.trim(), famille, champs: liste, quantiteParDefaut: qte, ordre: nbExistantes + 1 })
        toast('Catégorie créée'); onCree(id)
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

function NouveauModele({ cat, valeursInitiales, onClose, onCree }: { cat: Categorie; valeursInitiales: Record<string, string>; onClose: () => void; onCree: (id: string) => void }) {
  const [nom, setNom] = useState('')
  const [v, setV] = useState<Record<string, string>>(() => { const x = { ...valeursInitiales }; delete x.serie; return x })
  const champs = cat.champs.filter((c) => c.key !== 'serie')
  return (
    <Sheet titre={`Nouveau modèle · ${cat.nom}`} onClose={onClose}>
      <form className="stack" onSubmit={async (e) => {
        e.preventDefault()
        if (!nom.trim()) return
        const r = await addDoc(collection(db, 'modeles'), { categorieId: cat.id, nom: nom.trim(), valeurs: v })
        toast('Modèle enregistré'); onCree(r.id)
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
