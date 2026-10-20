# BR Inventaire

Application web (installable sur Android et iPhone) pour suivre le matériel de BR :
inventaire par QR code, regroupement par stade et dépôt, signalement de problèmes avec photos,
tickets de réparation et impression d'étiquettes sur Niimbot B1.

Chaque action (création, inventaire, déplacement, signalement, réparation, étiquette) est
enregistrée avec **la personne, le lieu, la date et la position GPS** dans un historique.

Tout tourne sur le VPS : **une seule image Docker** (l'app + son serveur) et **PostgreSQL**.

- **App** : React + Vite + TypeScript, PWA installable, fonctionne hors ligne pour les scans
- **Serveur** : Node.js (Hono) dans `server/`, sert l'app et l'API `/api`
- **Base** : PostgreSQL (tables créées automatiquement au démarrage)
- **Photos** : stockées sur le disque du VPS, dans le volume `/data`

---

## Mise en ligne avec Coolify

1. **Base de données** : dans le projet Coolify, *+ New* → *Database* → **PostgreSQL**. Démarre-la et copie
   son **URL interne** (`postgres://…`).
2. **Application** : *+ New* → *Application* → dépôt GitHub `Azertym59/Br-inventory`, branche `main`,
   build pack **Dockerfile**.
   - Port exposé : `3000`
   - Domaine : `https://br.tecaled.fr`
   - Variables d'environnement : `DATABASE_URL` = l'URL interne de la base
     (facultatif : `REF_PREFIX=BR` pour le préfixe des références, et les variables d'envoi d'emails ci-dessous)
   - Stockage persistant : un volume monté sur **`/data`** (photos)
   - *Auto Deploy* activé : chaque modification poussée sur `main` est mise en ligne automatiquement
3. **DNS** : chez le gestionnaire du domaine `tecaled.fr`, un enregistrement **A** `br` → l'IP du VPS.
   Coolify génère le certificat HTTPS tout seul.
4. Ouvre **https://br.tecaled.fr** : au tout premier lancement, l'app demande de **créer le compte
   administrateur**.

## Emails (invitations, mot de passe oublié, signalements)

L'app envoie des emails en SMTP si ces variables sont définies dans Coolify (jamais dans le code) :

| Variable | Valeur (Google Workspace) |
|---|---|
| `SMTP_HOST` | `smtp.gmail.com` |
| `SMTP_PORT` | `465` (SSL) — ou `587` (STARTTLS) |
| `SMTP_USER` | `contact@tecaled.fr` |
| `SMTP_PASS` | mot de passe d'application Google du compte (pas le mot de passe normal) |
| `SMTP_FROM` | `BR Inventaire <contact@tecaled.fr>` |
| `APP_URL` | `https://br.tecaled.fr` (adresse mise dans les liens des emails) |

- **Création d'un compte** : la personne reçoit un lien pour choisir son mot de passe (usage unique, 72 h).
  L'admin peut le renvoyer depuis Équipe → « Mot de passe ».
- **Mot de passe oublié** sur l'écran de connexion : lien valable 1 h (24 h quand c'est l'admin qui l'envoie).
- **Signalement sans compte** : chaque admin actif reçoit un email avec un lien vers « À valider ».
- Les liens ne sont stockés qu'en empreinte SHA-256 ; choisir un mot de passe ferme les autres sessions.
- Au démarrage, les journaux du conteneur indiquent `Emails : prêt (…)` ou l'erreur de connexion SMTP.
- **Sans SMTP** (variables absentes) : rien ne change, l'admin crée les comptes avec un mot de passe provisoire.
  Ce mode de secours reste aussi disponible quand le SMTP est configuré (case à cocher à la création).

## Premier démarrage

Connecté en admin, ⚙️ → **Administration** :
- **Catégories** → « Installer les catégories standard » (dalles, moniteurs, modules, processeurs Novastar,
  cartes de réception, hubs, CVT, matrices, straps RJ45/powerCON, fibres, câbles vidéo, alimentations,
  main power, câbles 32/63 A, champignons, disjoncteurs, ordinateurs, claviers, souris).
- **Lieux** → le dépôt BR et les stades.
- **Équipe** → « Créer un compte » pour chaque technicien et admin (invitation par email, ou mot de passe provisoire sans SMTP).

## Rôles

| Qui | Connexion | Peut faire |
|---|---|---|
| N'importe qui (personnel du stade, prestataire…) | **Sans compte** : juste son nom | Scanner, consulter la fiche, inventorier, signaler un problème avec photos |
| Technicien | Email + mot de passe | + réparations (démarrer, clôturer avec photos), créer du matériel, imprimer les étiquettes |
| Admin | Email + mot de passe | + **valider** les signalements sans compte, **re-dispatcher** le matériel entre parcs, assigner les tickets, gérer lieux / catégories / modèles / équipe |

- Un signalement **sans compte** arrive dans « À valider » chez les admins avant de devenir un ticket.
- Matériel scanné dans un **autre parc** que le sien : un admin le déplace directement ; pour les autres,
  une proposition de déplacement part en validation.
- Les droits sont vérifiés **côté serveur** (`server/api.ts`).
- Mot de passe oublié : lien par email depuis l'écran de connexion ; sinon un admin envoie un lien ou définit un mot de passe provisoire depuis **Équipe**.

## Étiquettes Niimbot B1

- **Numérotation des séries** : à la création de plusieurs pièces identiques, elles sont numérotées
  (« Dalle 001 », « Dalle 002 »…). Des pièces déjà créées se numérotent depuis l'écran Étiquettes.
- **Par lot** : filtre catégorie / modèle / lieu, puis plage « du n° X au n° Y » ; impression Bluetooth
  (Chrome Android / ordinateur) avec bouton Arrêter, ou export Excel pour l'appli Niimbot.
- **À l'unité** : Bluetooth direct sur Android, partage d'image vers l'appli Niimbot sur iPhone.
- Le QR code contient `https://br.tecaled.fr/m/BR-00042` : scanné avec l'appareil photo, il ouvre la fiche.

## Hors ligne

L'app garde une copie des données sur le téléphone. Sans réseau, on peut consulter les fiches,
inventorier et changer des statuts : ces actions sont mises en attente et envoyées dès que le réseau
revient (bandeau en bas de l'écran). La création de matériel et les signalements avec photos demandent
du réseau.

## Développement

```bash
npm install
# PostgreSQL local, puis :
DATABASE_URL=postgres://… DATA_DIR=./data npm run dev:server   # API sur :3000
npm run dev                                                     # app sur :5173 (proxy /api)
npm run build:all && npm start                                  # version de production
```

```
server/
  index.ts      démarrage, photos, fichiers de l'app
  api.ts        toutes les routes /api et les règles d'accès
  auth.ts       mots de passe (scrypt), sessions (cookie), liens à usage unique, rôles
  db.ts         connexion PostgreSQL et schéma
  mail.ts       envoi d'emails (SMTP, nodemailer) et mise en page
src/
  lib/api.ts       appels au serveur
  lib/outbox.ts    file d'attente hors ligne
  lib/actions.ts   actions métier côté app
  lib/etiquettes.ts, lib/niimbot.ts   étiquettes et impression B1
  pages/        un fichier par écran
```
