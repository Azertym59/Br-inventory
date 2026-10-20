import { randomUUID } from 'node:crypto'
import { mkdir, readFile, stat, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { serve } from '@hono/node-server'
import { serveStatic } from '@hono/node-server/serve-static'
import { Hono } from 'hono'
import { HTTPException } from 'hono/http-exception'
import { api } from './api'
import { chargerUtilisateur, exiger, type Env } from './auth'
import { migrer } from './db'
import { verifierSmtp } from './mail'

const PORT = Number(process.env.PORT || 3000)
const DATA = process.env.DATA_DIR || '/data'
const PHOTOS = path.join(DATA, 'photos')
const STATIQUE = process.env.STATIC_DIR || path.join(process.cwd(), 'dist')

const app = new Hono<Env>()

// En-têtes de sécurité de base
app.use('*', async (c, next) => {
  await next()
  c.header('X-Content-Type-Options', 'nosniff')
  c.header('Referrer-Policy', 'same-origin')
  c.header('X-Frame-Options', 'SAMEORIGIN')
})

app.get('/api/sante', (c) => c.json({ ok: true }))

// ---------- photos : stockées sur le disque du VPS ----------
const TYPES: Record<string, string> = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' }

app.post('/api/photos', chargerUtilisateur, async (c) => {
  exiger(c)
  const corps = await c.req.parseBody()
  const f = corps.photo
  if (!(f instanceof File)) throw new HTTPException(400, { message: 'Photo manquante' })
  const ext = TYPES[f.type]
  if (!ext) throw new HTTPException(400, { message: 'Format de photo non accepté' })
  if (f.size > 5 * 1024 * 1024) throw new HTTPException(413, { message: 'Photo trop lourde (5 Mo max)' })
  const nom = `${randomUUID()}.${ext}`
  await writeFile(path.join(PHOTOS, nom), Buffer.from(await f.arrayBuffer()))
  return c.json({ url: `/api/photos/${nom}` })
})

app.get('/api/photos/:nom', chargerUtilisateur, async (c) => {
  exiger(c)
  const nom = c.req.param('nom')
  if (!/^[0-9a-f-]{36}\.(jpg|png|webp)$/.test(nom)) throw new HTTPException(404, { message: 'Introuvable' })
  try {
    const buf = await readFile(path.join(PHOTOS, nom))
    const type = nom.endsWith('png') ? 'image/png' : nom.endsWith('webp') ? 'image/webp' : 'image/jpeg'
    return c.body(buf, 200, { 'Content-Type': type, 'Cache-Control': 'private, max-age=31536000, immutable' })
  } catch {
    throw new HTTPException(404, { message: 'Introuvable' })
  }
})

app.route('/api', api)
app.all('/api/*', (c) => c.json({ erreur: 'Route inconnue' }, 404))
app.onError((e, c) => {
  if (e instanceof HTTPException) return c.json({ erreur: e.message }, e.status)
  console.error(e)
  return c.json({ erreur: 'Erreur serveur' }, 500)
})

// ---------- l'application (PWA) ----------
app.use('/sw.js', async (c, next) => { await next(); c.header('Cache-Control', 'no-cache') })
app.use('/assets/*', async (c, next) => { await next(); if (c.res.ok) c.header('Cache-Control', 'public, max-age=31536000, immutable') })
app.use('*', serveStatic({ root: path.relative(process.cwd(), STATIQUE) || '.' }))
// Toutes les autres adresses (ex. /m/BR-00042 depuis un QR code) → l'app
app.get('*', async (c) => {
  const html = await readFile(path.join(STATIQUE, 'index.html'), 'utf8')
  return c.html(html, 200, { 'Cache-Control': 'no-cache' })
})

async function demarrer() {
  await mkdir(PHOTOS, { recursive: true })
  await stat(path.join(STATIQUE, 'index.html')).catch(() => console.warn(`Attention : ${STATIQUE}/index.html introuvable`))
  await migrer()
  serve({ fetch: app.fetch, port: PORT }, () => console.log(`BR Inventaire en écoute sur le port ${PORT}`))
  void verifierSmtp()
}

demarrer().catch((e) => {
  console.error('Démarrage impossible :', e)
  process.exit(1)
})
