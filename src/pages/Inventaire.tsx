import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { cloturerInventaire, demarrerInventaire, extraireRef, inventorier, lireInventaire, positionGps } from '../lib/actions'
import { useAuth } from '../lib/auth'
import { useData } from '../lib/data'
import { QrCamera } from '../components/QrCamera'
import { formatDate, PageHeader, toast } from '../components/ui'
import { Icon } from '../components/Icon'
import type { Gps } from '../types'

// Session d'inventaire gardée sur le téléphone : on peut la reprendre, même sans réseau
interface SessionLocale { id: string | null; attendus: string[]; scannes: string[] }
const cleSession = (lieuId: string) => `inventaire-${lieuId}`
function lireSession(lieuId: string): SessionLocale | null {
  try { return JSON.parse(localStorage.getItem(cleSession(lieuId)) ?? 'null') as SessionLocale | null } catch { return null }
}
function ecrireSession(lieuId: string, s: SessionLocale | null) {
  try { if (s) localStorage.setItem(cleSession(lieuId), JSON.stringify(s)); else localStorage.removeItem(cleSession(lieuId)) } catch { /* rien */ }
}

export default function Inventaire() {
  const { lieuId = '' } = useParams()
  const nav = useNavigate()
  const { profil } = useAuth()
  const { lieux, materiel, choisirLieu, pret } = useData()
  const lieu = lieux.find((l) => l.id === lieuId)
  const [invId, setInvId] = useState<string | null>(null)
  const [demarre, setDemarre] = useState(false)
  const [attendus, setAttendus] = useState<string[]>([])
  const [scannes, setScannes] = useState<string[]>([])
  const [tab, setTab] = useState<'manquants' | 'scannes'>('manquants')
  const [camera, setCamera] = useState(true)
  const [dernier, setDernier] = useState<{ ref: string; ok: boolean; msg: string } | null>(null)
  const gps = useRef<Gps | null | undefined>(undefined)
  const enCours = useRef(new Set<string>())

  // Démarre (ou reprend) la session d'inventaire de ce lieu
  useEffect(() => {
    if (!lieu || !profil || !pret) return
    choisirLieu(lieu.id)
    let annule = false
    ;(async () => {
      const loc = lireSession(lieu.id)
      if (loc) {
        let s: SessionLocale | null = loc
        if (loc.id) {
          const srv = await lireInventaire(loc.id).catch(() => null)
          if (srv?.termineLe) s = null
          else if (srv) s = { id: loc.id, attendus: srv.attendus, scannes: [...new Set([...srv.scannes, ...loc.scannes])] }
        }
        if (s) {
          if (annule) return
          setInvId(s.id); setAttendus(s.attendus); setScannes(s.scannes); setDemarre(true)
          return
        }
      }
      let s: SessionLocale
      try {
        const inv = await demarrerInventaire(lieu.id)
        s = { id: inv.id, attendus: inv.attendus, scannes: [] }
      } catch {
        // Sans réseau : liste attendue calculée sur le téléphone, scans envoyés plus tard
        s = { id: null, attendus: materiel.filter((m) => m.lieuId === lieu.id).map((m) => m.ref), scannes: [] }
      }
      if (annule) return
      ecrireSession(lieu.id, s)
      setInvId(s.id); setAttendus(s.attendus); setScannes([]); setDemarre(true)
    })()
    positionGps(6000).then((p) => { gps.current = p })
    return () => { annule = true }
  }, [lieu?.id, profil?.uid, pret]) // eslint-disable-line react-hooks/exhaustive-deps

  const parRef = useMemo(() => new Map(materiel.map((m) => [m.ref, m])), [materiel])
  const manquants = attendus.filter((r) => !scannes.includes(r))
  const total = new Set([...attendus, ...scannes]).size
  const pct = total ? Math.round((scannes.length / total) * 100) : 0

  const onScan = async (texte: string) => {
    if (!lieu || !profil || !demarre) return
    const r = extraireRef(texte)
    const m = r ? parRef.get(r) : undefined
    if (!m) { setDernier({ ref: r ?? '?', ok: false, msg: 'Code inconnu' }); navigator.vibrate?.([80, 60, 80]); return }
    if (scannes.includes(m.ref) || enCours.current.has(m.ref)) { setDernier({ ref: m.ref, ok: true, msg: `${m.nom} · déjà scanné` }); return }
    enCours.current.add(m.ref)
    const nouveaux = [...scannes, m.ref]
    setScannes(nouveaux)
    ecrireSession(lieu.id, { id: invId, attendus, scannes: nouveaux })
    const ailleurs = m.lieuId !== lieu.id
    const admin = profil.role === 'admin'
    setDernier({ ref: m.ref, ok: true, msg: !ailleurs ? m.nom : admin ? `${m.nom} · déplacé ici (était à ${m.lieuNom})` : `${m.nom} · attendu à ${m.lieuNom}, déplacement proposé aux admins` })
    try {
      const res = await inventorier({ user: profil, lieu }, m, lieu, gps.current ?? null, invId)
      if (res.enAttente) setDernier((d) => d && d.ref === m.ref ? { ...d, msg: `${d.msg} · envoi au retour du réseau` } : d)
    } catch (e) { toast('Erreur : ' + String(e), 'err') } finally { enCours.current.delete(m.ref) }
  }

  const cloturer = async () => {
    if (!lieu) return
    if (manquants.length && !confirm(`${manquants.length} matériel(s) non scanné(s). Clôturer quand même ?`)) return
    if (invId) await cloturerInventaire(invId).catch(() => {})
    ecrireSession(lieu.id, null)
    toast(`Inventaire clôturé · ${scannes.length}/${total}`)
    nav(`/lieux/${lieu.id}`)
  }

  if (!lieu) return <div className="page"><PageHeader titre="Lieu introuvable" back="/lieux" /></div>

  return (
    <>
      <div className="page sans-nav">
        <PageHeader titre={lieu.nom} sur="Inventaire en cours" back={`/lieux/${lieu.id}`} />

        {camera && (
          <div style={{ position: 'relative', height: 260, borderRadius: 20, overflow: 'hidden', background: '#05070A' }} className="cam-box">
            <QrCamera onResult={onScan} />
            <div style={{ position: 'absolute', inset: '30px 22%', border: '4px solid var(--accent)', borderRadius: 18, pointerEvents: 'none' }} />
          </div>
        )}
        {dernier && (
          <div className={`note ${dernier.ok ? 'ok' : 'err'} row`} style={{ gap: 10 }}>
            <Icon name={dernier.ok ? 'check' : 'x'} stroke={3} size={18} />
            <div className="grow"><span className="mono">{dernier.ref}</span> · {dernier.msg}</div>
          </div>
        )}

        <div className="card stack" style={{ gap: 12 }}>
          <div className="row between" style={{ alignItems: 'flex-end' }}>
            <div className="row" style={{ alignItems: 'baseline', gap: 6 }}>
              <span style={{ fontSize: 44, fontWeight: 800, letterSpacing: '-.03em', lineHeight: 1 }}>{scannes.length}</span>
              <span style={{ fontSize: 20, fontWeight: 700, color: 'var(--muted)' }}>/ {total}</span>
            </div>
            <span style={{ fontWeight: 800, color: 'var(--accent)' }}>{pct} %</span>
          </div>
          <div style={{ height: 12, borderRadius: 12, background: 'var(--divider)', overflow: 'hidden' }}>
            <div style={{ height: '100%', width: `${pct}%`, background: 'var(--accent)', borderRadius: 12, transition: 'width .3s' }} />
          </div>
          <div className="row between small" style={{ color: 'var(--text-3)' }}>
            <span>par <strong>{profil?.nom}</strong></span>
            <span style={{ color: manquants.length ? 'var(--amber)' : 'var(--green)', fontWeight: 700 }}>{manquants.length} manquant(s)</span>
          </div>
        </div>

        <div className="seg" role="tablist">
          <button type="button" role="tab" aria-selected={tab === 'manquants'} onClick={() => setTab('manquants')}>Manquants · {manquants.length}</button>
          <button type="button" role="tab" aria-selected={tab === 'scannes'} onClick={() => setTab('scannes')}>Scannés · {scannes.length}</button>
        </div>

        <div className="stack-s" style={{ gap: 8 }}>
          {(tab === 'manquants' ? manquants : [...scannes].reverse()).map((r) => {
            const m = parRef.get(r)
            const manq = tab === 'manquants'
            return (
              <Link key={r} to={`/m/${encodeURIComponent(r)}`} className="card row" style={{ padding: 12, textDecoration: 'none', color: 'var(--text)', ...(manq ? { background: 'var(--amber-tint)', borderColor: 'var(--amber-border)' } : {}) }}>
                <div className="tile" style={manq ? { background: '#FEF3C7', color: 'var(--amber)' } : { background: 'var(--green-tint)', color: 'var(--green)' }}>
                  <Icon name={manq ? 'box' : 'check'} size={20} stroke={manq ? 2 : 3} />
                </div>
                <div className="grow">
                  <div style={{ fontWeight: 700 }}>{m?.nom ?? r}</div>
                  <div className="small" style={{ color: manq ? 'var(--amber-ink)' : 'var(--muted)' }}>
                    <span className="mono">{r}</span>{manq && m?.dernierInventaire ? ` · vu le ${formatDate(m.dernierInventaire.date, false)}` : ''}
                  </div>
                </div>
              </Link>
            )
          })}
          {tab === 'manquants' && manquants.length === 0 && <div className="note ok">Tout le matériel attendu est présent.</div>}
        </div>
      </div>
      <div className="action-bar"><div className="inner">
        <button type="button" className="btn" onClick={() => setCamera((c) => !c)}>{camera ? 'Masquer la caméra' : 'Afficher la caméra'}</button>
        <button type="button" className="btn primary" onClick={cloturer}>Clôturer</button>
      </div></div>
    </>
  )
}
