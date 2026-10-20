import nodemailer, { type Transporter } from 'nodemailer'

// Envoi d'emails en SMTP, configuré uniquement par variables d'environnement (jamais d'identifiants dans le code).
// Sans SMTP_HOST / SMTP_FROM / APP_URL, l'app reste sur les mots de passe provisoires.
const HOST = process.env.SMTP_HOST?.trim() || ''
const PORT = Number(process.env.SMTP_PORT || 465)
const USER = process.env.SMTP_USER?.trim() || ''
const PASS = process.env.SMTP_PASS || ''
const FROM = process.env.SMTP_FROM?.trim() || USER
// Adresse publique de l'app pour les liens des emails (jamais déduite de la requête : un en-tête Host
// falsifié ne doit pas pouvoir détourner un lien de mot de passe)
export const APP_URL = (process.env.APP_URL || '').trim().replace(/\/+$/, '')

export const mailActif = () => Boolean(HOST && FROM && APP_URL)

let transport: Transporter | null = null
function smtp(): Transporter {
  transport ??= nodemailer.createTransport({
    host: HOST, port: PORT,
    secure: PORT === 465, requireTLS: PORT === 587,
    auth: USER ? { user: USER, pass: PASS } : undefined,
    connectionTimeout: 15_000, greetingTimeout: 15_000, socketTimeout: 30_000,
  })
  return transport
}

const expediteur = () => (FROM.includes('<') ? FROM : { name: 'BR Inventaire', address: FROM })

export async function verifierSmtp() {
  if (!mailActif()) {
    console.log(HOST && !APP_URL ? 'Emails : APP_URL manquant, envoi désactivé' : 'Emails : SMTP non configuré (mots de passe provisoires)')
    return
  }
  try {
    await smtp().verify()
    console.log(`Emails : prêt (${HOST}:${PORT}, ${USER || 'sans authentification'})`)
  } catch (e) {
    console.error(`Emails : connexion SMTP impossible (${HOST}:${PORT}) :`, (e as Error).message)
  }
}

interface Message { a: string; sujet: string; titre: string; paragraphes: string[]; bouton?: { texte: string; lien: string }; note?: string }

// Renvoie false (et journalise) en cas d'échec : un email raté ne doit jamais casser l'action en cours
export async function envoyer(m: Message): Promise<boolean> {
  if (!mailActif()) return false
  try {
    await smtp().sendMail({ from: expediteur(), to: m.a, subject: m.sujet, text: texte(m), html: html(m) })
    return true
  } catch (e) {
    console.error(`Email « ${m.sujet} » vers ${m.a} non envoyé :`, (e as Error).message)
    return false
  }
}

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!)

function texte(m: Message) {
  return [
    m.titre, '',
    ...m.paragraphes.flatMap((p) => [p, '']),
    ...(m.bouton ? [`${m.bouton.texte} : ${m.bouton.lien}`, ''] : []),
    ...(m.note ? [m.note, ''] : []),
    '— BR Inventaire',
  ].join('\n')
}

function html(m: Message) {
  const p = (t: string) => `<p style="margin:0 0 14px;font-size:15px;line-height:1.55;color:#0B1220">${esc(t).replace(/\n/g, '<br>')}</p>`
  const bouton = m.bouton ? `
    <p style="margin:22px 0"><a href="${esc(m.bouton.lien)}" style="display:inline-block;background:#2563EB;color:#ffffff;text-decoration:none;font-weight:700;font-size:15px;padding:13px 22px;border-radius:12px">${esc(m.bouton.texte)}</a></p>
    <p style="margin:0 0 14px;font-size:12px;line-height:1.5;color:#5B6576">Si le bouton ne marche pas, copie cette adresse dans ton navigateur :<br><a href="${esc(m.bouton.lien)}" style="color:#1D4ED8;word-break:break-all">${esc(m.bouton.lien)}</a></p>` : ''
  const note = m.note ? `<p style="margin:18px 0 0;padding-top:14px;border-top:1px solid #DCE2EC;font-size:13px;line-height:1.5;color:#5B6576">${esc(m.note)}</p>` : ''
  return `<!doctype html><html lang="fr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"></head>
<body style="margin:0;padding:24px 12px;background:#EEF1F6;font-family:Inter,system-ui,-apple-system,'Segoe UI',Arial,sans-serif">
  <div style="max-width:520px;margin:0 auto;background:#ffffff;border:1px solid #DCE2EC;border-radius:16px;padding:28px 24px">
    <div style="font-size:12px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;color:#1D4ED8;margin-bottom:8px">BR · Suivi matériel</div>
    <h1 style="margin:0 0 18px;font-size:22px;line-height:1.25;color:#0B1220">${esc(m.titre)}</h1>
    ${m.paragraphes.map(p).join('')}${bouton}${note}
  </div>
</body></html>`
}
