# BR Inventaire

Application web (installable sur Android et iPhone) pour suivre le matériel de BR :
inventaire par QR code, regroupement par stade et dépôt, signalement de problèmes avec photos,
tickets de réparation et impression d'étiquettes sur Niimbot B1.

Chaque action (création, inventaire, déplacement, signalement, réparation, étiquette) est
enregistrée avec **la personne, le lieu, la date et la position GPS** dans un historique non modifiable.

- **Stack** : React + Vite + TypeScript, PWA (vite-plugin-pwa)
- **Données** : Firebase (Authentication, Firestore avec cache hors ligne, Storage pour les photos)
- **Hébergement** : Firebase Hosting (gratuit)

---

## 1. Créer le projet Firebase (une seule fois)

1. Va sur <https://console.firebase.google.com> → **Ajouter un projet** (ex. `br-inventory`). Google Analytics : inutile.
2. **Authentication** → Commencer → onglet *Sign-in method* → activer **E-mail/Mot de passe**, **Google** et **Anonyme**
   (Anonyme = l'accès sans compte pour signaler et inventorier).
3. **Firestore Database** → Créer une base de données → mode **production** → région **europe-west** (Belgique, `eur3` ou `europe-west1`).
4. **Storage** (pour les photos) : depuis février 2026, Google demande le plan **Blaze** pour activer Storage,
   même si l'usage reste dans le quota gratuit. Passe au plan Blaze, puis **mets une alerte budget à 5 €**
   (Google Cloud → Facturation → Budgets et alertes). Choisis une région US (`us-central1`, `us-east1` ou `us-west1`)
   pour le bucket : ce sont les seules couvertes par le quota gratuit.
5. **Paramètres du projet** (roue dentée) → *Vos applications* → icône **Web `</>`** → nom `BR Inventaire` →
   copier les valeurs du bloc `firebaseConfig`.

## 2. Configurer le projet en local

```bash
git clone https://github.com/Azertym59/br-inventory.git
cd br-inventory
npm install
npm run dev               # http://localhost:5173 (déjà branché sur le projet br-inventory)
```

## 3. Publier les règles de sécurité et mettre en ligne

```bash
npm install -g firebase-tools
firebase login
firebase deploy --only firestore,storage   # règles + index
npm run build
firebase deploy --only hosting         # l'app est en ligne sur https://<projet>.web.app
```

Ajoute ensuite le domaine `<projet>.web.app` (et ton domaine perso si tu en mets un) dans
Authentication → Paramètres → **Domaines autorisés**.

## 4. Premier démarrage

1. Ouvre l'app, **crée ton compte**. Tout nouveau compte est « technicien ».
2. Dans la console Firebase → Firestore → collection `utilisateurs` → ton document → passe `role` à **`admin`**.
3. Recharge l'app (connecte-toi avec « Je suis technicien ou admin ») → ⚙️ **Administration** :
   - **Catégories** → « Installer les catégories standard » (dalles, moniteurs, modules, processeurs Novastar,
     cartes de réception, hubs, CVT, matrices, straps RJ45/powerCON, fibres, câbles vidéo, alimentations,
     main power, câbles 32/63 A, champignons, disjoncteurs, ordinateurs, claviers, souris).
   - **Lieux** → créer le dépôt BR et les stades.
   - **Équipe** → quand tes techniciens et admins ont créé leur compte, ajuste leur rôle.

## Rôles

| Qui | Connexion | Peut faire |
|---|---|---|
| N'importe qui (personnel du stade, prestataire…) | **Sans compte** : juste son nom, mémorisé sur le téléphone | Scanner, consulter la fiche, inventorier, signaler un problème avec photos |
| Technicien (2-3) | Compte email ou Google | + réparations (démarrer, clôturer avec photos), créer du matériel, imprimer les étiquettes |
| Admin (2-3) | Compte email ou Google | + **valider** les signalements sans compte, **re-dispatcher** le matériel entre parcs, assigner les tickets, gérer lieux / catégories / modèles / équipe |

- Un signalement **sans compte** n'ouvre pas de ticket directement : il arrive dans « À valider » chez les admins
  (anti-spam et doublons). Un signalement fait par un technicien ou un admin ouvre le ticket tout de suite.
- Si un matériel est scanné dans un **autre parc** que le sien, un admin le déplace directement ; pour les autres,
  une **proposition de déplacement** part en validation.
- Changer le parc d'un matériel est réservé aux admins (verrouillé aussi dans les règles Firestore).

## Étiquettes Niimbot B1

- **Par lot** : écran Étiquettes → filtres → *Exporter Excel* → dans l'appli Niimbot, créer un modèle,
  importer le fichier Excel et associer la colonne **URL** à un QR code, **Référence** et **Nom** à des textes.
- **À l'unité** :
  - **Android (Chrome)** / ordinateur : impression directe en Bluetooth (librairie open source NiimBlue, non officielle).
  - **iPhone** : l'étiquette est générée en image et partagée vers l'appli Niimbot.
- Le QR code contient l'adresse `https://<app>/m/BR-00042` : scanné avec l'appareil photo du téléphone, il ouvre
  directement la fiche.

## Fonctionnement hors ligne

Firestore garde une copie locale : dans un sous-sol sans réseau, on peut consulter les fiches, inventorier et
changer des statuts ; tout se synchronise au retour du réseau. **Création de matériel et envoi de photos
nécessitent le réseau** (numérotation et stockage côté serveur).

## Structure

```
src/
  firebase.ts          initialisation Firebase (+ cache hors ligne)
  types.ts             modèle de données
  data/catalogue.ts    catégories standard + calcul auto de la résolution des dalles
  lib/actions.ts       toutes les écritures (création, inventaire, déplacement, tickets…) + historique
  lib/etiquettes.ts    rendu des étiquettes, export Excel, partage iPhone
  lib/niimbot.ts       impression Bluetooth B1
  pages/               un fichier par écran
firestore.rules        sécurité (rôles, historique en ajout seul)
storage.rules          photos : connectés uniquement, images ≤ 5 Mo
```
