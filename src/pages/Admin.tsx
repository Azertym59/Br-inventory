import { useEffect, useState } from 'react'
import { addDoc, collection, doc, onSnapshot, updateDoc, writeBatch } from 'firebase/firestore'
import { db } from '../firebase'
import { aLeRole, useAuth } from '../lib/auth'
import { useData } from '../lib/data'
import { CATEGORIES_PAR_DEFAUT, couleurFamille } from '../data/catalogue'
import { PageHeader, Sheet, toast } from '../components/ui'
import { Icon } from '../components/Icon'
import type { Lieu, Role, TypeLieu, Utilisateur } from '../types'

type Onglet = 'compte' | 'lieux' | 'categories' | 'equipe'

export default function Admin() {
  const { profil, logout } = useAuth()
  const responsable = aLeRole(profil, 'responsable')
  const admin = aLeRole(profil, 'admin')
  const [onglet, setOnglet] = useState<Onglet>(responsable ? 'lieux' : 'compte')

  return (
    <div className="page">
      <PageHeader titre="Administration" sur={profil?.role} back="/" />
      <div className="seg" role="tablist">
        {responsable && <button type="button" role="tab" aria-selected={onglet === 'lieux'} onClick={() => setOnglet('lieux')}>Lieux</button>}
        {responsable && <button type="button" role="tab" aria-selected={onglet === 'categories'} onClick={() => setOnglet('categories')}>Catégories</button>}
        {admin && <button type="button" role="tab" aria-selected={onglet === 'equipe'} onClick={() => setOnglet('equipe')}>Équipe</button>}
        <button type="button" role="tab" aria-selected={onglet === 'compte'} onClick={() => setOnglet('compte')}>Compte</button>
      </div>
      {onglet === 'lieux' && <Lieux />}
      {onglet === 'categories' && <Categories />}
      {onglet === 'equipe' && <Equipe />}
      {onglet === 'compte' && <Compte onLogout={logout} />}
    </div>
  )
}

function Lieux() {
  const { lieux } = useData()
  const [edit, setEdit] = useState<Partial<Lieu> | null>(null)
  return (
    <div className="stack">
      <button type="button" className="btn primary block" onClick={() => setEdit({ nom: '', type: 'stade', adresse: '' })}><Icon name="plus" stroke={2.6} />Ajouter un lieu</button>
      <div className="card flush">
        {lieux.length === 0 && <div className="empty">Commence par créer le dépôt BR et les stades.</div>}
        {lieux.map((l) => (
          <button key={l.id} type="button" className="list-item" onClick={() => setEdit(l)}>
            <div className="grow"><div style={{ fontWeight: 700 }}>{l.nom}</div><div className="muted">{l.type === 'depot' ? 'Dépôt' : l.type === 'stade' ? 'Stade' : 'Autre'}{l.adresse ? ` · ${l.adresse}` : ''}</div></div>
            <Icon name="edit" size={18} />
          </button>
        ))}
      </div>
      {edit && (
        <Sheet titre={edit.id ? 'Modifier le lieu' : 'Nouveau lieu'} onClose={() => setEdit(null)}>
          <form className="stack" onSubmit={async (e) => {
            e.preventDefault()
            if (!edit.nom?.trim()) return
            const data = { nom: edit.nom.trim(), type: edit.type ?? 'stade', adresse: edit.adresse?.trim() ?? '', actif: true }
            if (edit.id) await updateDoc(doc(db, 'lieux', edit.id), data)
            else await addDoc(collection(db, 'lieux'), data)
            toast('Lieu enregistré'); setEdit(null)
          }}>
            <label className="field">Nom<input className="input" autoFocus value={edit.nom ?? ''} onChange={(e) => setEdit({ ...edit, nom: e.target.value })} placeholder="Ex. : Stade Charléty, Dépôt BR" /></label>
            <label className="field">Type
              <select className="input" value={edit.type} onChange={(e) => setEdit({ ...edit, type: e.target.value as TypeLieu })}>
                <option value="stade">Stade</option><option value="depot">Dépôt</option><option value="autre">Autre</option>
              </select>
            </label>
            <label className="field">Adresse / ville<input className="input" value={edit.adresse ?? ''} onChange={(e) => setEdit({ ...edit, adresse: e.target.value })} /></label>
            <button className="btn primary block">Enregistrer</button>
            {edit.id && <button type="button" className="btn small block" onClick={async () => {
              if (!confirm('Archiver ce lieu ? Il n’apparaîtra plus dans les listes.')) return
              await updateDoc(doc(db, 'lieux', edit.id!), { actif: false }); toast('Lieu archivé'); setEdit(null)
            }}>Archiver ce lieu</button>}
          </form>
        </Sheet>
      )}
    </div>
  )
}

function Categories() {
  const { categories, modeles } = useData()
  const manquantes = CATEGORIES_PAR_DEFAUT.filter((d) => !categories.some((c) => c.id === d.id))
  const installer = async () => {
    const b = writeBatch(db)
    manquantes.forEach(({ id, ...c }, i) => b.set(doc(db, 'categories', id), { ...c, ordre: CATEGORIES_PAR_DEFAUT.findIndex((d) => d.id === id) ?? i }, { merge: true }))
    await b.commit()
    toast(`${manquantes.length} catégorie(s) installée(s)`)
  }
  return (
    <div className="stack">
      {manquantes.length > 0 && (
        <div className="note info stack-s">
          <div>{manquantes.length} catégorie(s) standard pas encore installée(s) (dalles, processeurs, câbles, électrique, informatique…).</div>
          <button type="button" className="btn primary small" onClick={installer}>Installer les catégories standard</button>
        </div>
      )}
      <div className="card flush">
        {categories.map((c) => (
          <div key={c.id} className="list-item" style={{ cursor: 'default' }}>
            <span style={{ width: 8, height: 8, borderRadius: 99, background: couleurFamille(c.famille), flex: 'none' }} />
            <div className="grow"><div style={{ fontWeight: 700 }}>{c.nom}</div>
              <div className="muted small">{c.famille} · {c.champs.map((x) => x.label).join(', ')}{c.quantiteParDefaut ? ' · en quantité' : ''}</div></div>
            <span className="badge b-neutre">{modeles.filter((m) => m.categorieId === c.id).length} modèle(s)</span>
          </div>
        ))}
      </div>
      <p className="muted small">Les nouvelles catégories et les modèles types se créent depuis l'écran « Nouveau matériel ».</p>
    </div>
  )
}

function Equipe() {
  const { profil } = useAuth()
  const [users, setUsers] = useState<Utilisateur[]>([])
  useEffect(() => onSnapshot(collection(db, 'utilisateurs'), (s) => setUsers(s.docs.map((d) => ({ uid: d.id, ...d.data() }) as Utilisateur).sort((a, b) => a.nom.localeCompare(b.nom)))), [])
  return (
    <div className="stack">
      <div className="note info">Les membres créent leur compte eux-mêmes (email ou Google), puis tu ajustes leur rôle ici. Technicien : scanne, signale, crée du matériel. Responsable : gère aussi les lieux, catégories et modèles. Admin : gère l'équipe.</div>
      <div className="card flush">
        {users.map((u) => (
          <div key={u.uid} className="list-item" style={{ cursor: 'default', flexWrap: 'wrap' }}>
            <div className="grow"><div style={{ fontWeight: 700 }}>{u.nom}{!u.actif && <span className="badge b-panne" style={{ marginLeft: 8 }}>désactivé</span>}</div><div className="muted small">{u.email}</div></div>
            <select className="input" style={{ width: 'auto', minHeight: 40, fontSize: 14 }} value={u.role} disabled={u.uid === profil?.uid}
              onChange={async (e) => { await updateDoc(doc(db, 'utilisateurs', u.uid), { role: e.target.value as Role }); toast('Rôle mis à jour') }}>
              <option value="technicien">Technicien</option><option value="responsable">Responsable</option><option value="admin">Admin</option>
            </select>
            {u.uid !== profil?.uid && <button type="button" className="btn small" onClick={async () => { await updateDoc(doc(db, 'utilisateurs', u.uid), { actif: !u.actif }) }}>{u.actif ? 'Désactiver' : 'Réactiver'}</button>}
          </div>
        ))}
      </div>
    </div>
  )
}

function Compte({ onLogout }: { onLogout: () => Promise<void> }) {
  const { profil } = useAuth()
  const [nom, setNom] = useState(profil?.nom ?? '')
  return (
    <div className="stack">
      <form className="card stack" onSubmit={async (e) => {
        e.preventDefault()
        if (!profil || !nom.trim()) return
        await updateDoc(doc(db, 'utilisateurs', profil.uid), { nom: nom.trim() }); toast('Nom enregistré')
      }}>
        <label className="field">Nom affiché dans l'historique<input className="input" value={nom} onChange={(e) => setNom(e.target.value)} /></label>
        <div className="muted small">{profil?.email} · rôle {profil?.role}</div>
        <button className="btn primary">Enregistrer</button>
      </form>
      <button type="button" className="btn block" onClick={onLogout}><Icon name="logout" />Se déconnecter</button>
    </div>
  )
}
