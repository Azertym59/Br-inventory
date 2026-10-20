import { useEffect, useRef, useState, type ReactNode } from 'react'
import { Link, NavLink, useNavigate } from 'react-router-dom'
import { LIBELLES_STATUT } from '../lib/actions'
import { useAuth } from '../lib/auth'
import { useData } from '../lib/data'
import type { Statut } from '../types'
import { Icon } from './Icon'

function BandeauReseau() {
  const { horsLigne, enAttente } = useData()
  if (!horsLigne && !enAttente) return null
  return (
    <div role="status" style={{ background: horsLigne ? '#92400E' : '#1D4ED8', color: '#fff', fontSize: 12, fontWeight: 700, textAlign: 'center', padding: '6px 12px' }}>
      {horsLigne ? 'Hors ligne' : 'Synchronisation'}{enAttente ? ` · ${enAttente} action(s) en attente d'envoi` : ' · les données affichées peuvent dater'}
    </div>
  )
}

export function BottomNav() {
  const { anonyme } = useAuth()
  const cls = ({ isActive }: { isActive: boolean }) => (isActive ? 'active' : '')
  return (
    <nav className="bottom-nav" aria-label="Navigation principale">
      <BandeauReseau />
      <div className="inner">
        <NavLink to="/" end className={cls}><Icon name="home" size={24} />Accueil</NavLink>
        <NavLink to="/lieux" className={cls}><Icon name="pin" size={24} />Lieux</NavLink>
        <Link to="/scan" className="scan" aria-label="Scanner"><Icon name="scan" size={28} stroke={2.2} /></Link>
        {anonyme ? <>
          <span style={{ width: 64 }} /><span style={{ width: 64 }} />
        </> : <>
          <NavLink to="/tickets" className={cls}><Icon name="alert" size={24} />Tickets</NavLink>
          <NavLink to="/etiquettes" className={cls}><Icon name="printer" size={24} />Étiquettes</NavLink>
        </>}
      </div>
    </nav>
  )
}

export function BackButton({ to }: { to?: string }) {
  const nav = useNavigate()
  return (
    <button type="button" className="icon-btn" aria-label="Retour" onClick={() => (to ? nav(to) : history.length > 1 ? nav(-1) : nav('/'))}>
      <Icon name="back" stroke={2.2} />
    </button>
  )
}

export function PageHeader({ titre, sur, back, droite }: { titre: string; sur?: ReactNode; back?: boolean | string; droite?: ReactNode }) {
  return (
    <div className="row">
      {back && <BackButton to={typeof back === 'string' ? back : undefined} />}
      <div className="grow stack-s" style={{ gap: 2 }}>
        {sur && <div className="eyebrow">{sur}</div>}
        <h1 className="h1" style={{ fontSize: back ? 22 : 26 }}>{titre}</h1>
      </div>
      {droite}
    </div>
  )
}

export function StatutBadge({ statut }: { statut: Statut }) {
  return <span className={`badge b-${statut}`}>{LIBELLES_STATUT[statut]}</span>
}

export const COULEUR_STATUT: Record<Statut, string> = {
  ok: '#047857', surveiller: '#B45309', panne: '#DC2626', reparation: '#7C3AED', hs: '#DC2626',
}

export function Sheet({ onClose, children, titre }: { onClose: () => void; children: ReactNode; titre?: string }) {
  useEffect(() => {
    const k = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', k)
    return () => window.removeEventListener('keydown', k)
  }, [onClose])
  return (
    <div className="sheet-bg" onClick={onClose}>
      <div className="sheet" role="dialog" aria-modal="true" aria-label={titre} onClick={(e) => e.stopPropagation()}>
        <div className="grip" />
        {titre && <div className="row between"><h2 className="h2">{titre}</h2>
          <button type="button" className="icon-btn" aria-label="Fermer" onClick={onClose}><Icon name="x" size={20} /></button></div>}
        {children}
      </div>
    </div>
  )
}

export function LieuPicker({ onClose, onPick, titre = 'Où êtes-vous ?' }: { onClose: () => void; onPick?: (id: string) => void; titre?: string }) {
  const { lieux, lieuCourant, choisirLieu } = useData()
  return (
    <Sheet onClose={onClose} titre={titre}>
      <div className="card flush">
        {lieux.length === 0 && <div className="empty">Aucun lieu. Un admin doit en créer dans Administration.</div>}
        {lieux.map((l) => (
          <button key={l.id} type="button" className="list-item" onClick={() => { if (onPick) onPick(l.id); else choisirLieu(l.id); onClose() }}>
            <div className="tile">{l.nom.slice(0, 3).toUpperCase()}</div>
            <div className="grow"><div style={{ fontWeight: 700 }}>{l.nom}</div><div className="muted">{l.type === 'depot' ? 'Dépôt' : l.type === 'stade' ? 'Stade' : 'Autre'}</div></div>
            {!onPick && lieuCourant?.id === l.id && <Icon name="check" color="#2563EB" stroke={3} />}
          </button>
        ))}
      </div>
    </Sheet>
  )
}

export function LieuCourantPill() {
  const { lieuCourant } = useData()
  const [open, setOpen] = useState(false)
  return (
    <>
      <button type="button" className={`lieu-pill ${lieuCourant ? '' : 'vide'}`} onClick={() => setOpen(true)}>
        <Icon name="pin" size={16} />{lieuCourant ? lieuCourant.nom : 'Choisir mon lieu'}
      </button>
      {open && <LieuPicker onClose={() => setOpen(false)} />}
    </>
  )
}

// Petits messages éphémères
let pushToast: ((t: { msg: string; type: 'ok' | 'err' | 'info' }) => void) | null = null
export function toast(msg: string, type: 'ok' | 'err' | 'info' = 'ok') { pushToast?.({ msg, type }) }
export function ToastHost() {
  const [t, setT] = useState<{ msg: string; type: 'ok' | 'err' | 'info' } | null>(null)
  const timer = useRef<number | undefined>(undefined)
  useEffect(() => {
    pushToast = (x) => { setT(x); window.clearTimeout(timer.current); timer.current = window.setTimeout(() => setT(null), 3200) }
    return () => { pushToast = null }
  }, [])
  if (!t) return null
  const bg = t.type === 'ok' ? '#047857' : t.type === 'err' ? '#DC2626' : '#0B1220'
  return <div className="toast" role="status" style={{ background: bg, color: '#fff' }}>{t.msg}</div>
}

export function PhotoPicker({ fichiers, onChange, max = 3 }: { fichiers: File[]; onChange: (f: File[]) => void; max?: number }) {
  const input = useRef<HTMLInputElement>(null)
  const [urls, setUrls] = useState<string[]>([])
  useEffect(() => {
    const u = fichiers.map((f) => URL.createObjectURL(f))
    setUrls(u)
    return () => u.forEach((x) => URL.revokeObjectURL(x))
  }, [fichiers])
  return (
    <div className="photos">
      {urls.map((u, i) => (
        <div key={u} className="photo">
          <img src={u} alt={`Photo ${i + 1}`} />
          <button type="button" className="x" aria-label="Retirer la photo" onClick={() => onChange(fichiers.filter((_, j) => j !== i))}>✕</button>
        </div>
      ))}
      {fichiers.length < max && (
        <button type="button" className="photo-add" onClick={() => input.current?.click()}>
          <Icon name="camera" size={26} />Ajouter
        </button>
      )}
      <input ref={input} type="file" accept="image/*" capture="environment" hidden
        onChange={(e) => { const f = e.target.files?.[0]; if (f) onChange([...fichiers, f].slice(0, max)); e.target.value = '' }} />
    </div>
  )
}

export function formatDate(t: string | null | undefined, avecHeure = true): string {
  if (!t) return 'à l’instant'
  const d = new Date(t)
  const auj = new Date()
  const hier = new Date(); hier.setDate(auj.getDate() - 1)
  const h = d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })
  if (d.toDateString() === auj.toDateString()) return avecHeure ? `Aujourd'hui ${h}` : "Aujourd'hui"
  if (d.toDateString() === hier.toDateString()) return avecHeure ? `Hier ${h}` : 'Hier'
  const j = d.toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: d.getFullYear() === auj.getFullYear() ? undefined : '2-digit' })
  return avecHeure ? `${j} · ${h}` : j
}

export function Chargement() {
  return <div className="center"><div className="spinner" aria-label="Chargement" /></div>
}
