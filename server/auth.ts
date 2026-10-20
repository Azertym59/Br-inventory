import { createHash, randomBytes, scrypt as scryptCb, timingSafeEqual } from 'node:crypto'
import { promisify } from 'node:util'
import type { Context, MiddlewareHandler } from 'hono'
import { getCookie, setCookie, deleteCookie } from 'hono/cookie'
import { HTTPException } from 'hono/http-exception'
import { sql } from './db'

const scrypt = promisify(scryptCb) as (pwd: string, salt: Buffer, keylen: number) => Promise<Buffer>

export type Role = 'anonyme' | 'technicien' | 'admin'
export interface Utilisateur { id: string; nom: string; email: string | null; role: Role; actif: boolean }
export type Env = { Variables: { user: Utilisateur | null } }

const COOKIE = 'br_session'
const RANK: Record<Role, number> = { anonyme: 0, technicien: 1, admin: 2 }

// ---------- mots de passe ----------

export async function hasher(mdp: string): Promise<string> {
  const salt = randomBytes(16)
  const h = await scrypt(mdp, salt, 64)
  return `scrypt$${salt.toString('base64')}$${h.toString('base64')}`
}

export async function verifier(mdp: string, stocke: string | null): Promise<boolean> {
  if (!stocke) return false
  const [algo, s, h] = stocke.split('$')
  if (algo !== 'scrypt' || !s || !h) return false
  const attendu = Buffer.from(h, 'base64')
  const calcule = await scrypt(mdp, Buffer.from(s, 'base64'), attendu.length)
  return calcule.length === attendu.length && timingSafeEqual(calcule, attendu)
}

// ---------- sessions ----------

export async function ouvrirSession(c: Context, userId: string, jours: number) {
  const token = randomBytes(32).toString('base64url')
  const expire = new Date(Date.now() + jours * 86400_000)
  await sql`insert into sessions ${sql({ token, utilisateurId: userId, expireLe: expire })}`
  setCookie(c, COOKIE, token, {
    httpOnly: true, sameSite: 'Lax', path: '/', expires: expire,
    secure: (c.req.header('x-forwarded-proto') ?? new URL(c.req.url).protocol.replace(':', '')) === 'https',
  })
}

export async function fermerSession(c: Context) {
  const t = getCookie(c, COOKIE)
  if (t) await sql`delete from sessions where token = ${t}`
  deleteCookie(c, COOKIE, { path: '/' })
}

export const chargerUtilisateur: MiddlewareHandler<Env> = async (c, next) => {
  const t = getCookie(c, COOKIE)
  let user: Utilisateur | null = null
  if (t) {
    const [u] = await sql<Utilisateur[]>`
      select u.id, u.nom, u.email, u.role, u.actif
      from sessions s join utilisateurs u on u.id = s.utilisateur_id
      where s.token = ${t} and s.expire_le > now()`
    if (u?.actif) user = u
  }
  c.set('user', user)
  await next()
}

// ---------- liens à usage unique (invitation, mot de passe oublié) ----------

export type TypeJeton = 'invitation' | 'reinitialisation'
export const empreinte = (jeton: string) => createHash('sha256').update(jeton).digest('hex')

// Un seul lien valable à la fois par personne : le nouveau remplace les précédents non utilisés
export async function creerJeton(userId: string, type: TypeJeton, heures: number): Promise<string> {
  const jeton = randomBytes(32).toString('base64url')
  await sql.begin(async (tx) => {
    await tx`delete from jetons where utilisateur_id = ${userId} and utilise_le is null`
    await tx`insert into jetons ${tx({ empreinte: empreinte(jeton), utilisateurId: userId, type, expireLe: new Date(Date.now() + heures * 3600_000) })}`
  })
  return jeton
}

// ---------- droits ----------

export function exiger(c: Context<Env>, role: Role = 'anonyme'): Utilisateur {
  const u = c.get('user')
  if (!u) throw new HTTPException(401, { message: 'Non connecté' })
  if (RANK[u.role] < RANK[role]) throw new HTTPException(403, { message: 'Action réservée' })
  return u
}

export const estAdmin = (u: Utilisateur) => u.role === 'admin'
export const estMembre = (u: Utilisateur) => u.role !== 'anonyme'

// ---------- anti force brute (connexion) ----------

const essais = new Map<string, { n: number; depuis: number }>()
export function limiterConnexion(c: Context) {
  const ip = c.req.header('x-forwarded-for')?.split(',')[0].trim() || c.req.header('x-real-ip') || 'local'
  const now = Date.now()
  const e = essais.get(ip)
  if (!e || now - e.depuis > 10 * 60_000) { essais.set(ip, { n: 1, depuis: now }); return }
  e.n += 1
  if (e.n > 10) throw new HTTPException(429, { message: 'Trop d’essais, réessaie dans quelques minutes' })
}
