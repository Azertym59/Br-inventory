import { Hono } from 'hono'
import { HTTPException } from 'hono/http-exception'
import { sql, type Sql } from './db'
import {
  chargerUtilisateur, creerJeton, empreinte, estAdmin, estMembre, exiger, fermerSession, hasher, limiterConnexion,
  ouvrirSession, verifier, type Env, type TypeJeton, type Utilisateur,
} from './auth'
import { APP_URL, envoyer, mailActif } from './mail'
import { CATEGORIES_PAR_DEFAUT } from '../src/data/catalogue'

const PREFIX = (process.env.REF_PREFIX || 'BR').toUpperCase()

// ---------- petits outils de validation ----------

type Corps = Record<string, unknown>
const err = (msg: string, code: 400 | 404 | 409 = 400) => new HTTPException(code, { message: msg })
function txt(v: unknown, nom: string, { requis = false, max = 2000 } = {}): string {
  if (v == null || v === '') { if (requis) throw err(`${nom} manquant`); return '' }
  if (typeof v !== 'string') throw err(`${nom} invalide`)
  return v.trim().slice(0, max)
}
function entier(v: unknown, nom: string): number | null {
  if (v == null || v === '') return null
  const n = Number(v)
  if (!Number.isInteger(n) || n < 0 || n > 1e9) throw err(`${nom} invalide`)
  return n
}
function un<T extends string>(v: unknown, permis: readonly T[], nom: string): T {
  if (!permis.includes(v as T)) throw err(`${nom} invalide`)
  return v as T
}
function gps(v: unknown): { lat: number; lng: number; precision: number } | null {
  if (!v || typeof v !== 'object') return null
  const g = v as Record<string, unknown>
  const lat = Number(g.lat), lng = Number(g.lng), precision = Number(g.precision ?? 0)
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null
  return { lat, lng, precision: Math.round(precision) }
}
function photos(v: unknown): string[] {
  if (!Array.isArray(v)) return []
  return v.filter((p): p is string => typeof p === 'string' && /^\/api\/photos\/[\w.-]+$/.test(p)).slice(0, 6)
}
function valeurs(v: unknown): Record<string, string> {
  const r: Record<string, string> = {}
  if (v && typeof v === 'object') for (const [k, x] of Object.entries(v)) if (typeof x === 'string' && k.length < 60) r[k] = x.slice(0, 300)
  return r
}
const qui = (u: Utilisateur) => ({ uid: u.id, nom: u.nom })
const STATUTS = ['ok', 'surveiller', 'panne', 'reparation', 'hs'] as const
const GRAVITES = ['faible', 'moyenne', 'critique'] as const
const RANG: Record<string, number> = { ok: 0, surveiller: 1, reparation: 2, panne: 3, hs: 4 }
const STATUT_SELON_GRAVITE: Record<string, string> = { faible: 'surveiller', moyenne: 'surveiller', critique: 'panne' }
const LIBELLES_STATUT: Record<string, string> = { ok: 'OK', surveiller: 'À surveiller', panne: 'En panne', reparation: 'En réparation', hs: 'Hors service' }

async function journal(
  db: Sql, u: Utilisateur, m: { ref: string; nom: string }, type: string, titre: string,
  x: { lieuId?: string | null; lieuNom?: string | null; gps?: unknown; commentaire?: string | null; photos?: string[] } = {},
) {
  // Sans lieu précisé, on reprend le lieu actuel du matériel
  const lieuId = x.lieuId ?? null
  const lieuNom = x.lieuNom ?? null
  await db`insert into evenements (materiel_ref, materiel_nom, type, titre, user_id, user_nom, lieu_id, lieu_nom, gps, commentaire, photos)
    select ${m.ref}, ${m.nom}, ${type}, ${titre}, ${u.id}, ${u.nom},
      coalesce(${lieuId}::uuid, (select lieu_id from materiel where ref = ${m.ref})),
      coalesce(${lieuNom}::text, (select lieu_nom from materiel where ref = ${m.ref})),
      ${x.gps ? db.json(x.gps as never) : null}, ${x.commentaire ?? null}, ${db.json(x.photos ?? [])}`
}

async function lieu(db: Sql, id: unknown) {
  if (typeof id !== 'string' || !/^[0-9a-f-]{36}$/i.test(id)) throw err('Lieu invalide')
  const [l] = await db`select id, nom from lieux where id = ${id}`
  if (!l) throw err('Lieu introuvable', 404)
  return l as { id: string; nom: string }
}

async function materiel(db: Sql, ref: string) {
  const [m] = await db`select * from materiel where ref = ${ref.toUpperCase()}`
  if (!m) throw err('Matériel introuvable', 404)
  return m as Record<string, any> & { ref: string; nom: string; lieuId: string; lieuNom: string; statut: string }
}

async function ouvrirTicket(db: Sql, m: { ref: string; nom: string; statut: string }, t: Corps) {
  const [{ n }] = await db`select nextval('ticket_seq') as n`
  const numero = `T-${String(n).padStart(4, '0')}`
  await db`insert into tickets ${db({
    numero, materielRef: m.ref, materielNom: m.nom, lieuId: t.lieuId as string, lieuNom: t.lieuNom as string,
    description: t.description as string, gravite: t.gravite as string, statut: 'ouvert',
    signalePar: db.json(t.signalePar as never), validePar: t.validePar ? db.json(t.validePar as never) : null,
    photos: db.json(t.photos as never), gps: t.gps ? db.json(t.gps as never) : null,
  })}`
  const nouveau = STATUT_SELON_GRAVITE[t.gravite as string]
  await db`update materiel set tickets_ouverts = tickets_ouverts + 1
    ${RANG[nouveau] > RANG[m.statut] ? db`, statut = ${nouveau}` : db``}
    where ref = ${m.ref}`
  return numero
}

// ---------- emails ----------

const DUREE_LIEN: Record<TypeJeton, number> = { invitation: 72, reinitialisation: 24 } // heures
const ROLE_LIBELLE: Record<string, string> = { technicien: 'technicien', admin: 'administrateur' }

// Crée un lien à usage unique et l'envoie ; renvoie false si l'email n'est pas parti
async function envoyerLien(
  u: { id: string; nom: string; email: string; role: string }, type: TypeJeton,
  { heures = DUREE_LIEN[type], par }: { heures?: number; par?: string } = {},
) {
  const lien = `${APP_URL}/mdp/${await creerJeton(u.id, type, heures)}`
  const duree = `${heures} heure${heures > 1 ? 's' : ''}`
  if (type === 'invitation') {
    return envoyer({
      a: u.email, sujet: 'Ton accès à BR Inventaire', titre: `Bonjour ${u.nom}`,
      paragraphes: [
        `${par ?? 'Un administrateur'} t'a créé un compte ${ROLE_LIBELLE[u.role] ?? ''} sur BR Inventaire, l'application de suivi du matériel BR.`,
        `Ton identifiant : ${u.email}`,
        'Choisis ton mot de passe avec le bouton ci-dessous, tu arriveras directement dans l’application.',
      ],
      bouton: { texte: 'Choisir mon mot de passe', lien },
      note: `Ce lien est personnel, ne sert qu'une fois et expire dans ${duree}. Passé ce délai, demande à un administrateur de t'en renvoyer un.`,
    })
  }
  return envoyer({
    a: u.email, sujet: 'Nouveau mot de passe BR Inventaire', titre: 'Nouveau mot de passe',
    paragraphes: [`Bonjour ${u.nom},`, `${par ? `${par} t'envoie` : 'Voici'} un lien pour choisir un nouveau mot de passe pour ton compte BR Inventaire (${u.email}).`],
    bouton: { texte: 'Choisir un nouveau mot de passe', lien },
    note: `Ce lien ne sert qu'une fois et expire dans ${duree}. Si tu n'as rien demandé, ignore ce message : ton mot de passe actuel reste valable.`,
  })
}

// Signalement sans compte : prévient les admins qu'il attend leur validation
async function notifierSignalement(s: { ref: string; nom: string; lieu: string; gravite: string; description: string; declarant: string; photos: number }) {
  if (!mailActif()) return
  const admins = await sql`select email from utilisateurs where role = 'admin' and actif and email is not null`
  await Promise.all(admins.map((a) => envoyer({
    a: a.email, sujet: `Signalement à valider : ${s.nom} (${s.ref})`, titre: 'Nouveau signalement à valider',
    paragraphes: [
      `${s.declarant} (sans compte) a signalé un problème sur ${s.nom} (${s.ref}) à ${s.lieu}.`,
      `Gravité : ${s.gravite}${s.photos ? ` · ${s.photos} photo${s.photos > 1 ? 's' : ''}` : ''}`,
      `« ${s.description} »`,
    ],
    bouton: { texte: 'Voir les signalements à valider', lien: `${APP_URL}/validation` },
    note: 'Tu reçois ce message parce que tu es administrateur de BR Inventaire.',
  })))
}

// Lien reçu par email : encore valable, pas utilisé, compte d'équipe actif
async function jetonValide(db: Sql, jeton: string, verrou = false) {
  const invalide = err('Ce lien n’est plus valable (déjà utilisé ou expiré). Demande un nouveau lien.', 404)
  if (!/^[\w-]{43}$/.test(jeton)) throw invalide
  const [j] = await db`select j.empreinte, j.type, u.id, u.nom, u.email, u.actif
    from jetons j join utilisateurs u on u.id = j.utilisateur_id
    where j.empreinte = ${empreinte(jeton)} and j.utilise_le is null and j.expire_le > now() and u.role <> 'anonyme'
    ${verrou ? db`for update of j` : db``}`
  if (!j) throw invalide
  if (!j.actif) throw new HTTPException(403, { message: 'Compte désactivé' })
  return j as { empreinte: string; type: TypeJeton; id: string; nom: string; email: string }
}

export const api = new Hono<Env>()
api.use('*', chargerUtilisateur)

api.onError((e, c) => {
  if (e instanceof HTTPException) return c.json({ erreur: e.message }, e.status)
  console.error(e)
  return c.json({ erreur: 'Erreur serveur' }, 500)
})

// ================= SESSION / COMPTES =================

api.get('/session', async (c) => {
  const [{ n }] = await sql`select count(*)::int as n from utilisateurs where role = 'admin'`
  return c.json({ user: c.get('user'), configurationRequise: n === 0, mail: mailActif() })
})

// Premier lancement : création du compte administrateur
api.post('/auth/premier-admin', async (c) => {
  const b = await c.req.json<Corps>()
  const nom = txt(b.nom, 'Nom', { requis: true, max: 80 })
  const email = txt(b.email, 'Email', { requis: true, max: 200 }).toLowerCase()
  const mdp = txt(b.mdp, 'Mot de passe', { requis: true, max: 200 })
  if (mdp.length < 8) throw err('Mot de passe : 8 caractères minimum')
  const id = await sql.begin(async (tx) => {
    await tx`lock table utilisateurs in exclusive mode`
    const [{ n }] = await tx`select count(*)::int as n from utilisateurs where role = 'admin'`
    if (n > 0) throw err('Un administrateur existe déjà', 409)
    const [u] = await tx`insert into utilisateurs ${tx({ nom, email, mdpHash: await hasher(mdp), role: 'admin' })} returning id`
    return u.id as string
  })
  await ouvrirSession(c, id, 60)
  return c.json({ ok: true })
})

api.post('/auth/connexion', async (c) => {
  limiterConnexion(c)
  const b = await c.req.json<Corps>()
  const email = txt(b.email, 'Email', { requis: true }).toLowerCase()
  const [u] = await sql`select id, mdp_hash, actif from utilisateurs where email = ${email} and role <> 'anonyme'`
  if (!u || !(await verifier(txt(b.mdp, 'Mot de passe', { requis: true }), u.mdpHash))) throw new HTTPException(401, { message: 'Email ou mot de passe incorrect' })
  if (!u.actif) throw new HTTPException(403, { message: 'Compte désactivé' })
  await ouvrirSession(c, u.id, 60)
  return c.json({ ok: true })
})

// Sans compte : juste un nom (signaler / inventorier)
api.post('/auth/anonyme', async (c) => {
  const b = await c.req.json<Corps>()
  const nom = txt(b.nom, 'Nom', { requis: true, max: 80 })
  if (nom.length < 2) throw err('Indique ton prénom et ton nom')
  const [u] = await sql`insert into utilisateurs ${sql({ nom, role: 'anonyme' })} returning id`
  await ouvrirSession(c, u.id, 365)
  return c.json({ ok: true })
})

api.post('/auth/deconnexion', async (c) => {
  await fermerSession(c)
  return c.json({ ok: true })
})

// Mot de passe oublié : même réponse que le compte existe ou non (on ne révèle pas qui a un compte)
api.post('/auth/mdp-oublie', async (c) => {
  limiterConnexion(c)
  if (!mailActif()) throw err('L’envoi d’emails n’est pas configuré : demande à un administrateur de réinitialiser ton mot de passe')
  const b = await c.req.json<Corps>()
  const email = txt(b.email, 'Email', { requis: true, max: 200 }).toLowerCase()
  void (async () => {
    const [u] = await sql`select id, nom, email, role, mdp_hash from utilisateurs where email = ${email} and role <> 'anonyme' and actif`
    // Compte jamais activé : on renvoie l'invitation plutôt qu'un lien de réinitialisation
    if (u) await envoyerLien(u as never, u.mdpHash ? 'reinitialisation' : 'invitation', { heures: u.mdpHash ? 1 : undefined })
  })().catch((e) => console.error('Mot de passe oublié :', e))
  return c.json({ ok: true })
})

api.get('/auth/jeton/:jeton', async (c) => {
  const j = await jetonValide(sql, c.req.param('jeton'))
  return c.json({ nom: j.nom, email: j.email, type: j.type })
})

// Choix du mot de passe depuis le lien : le lien est consommé, les autres sessions sont fermées, on connecte la personne
api.post('/auth/jeton/:jeton', async (c) => {
  const b = await c.req.json<Corps>()
  const mdp = txt(b.mdp, 'Mot de passe', { requis: true, max: 200 })
  if (mdp.length < 8) throw err('Mot de passe : 8 caractères minimum')
  const hash = await hasher(mdp)
  const id = await sql.begin(async (tx) => {
    const j = await jetonValide(tx as unknown as Sql, c.req.param('jeton'), true)
    await tx`update utilisateurs set mdp_hash = ${hash} where id = ${j.id}`
    await tx`update jetons set utilise_le = now() where empreinte = ${j.empreinte}`
    await tx`delete from jetons where utilisateur_id = ${j.id} and utilise_le is null`
    await tx`delete from sessions where utilisateur_id = ${j.id}`
    return j.id
  })
  await ouvrirSession(c, id, 60)
  return c.json({ ok: true })
})

api.patch('/moi', async (c) => {
  const u = exiger(c)
  const b = await c.req.json<Corps>()
  const nom = txt(b.nom, 'Nom', { max: 80 })
  if (nom.length >= 2) await sql`update utilisateurs set nom = ${nom} where id = ${u.id}`
  if (b.mdp != null && estMembre(u)) {
    const [r] = await sql`select mdp_hash from utilisateurs where id = ${u.id}`
    if (!(await verifier(txt(b.ancien, 'Mot de passe actuel'), r.mdpHash))) throw err('Mot de passe actuel incorrect')
    const mdp = txt(b.mdp, 'Mot de passe', { requis: true })
    if (mdp.length < 8) throw err('Mot de passe : 8 caractères minimum')
    await sql`update utilisateurs set mdp_hash = ${await hasher(mdp)} where id = ${u.id}`
    await sql`delete from jetons where utilisateur_id = ${u.id} and utilise_le is null`
  }
  return c.json({ ok: true })
})

// ================= DONNÉES (chargées par l'app, rafraîchies régulièrement) =================

api.get('/donnees', async (c) => {
  const u = exiger(c)
  const membre = estMembre(u)
  const [lieux, categories, mat, modeles, tickets, signalements, propositions] = await Promise.all([
    sql`select id, nom, type, adresse, actif from lieux where actif order by nom`,
    sql`select * from categories order by ordre, nom`,
    sql`select * from materiel order by ref`,
    membre ? sql`select * from modeles order by nom` : [],
    membre ? sql`select * from tickets where statut in ('ouvert', 'en_cours') order by cree_le desc` : [],
    estAdmin(u) ? sql`select * from signalements where statut = 'a_valider' order by cree_le` : [],
    estAdmin(u) ? sql`select * from propositions where statut = 'a_valider' order by cree_le` : [],
  ])
  return c.json({ lieux, categories, materiel: mat, modeles, ticketsActifs: tickets, signalementsAValider: signalements, propositionsAValider: propositions })
})

api.get('/evenements', async (c) => {
  exiger(c, 'technicien')
  const ref = c.req.query('ref')
  const limite = Math.min(100, Number(c.req.query('limite')) || 40)
  const rows = ref
    ? await sql`select * from evenements where materiel_ref = ${ref.toUpperCase()} order by date desc limit ${limite}`
    : await sql`select * from evenements order by date desc limit ${limite}`
  return c.json(rows)
})

// ================= MATÉRIEL =================

api.post('/materiel', async (c) => {
  const u = exiger(c, 'technicien')
  const b = await c.req.json<Corps>()
  const [cat] = await sql`select * from categories where id = ${txt(b.categorieId, 'Catégorie', { requis: true })}`
  if (!cat) throw err('Catégorie introuvable', 404)
  const l = await lieu(sql, b.lieuId)
  let modele: { id: string; nom: string } | null = null
  if (b.modeleId) {
    const [m] = await sql`select id, nom from modeles where id = ${txt(b.modeleId, 'Modèle')}`
    if (!m) throw err('Modèle introuvable', 404)
    modele = m as unknown as { id: string; nom: string }
  }
  const n = Math.max(1, Math.min(500, entier(b.exemplaires, 'Exemplaires') ?? 1))
  const depart = entier(b.numeroDepart, 'Numéro')
  const quantite = entier(b.quantite, 'Quantité')
  const nom = txt(b.nom, 'Nom', { max: 120 }) || cat.nom
  const vals = valeurs(b.valeurs)
  const position = gps(b.gps)
  const photo = photos([b.photoUrl])[0] ?? null
  const refs = await sql.begin(async (tx) => {
    const out: string[] = []
    for (let i = 0; i < n; i++) {
      const [{ v }] = await tx`select nextval('materiel_seq') as v`
      const ref = `${PREFIX}-${String(v).padStart(5, '0')}`
      const m = { ref, nom }
      await tx`insert into materiel ${tx({
        ref, nom, categorieId: cat.id, categorieNom: cat.nom, famille: cat.famille,
        modeleId: modele?.id ?? null, modeleNom: modele?.nom ?? null,
        valeurs: tx.json(i === 0 ? vals : { ...vals, serie: '' }), quantite,
        numero: depart != null ? depart + i : null, lieuId: l.id, lieuNom: l.nom,
        photoUrl: i === 0 ? photo : null,
        dernierInventaire: tx.json({ uid: u.id, nom: u.nom, lieuId: l.id, lieuNom: l.nom, date: new Date().toISOString() }),
        creePar: tx.json(qui(u)),
      })}`
      await journal(tx as unknown as Sql, u, m, 'creation', 'Création', { lieuId: l.id, lieuNom: l.nom, gps: position })
      out.push(ref)
    }
    return out
  })
  return c.json({ refs })
})

api.patch('/materiel/:ref', async (c) => {
  const u = exiger(c, 'technicien')
  const m = await materiel(sql, c.req.param('ref'))
  const b = await c.req.json<Corps>()
  const maj: Record<string, unknown> = {}
  if ('nom' in b) maj.nom = txt(b.nom, 'Nom', { requis: true, max: 120 })
  if ('valeurs' in b) maj.valeurs = sql.json(valeurs(b.valeurs))
  if ('quantite' in b) maj.quantite = entier(b.quantite, 'Quantité')
  if ('numero' in b) maj.numero = entier(b.numero, 'Numéro')
  let titre = 'Fiche modifiée'
  if ('statut' in b) {
    maj.statut = un(b.statut, STATUTS, 'Statut')
    titre = `Statut : ${LIBELLES_STATUT[maj.statut as string]}`
  }
  if (!Object.keys(maj).length) return c.json({ ok: true })
  await sql.begin(async (tx) => {
    await tx`update materiel set ${tx(maj)} where ref = ${m.ref}`
    await journal(tx as unknown as Sql, u, m, 'statut' in b ? 'statut' : 'modification', titre, { commentaire: txt(b.commentaire, 'Commentaire') || null })
  })
  return c.json({ ok: true })
})

// Scan « présent ici » : admin → déplacement direct ; sinon → proposition à valider
api.post('/materiel/:ref/inventaire', async (c) => {
  const u = exiger(c)
  const m = await materiel(sql, c.req.param('ref'))
  const b = await c.req.json<Corps>()
  const l = await lieu(sql, b.lieuId)
  const position = gps(b.gps)
  const ailleurs = m.lieuId !== l.id
  const deplace = ailleurs && estAdmin(u)
  let propose = false
  await sql.begin(async (tx) => {
    const db = tx as unknown as Sql
    const trace = tx.json({ uid: u.id, nom: u.nom, lieuId: l.id, lieuNom: l.nom, date: new Date().toISOString() })
    if (deplace) {
      await tx`update materiel set dernier_inventaire = ${trace}, lieu_id = ${l.id}, lieu_nom = ${l.nom} where ref = ${m.ref}`
      await journal(db, u, m, 'deplacement', `Trouvé à ${l.nom} (était à ${m.lieuNom})`, { lieuId: l.id, lieuNom: l.nom, gps: position })
    } else {
      await tx`update materiel set dernier_inventaire = ${trace} where ref = ${m.ref}`
    }
    if (ailleurs && !deplace) {
      const [deja] = await tx`select 1 from propositions where materiel_ref = ${m.ref} and vers_lieu_id = ${l.id} and statut = 'a_valider'`
      if (!deja) {
        await tx`insert into propositions ${tx({
          materielRef: m.ref, materielNom: m.nom, deLieuId: m.lieuId, deLieuNom: m.lieuNom,
          versLieuId: l.id, versLieuNom: l.nom, par: tx.json(qui(u)),
        })}`
      }
      propose = true
    }
    await journal(db, u, m, 'inventaire', ailleurs && !deplace ? `Inventorié à ${l.nom} (attendu à ${m.lieuNom})` : 'Inventorié', { lieuId: l.id, lieuNom: l.nom, gps: position })
    if (typeof b.inventaireId === 'string' && /^[0-9a-f-]{36}$/i.test(b.inventaireId)) {
      await tx`update inventaires set scannes = case when scannes ? ${m.ref} then scannes else scannes || ${tx.json([m.ref])} end
        where id = ${b.inventaireId} and termine_le is null`
    }
  })
  return c.json({ deplace, propose })
})

// Re-dispatch groupé vers un autre parc (admin)
api.post('/materiel/deplacer', async (c) => {
  const u = exiger(c, 'admin')
  const b = await c.req.json<Corps>()
  const l = await lieu(sql, b.lieuId)
  const refs = Array.isArray(b.refs) ? b.refs.filter((r): r is string => typeof r === 'string').slice(0, 2000) : []
  if (!refs.length) return c.json({ ok: true })
  await sql.begin(async (tx) => {
    const items = await tx`select ref, nom, lieu_nom from materiel where ref in ${tx(refs)} and lieu_id <> ${l.id}`
    for (const m of items) {
      await tx`update materiel set lieu_id = ${l.id}, lieu_nom = ${l.nom} where ref = ${m.ref}`
      await journal(tx as unknown as Sql, u, m as never, 'deplacement', `Re-dispatch : ${m.lieuNom} → ${l.nom}`, { lieuId: l.id, lieuNom: l.nom, commentaire: txt(b.commentaire, 'Commentaire') || null })
    }
  })
  return c.json({ ok: true })
})

api.post('/materiel/etiquetes', async (c) => {
  const u = exiger(c, 'technicien')
  const b = await c.req.json<Corps>()
  const refs = Array.isArray(b.refs) ? b.refs.filter((r): r is string => typeof r === 'string').slice(0, 2000) : []
  if (!refs.length) return c.json({ ok: true })
  await sql.begin(async (tx) => {
    const items = await tx`update materiel set etiquetee = true where ref in ${tx(refs)} returning ref, nom`
    for (const m of items) await journal(tx as unknown as Sql, u, m as never, 'etiquette', 'Étiquette imprimée')
  })
  return c.json({ ok: true })
})

api.post('/materiel/numeroter', async (c) => {
  exiger(c, 'technicien')
  const b = await c.req.json<Corps>()
  const refs = Array.isArray(b.refs) ? b.refs.filter((r): r is string => typeof r === 'string').slice(0, 2000) : []
  const depart = entier(b.depart, 'Numéro') ?? 1
  await sql.begin(async (tx) => {
    for (let i = 0; i < refs.length; i++) await tx`update materiel set numero = ${depart + i} where ref = ${refs[i]}`
  })
  return c.json({ ok: true })
})

// ================= SIGNALEMENTS / TICKETS =================

api.post('/signalements', async (c) => {
  const u = exiger(c)
  const b = await c.req.json<Corps>()
  const m = await materiel(sql, txt(b.ref, 'Référence', { requis: true }))
  const l = b.lieuId ? await lieu(sql, b.lieuId) : { id: m.lieuId, nom: m.lieuNom }
  const description = txt(b.description, 'Description', { requis: true })
  const gravite = un(b.gravite, GRAVITES, 'Gravité')
  const ph = photos(b.photos)
  const position = gps(b.gps)
  const res = await sql.begin(async (tx) => {
    const db = tx as unknown as Sql
    if (!estMembre(u)) {
      await tx`insert into signalements ${tx({
        materielRef: m.ref, materielNom: m.nom, lieuId: l.id, lieuNom: l.nom, description, gravite,
        photos: tx.json(ph), gps: position ? tx.json(position) : null, declarant: tx.json(qui(u)),
      })}`
      await journal(db, u, m, 'signalement', `Problème signalé (${gravite}), en attente de validation`, { lieuId: l.id, lieuNom: l.nom, gps: position, commentaire: description, photos: ph })
      return { numero: null, aValider: true }
    }
    const numero = await ouvrirTicket(db, m, {
      lieuId: l.id, lieuNom: l.nom, description, gravite, photos: ph, gps: position,
      signalePar: qui(u), validePar: null,
    })
    await journal(db, u, m, 'signalement', `Problème signalé (${gravite}) · ${numero}`, { lieuId: l.id, lieuNom: l.nom, gps: position, commentaire: description, photos: ph })
    return { numero, aValider: false }
  })
  if (res.aValider) {
    void notifierSignalement({ ref: m.ref, nom: m.nom, lieu: l.nom, gravite, description, declarant: u.nom, photos: ph.length })
      .catch((e) => console.error('Notification signalement :', e))
  }
  return c.json(res)
})

api.post('/signalements/:id/traiter', async (c) => {
  const u = exiger(c, 'admin')
  const b = await c.req.json<Corps>()
  const accepter = b.accepter === true
  const res = await sql.begin(async (tx) => {
    const db = tx as unknown as Sql
    const [s] = await tx`select * from signalements where id = ${c.req.param('id')} and statut = 'a_valider' for update`
    if (!s) throw err('Signalement déjà traité ou introuvable', 404)
    let numero: string | null = null
    if (accepter) {
      const m = await materiel(db, s.materielRef)
      numero = await ouvrirTicket(db, m, {
        lieuId: s.lieuId, lieuNom: s.lieuNom, description: s.description,
        gravite: b.gravite ? un(b.gravite, GRAVITES, 'Gravité') : s.gravite, photos: s.photos, gps: s.gps,
        signalePar: { ...s.declarant, anonyme: true }, validePar: qui(u),
      })
      await journal(db, u, m, 'statut', `Signalement de ${s.declarant.nom} validé · ${numero}`)
    }
    await tx`update signalements set statut = ${accepter ? 'valide' : 'rejete'}, ticket = ${numero},
      traite_par = ${tx.json(qui(u))}, traite_le = now() where id = ${s.id}`
    return { numero }
  })
  return c.json(res)
})

api.post('/propositions/:id/traiter', async (c) => {
  const u = exiger(c, 'admin')
  const b = await c.req.json<Corps>()
  const accepter = b.accepter === true
  await sql.begin(async (tx) => {
    const db = tx as unknown as Sql
    const [p] = await tx`select * from propositions where id = ${c.req.param('id')} and statut = 'a_valider' for update`
    if (!p) throw err('Proposition déjà traitée ou introuvable', 404)
    if (accepter) {
      const m = await materiel(db, p.materielRef)
      if (m.lieuId !== p.versLieuId) {
        await tx`update materiel set lieu_id = ${p.versLieuId}, lieu_nom = ${p.versLieuNom} where ref = ${m.ref}`
        await journal(db, u, m, 'deplacement', `Déplacement validé : ${m.lieuNom} → ${p.versLieuNom} (vu par ${p.par.nom})`, { lieuId: p.versLieuId, lieuNom: p.versLieuNom })
      }
    }
    await tx`update propositions set statut = ${accepter ? 'valide' : 'rejete'}, traite_par = ${tx.json(qui(u))}, traite_le = now() where id = ${p.id}`
  })
  return c.json({ ok: true })
})

api.get('/tickets', async (c) => {
  exiger(c, 'technicien')
  const statut = c.req.query('statut') === 'repare' ? 'repare' : null
  const rows = statut
    ? await sql`select * from tickets where statut = 'repare' order by repare_le desc limit 50`
    : await sql`select * from tickets where statut in ('ouvert', 'en_cours') order by cree_le desc`
  return c.json(rows)
})

api.get('/tickets/:id', async (c) => {
  exiger(c, 'technicien')
  const [t] = await sql`select * from tickets where id = ${c.req.param('id')}`
  if (!t) throw err('Ticket introuvable', 404)
  return c.json(t)
})

api.post('/tickets/:id/prendre', async (c) => {
  const u = exiger(c, 'technicien')
  await sql.begin(async (tx) => {
    const [t] = await tx`select * from tickets where id = ${c.req.param('id')} for update`
    if (!t) throw err('Ticket introuvable', 404)
    await tx`update tickets set statut = 'en_cours', assigne_a = ${tx.json(t.assigneA ?? qui(u))}, maj_le = now() where id = ${t.id}`
    await tx`update materiel set statut = 'reparation' where ref = ${t.materielRef}`
    await journal(tx as unknown as Sql, u, { ref: t.materielRef, nom: t.materielNom }, 'statut', `${t.numero} : réparation commencée`)
  })
  return c.json({ ok: true })
})

api.post('/tickets/:id/assigner', async (c) => {
  const u = exiger(c, 'admin')
  const b = await c.req.json<Corps>()
  let a: { uid: string; nom: string } | null = null
  if (b.uid) {
    const [x] = await sql`select id, nom from utilisateurs where id = ${txt(b.uid, 'Utilisateur')} and role <> 'anonyme' and actif`
    if (!x) throw err('Utilisateur introuvable', 404)
    a = { uid: x.id, nom: x.nom }
  }
  await sql.begin(async (tx) => {
    const [t] = await tx`update tickets set assigne_a = ${a ? tx.json(a) : null}, maj_le = now() where id = ${c.req.param('id')} returning *`
    if (!t) throw err('Ticket introuvable', 404)
    await journal(tx as unknown as Sql, u, { ref: t.materielRef, nom: t.materielNom }, 'statut', a ? `${t.numero} assigné à ${a.nom}` : `${t.numero} désassigné`)
  })
  return c.json({ ok: true })
})

api.post('/tickets/:id/cloturer', async (c) => {
  const u = exiger(c, 'technicien')
  const b = await c.req.json<Corps>()
  const commentaire = txt(b.commentaire, 'Commentaire') || null
  const ph = photos(b.photos)
  await sql.begin(async (tx) => {
    const [t] = await tx`select * from tickets where id = ${c.req.param('id')} for update`
    if (!t) throw err('Ticket introuvable', 404)
    await tx`update tickets set statut = 'repare', commentaire_reparation = ${commentaire}, photos_apres = ${tx.json(ph)},
      assigne_a = ${tx.json(t.assigneA ?? qui(u))}, maj_le = now(), repare_le = now() where id = ${t.id}`
    const [{ n }] = await tx`select count(*)::int as n from tickets where materiel_ref = ${t.materielRef} and statut <> 'repare'`
    await tx`update materiel set tickets_ouverts = ${n} ${n === 0 ? tx`, statut = 'ok'` : tx``} where ref = ${t.materielRef}`
    await journal(tx as unknown as Sql, u, { ref: t.materielRef, nom: t.materielNom }, 'reparation', `Réparé · ${t.numero}`, { commentaire, photos: ph })
  })
  return c.json({ ok: true })
})

// ================= INVENTAIRES =================

api.post('/inventaires', async (c) => {
  const u = exiger(c)
  const b = await c.req.json<Corps>()
  const l = await lieu(sql, b.lieuId)
  const attendus = (await sql`select ref from materiel where lieu_id = ${l.id} order by ref`).map((r) => r.ref as string)
  const [inv] = await sql`insert into inventaires ${sql({ lieuId: l.id, lieuNom: l.nom, par: sql.json(qui(u)), attendus: sql.json(attendus) })} returning *`
  return c.json(inv)
})

api.get('/inventaires/:id', async (c) => {
  exiger(c)
  const [inv] = await sql`select * from inventaires where id = ${c.req.param('id')}`
  if (!inv) throw err('Inventaire introuvable', 404)
  return c.json(inv)
})

api.post('/inventaires/:id/cloturer', async (c) => {
  exiger(c)
  await sql`update inventaires set termine_le = now() where id = ${c.req.param('id')} and termine_le is null`
  return c.json({ ok: true })
})

// ================= ADMINISTRATION =================

api.post('/lieux', async (c) => {
  exiger(c, 'admin')
  const b = await c.req.json<Corps>()
  const [l] = await sql`insert into lieux ${sql({
    nom: txt(b.nom, 'Nom', { requis: true, max: 120 }), type: un(b.type ?? 'stade', ['stade', 'depot', 'autre'] as const, 'Type'),
    adresse: txt(b.adresse, 'Adresse', { max: 200 }),
  })} returning id`
  return c.json(l)
})

api.patch('/lieux/:id', async (c) => {
  exiger(c, 'admin')
  const b = await c.req.json<Corps>()
  const maj: Record<string, unknown> = {}
  if ('nom' in b) maj.nom = txt(b.nom, 'Nom', { requis: true, max: 120 })
  if ('type' in b) maj.type = un(b.type, ['stade', 'depot', 'autre'] as const, 'Type')
  if ('adresse' in b) maj.adresse = txt(b.adresse, 'Adresse', { max: 200 })
  if ('actif' in b) maj.actif = b.actif === true
  if (!Object.keys(maj).length) return c.json({ ok: true })
  const id = c.req.param('id')
  await sql.begin(async (tx) => {
    await tx`update lieux set ${tx(maj)} where id = ${id}`
    if (maj.nom) await tx`update materiel set lieu_nom = ${maj.nom as string} where lieu_id = ${id}`
  })
  return c.json({ ok: true })
})

api.post('/categories/standard', async (c) => {
  exiger(c, 'admin')
  await sql.begin(async (tx) => {
    for (let i = 0; i < CATEGORIES_PAR_DEFAUT.length; i++) {
      const k = CATEGORIES_PAR_DEFAUT[i]
      await tx`insert into categories ${tx({
        id: k.id, nom: k.nom, famille: k.famille, champs: tx.json(k.champs as never), quantiteParDefaut: k.quantiteParDefaut, ordre: i,
      })} on conflict (id) do nothing`
    }
  })
  return c.json({ ok: true })
})

api.post('/categories', async (c) => {
  exiger(c, 'admin')
  const b = await c.req.json<Corps>()
  const nom = txt(b.nom, 'Nom', { requis: true, max: 80 })
  const champs = Array.isArray(b.champs) ? b.champs.slice(0, 20).map((x) => {
    const o = (x ?? {}) as Corps
    return { key: txt(o.key, 'Champ', { requis: true, max: 40 }), label: txt(o.label, 'Champ', { requis: true, max: 80 }), placeholder: txt(o.placeholder, 'Exemple', { max: 120 }) }
  }) : []
  const id = `${nom.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'categorie'}-${Date.now().toString(36)}`
  const [{ o }] = await sql`select coalesce(max(ordre), 0) + 1 as o from categories`
  await sql`insert into categories ${sql({ id, nom, famille: txt(b.famille, 'Famille', { max: 60 }) || 'Divers', champs: sql.json(champs), quantiteParDefaut: b.quantiteParDefaut === true, ordre: o })}`
  return c.json({ id })
})

api.post('/modeles', async (c) => {
  exiger(c, 'admin')
  const b = await c.req.json<Corps>()
  const [m] = await sql`insert into modeles ${sql({
    categorieId: txt(b.categorieId, 'Catégorie', { requis: true }), nom: txt(b.nom, 'Nom', { requis: true, max: 120 }), valeurs: sql.json(valeurs(b.valeurs)),
  })} returning id`
  return c.json(m)
})

api.get('/utilisateurs', async (c) => {
  exiger(c, 'technicien')
  // enAttente : invitation envoyée, mot de passe pas encore choisi
  return c.json(await sql`select id as uid, nom, email, role, actif, mdp_hash is null as en_attente from utilisateurs where role <> 'anonyme' order by nom`)
})

// Sans mot de passe : invitation par email (lien pour le choisir). Avec : mot de passe provisoire (secours sans SMTP)
api.post('/utilisateurs', async (c) => {
  const admin = exiger(c, 'admin')
  const b = await c.req.json<Corps>()
  const nom = txt(b.nom, 'Nom', { requis: true, max: 80 })
  const email = txt(b.email, 'Email', { requis: true, max: 200 }).toLowerCase()
  const role = un(b.role ?? 'technicien', ['technicien', 'admin'] as const, 'Rôle')
  const mdp = txt(b.mdp, 'Mot de passe', { max: 200 })
  if (mdp && mdp.length < 8) throw err('Mot de passe : 8 caractères minimum')
  if (!mdp && !mailActif()) throw err('L’envoi d’emails n’est pas configuré : indique un mot de passe provisoire')
  const [deja] = await sql`select 1 from utilisateurs where email = ${email}`
  if (deja) throw err('Un compte existe déjà avec cet email', 409)
  const [u] = await sql`insert into utilisateurs ${sql({ nom, email, mdpHash: mdp ? await hasher(mdp) : null, role })} returning id, nom, email, role`
  if (mdp) return c.json({ ok: true, invitation: false })
  const envoye = await envoyerLien(u as never, 'invitation', { par: admin.nom })
  return c.json({ ok: true, invitation: true, envoye })
})

// Renvoie l'invitation (compte pas encore activé) ou un lien pour choisir un nouveau mot de passe
api.post('/utilisateurs/:id/lien', async (c) => {
  const admin = exiger(c, 'admin')
  if (!mailActif()) throw err('L’envoi d’emails n’est pas configuré')
  const id = c.req.param('id')
  if (!/^[0-9a-f-]{36}$/i.test(id)) throw err('Utilisateur introuvable', 404)
  const [u] = await sql`select id, nom, email, role, mdp_hash from utilisateurs where id = ${id} and role <> 'anonyme' and actif and email is not null`
  if (!u) throw err('Utilisateur introuvable ou désactivé', 404)
  const type: TypeJeton = u.mdpHash ? 'reinitialisation' : 'invitation'
  if (!(await envoyerLien(u as never, type, { par: admin.nom }))) throw new HTTPException(500, { message: 'L’email n’a pas pu partir (voir les journaux du serveur dans Coolify)' })
  return c.json({ ok: true, type })
})

api.patch('/utilisateurs/:id', async (c) => {
  const moi = exiger(c, 'admin')
  const id = c.req.param('id')
  const b = await c.req.json<Corps>()
  const maj: Record<string, unknown> = {}
  if ('role' in b) { if (id === moi.id) throw err('Tu ne peux pas changer ton propre rôle'); maj.role = un(b.role, ['technicien', 'admin'] as const, 'Rôle') }
  if ('actif' in b) { if (id === moi.id) throw err('Tu ne peux pas te désactiver'); maj.actif = b.actif === true }
  if ('nom' in b) maj.nom = txt(b.nom, 'Nom', { requis: true, max: 80 })
  if ('mdp' in b) {
    const mdp = txt(b.mdp, 'Mot de passe', { requis: true })
    if (mdp.length < 8) throw err('Mot de passe : 8 caractères minimum')
    maj.mdpHash = await hasher(mdp)
  }
  if (!Object.keys(maj).length) return c.json({ ok: true })
  await sql.begin(async (tx) => {
    await tx`update utilisateurs set ${tx(maj)} where id = ${id} and role <> 'anonyme'`
    if (maj.actif === false || maj.mdpHash) {
      await tx`delete from sessions where utilisateur_id = ${id}`
      await tx`delete from jetons where utilisateur_id = ${id} and utilise_le is null`
    }
  })
  return c.json({ ok: true })
})
