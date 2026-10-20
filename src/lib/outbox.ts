// File d'attente hors ligne : les scans d'inventaire et changements de statut faits sans réseau
// sont gardés sur le téléphone, puis envoyés dès que la connexion revient.
import { api, ErreurApi, HorsLigne } from './api'

interface Action { id: string; method: string; url: string; body: unknown; quand: number; libelle: string }

const CLE = 'br-outbox'
const ecouteurs = new Set<(n: number) => void>()
let enCours = false

function lire(): Action[] {
  try { return JSON.parse(localStorage.getItem(CLE) ?? '[]') as Action[] } catch { return [] }
}
function ecrire(a: Action[]) {
  try { localStorage.setItem(CLE, JSON.stringify(a)) } catch { /* stockage plein ou indisponible */ }
  ecouteurs.forEach((f) => f(a.length))
}

export function enAttente(): number { return lire().length }
export function suivreAttente(f: (n: number) => void): () => void {
  ecouteurs.add(f)
  return () => { ecouteurs.delete(f) }
}

// Envoie tout de suite si possible, sinon met en file d'attente. Renvoie la réponse ou null si en attente.
export async function envoyerOuMettreEnAttente<T>(method: string, url: string, body: unknown, libelle: string): Promise<T | null> {
  try {
    return await api<T>(method, url, body)
  } catch (e) {
    if (!(e instanceof HorsLigne)) throw e
    ecrire([...lire(), { id: crypto.randomUUID(), method, url, body, quand: Date.now(), libelle }])
    return null
  }
}

// Rejoue la file dans l'ordre ; s'arrête au premier problème réseau
export async function vider(): Promise<number> {
  if (enCours) return 0
  enCours = true
  let envoyes = 0
  try {
    for (const a of lire()) {
      try {
        await api(a.method, a.url, a.body)
      } catch (e) {
        if (e instanceof HorsLigne) break
        if (e instanceof ErreurApi && e.status === 401) break // session à rétablir d'abord
        console.warn('Action abandonnée', a.libelle, e) // refusée par le serveur : on ne la rejoue pas
      }
      ecrire(lire().filter((x) => x.id !== a.id))
      envoyes++
    }
  } finally {
    enCours = false
  }
  return envoyes
}

if (typeof window !== 'undefined') {
  window.addEventListener('online', () => { void vider() })
  setInterval(() => { if (navigator.onLine && lire().length) void vider() }, 30_000)
}
