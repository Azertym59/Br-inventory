import { useCallback, useEffect, useState } from 'react'
import { get, messageErreur, patch, post } from '../lib/api'
import { aLeRole, useAuth } from '../lib/auth'
import { useData } from '../lib/data'
import { CATEGORIES_PAR_DEFAUT, couleurFamille } from '../data/catalogue'
import { PageHeader, Sheet, toast } from '../components/ui'
import { Icon } from '../components/Icon'
import type { Lieu, Role, TypeLieu, Utilisateur } from '../types'

type Onglet = 'compte' | 'lieux' | 'categories' | 'equipe'

async function action(f: () => Promise<unknown>, ok: string): Promise<boolean> {
  try { await f(); toast(ok); return true } catch (e) { toast(messageErreur(e), 'err'); return false }
}

export default function Admin() {
  const { profil, logout } = useAuth()
  const admin = aLeRole(profil, 'admin')
  const [onglet, setOnglet] = useState<Onglet>(admin ? 'equipe' : 'compte')

  return (
    <div className="page">
      <PageHeader titre={admin ? 'Administration' : 'Mon compte'} sur={profil?.role} back="/" />
      {admin && (
        <div className="seg" role="tablist">
          <button type="button" role="tab" aria-selected={onglet === 'equipe'} onClick={() => setOnglet('equipe')}>Équipe</button>
          <button type="button" role="tab" aria-selected={onglet === 'lieux'} onClick={() => setOnglet('lieux')}>Lieux</button>
          <button type="button" role="tab" aria-selected={onglet === 'categories'} onClick={() => setOnglet('categories')}>Catégories</button>
          <button type="button" role="tab" aria-selected={onglet === 'compte'} onClick={() => setOnglet('compte')}>Compte</button>
        </div>
      )}
      {onglet === 'equipe' && admin && <Equipe />}
      {onglet === 'lieux' && admin && <Lieux />}
      {onglet === 'categories' && admin && <Categories />}
      {onglet === 'compte' && <Compte onLogout={logout} />}
    </div>
  )
}

function Lieux() {
  const { lieux, rafraichir } = useData()
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
            const data = { nom: edit.nom.trim(), type: edit.type ?? 'stade', adresse: edit.adresse?.trim() ?? '' }
            const ok = await action(() => (edit.id ? patch(`/lieux/${edit.id}`, data) : post('/lieux', data)), 'Lieu enregistré')
            if (ok) { await rafraichir(); setEdit(null) }
          }}>
            <label className="field">Nom<input className="input" autoFocus value={edit.nom ?? ''} onChange={(e) => setEdit({ ...edit, nom: e.target.value })} placeholder="Ex. : Stade Pierre Mauroy, Dépôt BR" /></label>
            <label className="field">Type
              <select className="input" value={edit.type} onChange={(e) => setEdit({ ...edit, type: e.target.value as TypeLieu })}>
                <option value="stade">Stade</option><option value="depot">Dépôt</option><option value="autre">Autre</option>
              </select>
            </label>
            <label className="field">Adresse / ville<input className="input" value={edit.adresse ?? ''} onChange={(e) => setEdit({ ...edit, adresse: e.target.value })} /></label>
            <button className="btn primary block">Enregistrer</button>
            {edit.id && <button type="button" className="btn small block" onClick={async () => {
              if (!confirm('Archiver ce lieu ? Il n’apparaîtra plus dans les listes.')) return
              if (await action(() => patch(`/lieux/${edit.id}`, { actif: false }), 'Lieu archivé')) { await rafraichir(); setEdit(null) }
            }}>Archiver ce lieu</button>}
          </form>
        </Sheet>
      )}
    </div>
  )
}

function Categories() {
  const { categories, modeles, rafraichir } = useData()
  const manquantes = CATEGORIES_PAR_DEFAUT.filter((d) => !categories.some((c) => c.id === d.id))
  return (
    <div className="stack">
      {manquantes.length > 0 && (
        <div className="note info stack-s">
          <div>{manquantes.length} catégorie(s) standard pas encore installée(s) (dalles, processeurs, câbles, électrique, informatique…).</div>
          <button type="button" className="btn primary small" onClick={async () => {
            if (await action(() => post('/categories/standard'), 'Catégories installées')) await rafraichir()
          }}>Installer les catégories standard</button>
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
  const [nouveau, setNouveau] = useState(false)
  const [reset, setReset] = useState<Utilisateur | null>(null)
  const charger = useCallback(() => { get<Utilisateur[]>('/utilisateurs').then(setUsers).catch((e) => toast(messageErreur(e), 'err')) }, [])
  useEffect(charger, [charger])

  return (
    <div className="stack">
      <button type="button" className="btn primary block" onClick={() => setNouveau(true)}><Icon name="plus" stroke={2.6} />Créer un compte</button>
      <div className="note info">Technicien : réparations, création de matériel, étiquettes. Admin : en plus, valide les signalements, re-dispatche le matériel entre parcs, assigne les tickets et gère l'équipe. Les signalements et inventaires se font aussi sans compte, avec juste un nom.</div>
      <div className="card flush">
        {users.map((u) => (
          <div key={u.uid} className="list-item" style={{ cursor: 'default', flexWrap: 'wrap' }}>
            <div className="grow" style={{ minWidth: 160 }}>
              <div style={{ fontWeight: 700 }}>{u.nom}{!u.actif && <span className="badge b-panne" style={{ marginLeft: 8 }}>désactivé</span>}</div>
              <div className="muted small">{u.email}</div>
            </div>
            {u.uid === profil?.uid ? <span className="badge b-neutre">C'est toi</span> : (
              <>
                <select className="input" style={{ width: 'auto', minHeight: 40, fontSize: 14 }} value={u.role}
                  onChange={async (e) => { if (await action(() => patch(`/utilisateurs/${u.uid}`, { role: e.target.value as Role }), 'Rôle mis à jour')) charger() }}>
                  <option value="technicien">Technicien</option><option value="admin">Admin</option>
                </select>
                <button type="button" className="btn small" onClick={() => setReset(u)}>Mot de passe</button>
                <button type="button" className="btn small" onClick={async () => {
                  if (await action(() => patch(`/utilisateurs/${u.uid}`, { actif: !u.actif }), u.actif ? 'Compte désactivé' : 'Compte réactivé')) charger()
                }}>{u.actif ? 'Désactiver' : 'Réactiver'}</button>
              </>
            )}
          </div>
        ))}
      </div>
      {nouveau && <NouveauCompte onClose={() => setNouveau(false)} onCree={() => { setNouveau(false); charger() }} />}
      {reset && (
        <Sheet titre={`Nouveau mot de passe · ${reset.nom}`} onClose={() => setReset(null)}>
          <MotDePasse onValider={async (mdp) => {
            if (await action(() => patch(`/utilisateurs/${reset.uid}`, { mdp }), 'Mot de passe changé')) setReset(null)
          }} />
          <p className="muted small">Communique-le à la personne : elle sera déconnectée de ses appareils et devra se reconnecter avec ce mot de passe.</p>
        </Sheet>
      )}
    </div>
  )
}

function genererMdp(): string {
  const a = 'abcdefghjkmnpqrstuvwxyz23456789'
  return Array.from(crypto.getRandomValues(new Uint32Array(10)), (n) => a[n % a.length]).join('')
}

function MotDePasse({ onValider }: { onValider: (mdp: string) => void }) {
  const [mdp, setMdp] = useState(genererMdp)
  return (
    <form className="stack" onSubmit={(e) => { e.preventDefault(); if (mdp.length >= 8) onValider(mdp) }}>
      <label className="field">Mot de passe provisoire (8 caractères minimum)
        <input className="input mono" value={mdp} onChange={(e) => setMdp(e.target.value)} minLength={8} required />
      </label>
      <button className="btn primary block">Valider</button>
    </form>
  )
}

function NouveauCompte({ onClose, onCree }: { onClose: () => void; onCree: () => void }) {
  const [nom, setNom] = useState('')
  const [email, setEmail] = useState('')
  const [role, setRole] = useState<Role>('technicien')
  const [mdp, setMdp] = useState(genererMdp)
  return (
    <Sheet titre="Nouveau compte" onClose={onClose}>
      <form className="stack" onSubmit={async (e) => {
        e.preventDefault()
        if (await action(() => post('/utilisateurs', { nom: nom.trim(), email: email.trim(), mdp, role }), 'Compte créé')) onCree()
      }}>
        <label className="field">Prénom et nom<input className="input" autoFocus value={nom} onChange={(e) => setNom(e.target.value)} required /></label>
        <label className="field">Email<input className="input" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required /></label>
        <label className="field">Rôle
          <select className="input" value={role} onChange={(e) => setRole(e.target.value as Role)}>
            <option value="technicien">Technicien</option><option value="admin">Admin</option>
          </select>
        </label>
        <label className="field">Mot de passe provisoire
          <input className="input mono" value={mdp} onChange={(e) => setMdp(e.target.value)} minLength={8} required />
        </label>
        <div className="note info">Envoie à la personne l'adresse de l'app, son email et ce mot de passe. Elle pourra le changer dans « Mon compte ».</div>
        <button className="btn primary block">Créer le compte</button>
      </form>
    </Sheet>
  )
}

function Compte({ onLogout }: { onLogout: () => Promise<void> }) {
  const { profil, recharger } = useAuth()
  const [nom, setNom] = useState(profil?.nom ?? '')
  const [ancien, setAncien] = useState('')
  const [mdp, setMdp] = useState('')
  return (
    <div className="stack">
      <form className="card stack" onSubmit={async (e) => {
        e.preventDefault()
        if (!nom.trim()) return
        if (await action(() => patch('/moi', { nom: nom.trim() }), 'Nom enregistré')) await recharger()
      }}>
        <label className="field">Nom affiché dans l'historique<input className="input" value={nom} onChange={(e) => setNom(e.target.value)} /></label>
        <div className="muted small">{profil?.email} · rôle {profil?.role}</div>
        <button className="btn primary">Enregistrer</button>
      </form>
      <form className="card stack" onSubmit={async (e) => {
        e.preventDefault()
        if (await action(() => patch('/moi', { ancien, mdp }), 'Mot de passe changé')) { setAncien(''); setMdp('') }
      }}>
        <div style={{ fontWeight: 700 }}>Changer mon mot de passe</div>
        <label className="field">Mot de passe actuel<input className="input" type="password" autoComplete="current-password" value={ancien} onChange={(e) => setAncien(e.target.value)} required /></label>
        <label className="field">Nouveau mot de passe (8 caractères minimum)<input className="input" type="password" autoComplete="new-password" value={mdp} onChange={(e) => setMdp(e.target.value)} minLength={8} required /></label>
        <button className="btn">Changer le mot de passe</button>
      </form>
      <button type="button" className="btn block" onClick={onLogout}><Icon name="logout" />Se déconnecter</button>
    </div>
  )
}
