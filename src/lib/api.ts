// Accès au serveur BR Inventaire (même adresse que l'app, cookie de session)

export class ErreurApi extends Error {
  status: number
  constructor(message: string, status: number) {
    super(message)
    this.status = status
  }
}

// Erreur réseau (pas de connexion, serveur injoignable) : distincte d'un refus du serveur
export class HorsLigne extends Error {
  constructor() { super('hors-ligne') }
}

let surDeconnexion: (() => void) | null = null
export function quandDeconnecte(f: () => void) { surDeconnexion = f }

export async function api<T = unknown>(method: string, url: string, body?: unknown): Promise<T> {
  let r: Response
  try {
    r = await fetch(`/api${url}`, {
      method,
      credentials: 'same-origin',
      headers: body instanceof FormData || body === undefined ? {} : { 'Content-Type': 'application/json' },
      body: body instanceof FormData ? body : body === undefined ? undefined : JSON.stringify(body),
    })
  } catch {
    throw new HorsLigne()
  }
  const texte = await r.text()
  let json: unknown = null
  try { json = texte ? JSON.parse(texte) : null } catch { /* réponse non JSON */ }
  if (!r.ok) {
    if (r.status === 401 && url !== '/session' && !url.startsWith('/auth/')) surDeconnexion?.()
    if (r.status >= 502 && r.status <= 504) throw new HorsLigne()
    throw new ErreurApi((json as { erreur?: string } | null)?.erreur ?? `Erreur ${r.status}`, r.status)
  }
  return json as T
}

export const get = <T>(url: string) => api<T>('GET', url)
export const post = <T = { ok: boolean }>(url: string, body: unknown = {}) => api<T>('POST', url, body)
export const patch = <T = { ok: boolean }>(url: string, body: unknown) => api<T>('PATCH', url, body)

export function messageErreur(e: unknown): string {
  if (e instanceof HorsLigne) return 'Pas de réseau'
  if (e instanceof Error) return e.message
  return String(e)
}
