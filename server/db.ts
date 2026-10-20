import postgres from 'postgres'

const url = process.env.DATABASE_URL
if (!url) throw new Error('DATABASE_URL manquant')

// Colonnes en snake_case dans la base, en camelCase côté code (postgres.camel)
export const sql = postgres(url, {
  transform: postgres.camel,
  max: 10,
  onnotice: () => {},
})

export type Sql = typeof sql

// Schéma créé / complété au démarrage (idempotent)
const SCHEMA = /* sql */ `
create extension if not exists pgcrypto;

create table if not exists utilisateurs (
  id uuid primary key default gen_random_uuid(),
  nom text not null,
  email text unique,
  mdp_hash text,
  role text not null check (role in ('anonyme', 'technicien', 'admin')),
  actif boolean not null default true,
  cree_le timestamptz not null default now()
);

create table if not exists sessions (
  token text primary key,
  utilisateur_id uuid not null references utilisateurs(id) on delete cascade,
  cree_le timestamptz not null default now(),
  expire_le timestamptz not null
);
create index if not exists sessions_utilisateur on sessions(utilisateur_id);

create table if not exists lieux (
  id uuid primary key default gen_random_uuid(),
  nom text not null,
  type text not null default 'stade',
  adresse text not null default '',
  actif boolean not null default true,
  cree_le timestamptz not null default now()
);

create table if not exists categories (
  id text primary key,
  nom text not null,
  famille text not null,
  champs jsonb not null default '[]',
  quantite_par_defaut boolean not null default false,
  ordre integer not null default 0
);

create table if not exists modeles (
  id uuid primary key default gen_random_uuid(),
  categorie_id text not null references categories(id) on delete cascade,
  nom text not null,
  valeurs jsonb not null default '{}'
);

create sequence if not exists materiel_seq;
create sequence if not exists ticket_seq;

create table if not exists materiel (
  ref text primary key,
  nom text not null,
  categorie_id text not null,
  categorie_nom text not null,
  famille text not null,
  modele_id uuid,
  modele_nom text,
  valeurs jsonb not null default '{}',
  quantite integer,
  numero integer,
  lieu_id uuid not null,
  lieu_nom text not null,
  statut text not null default 'ok',
  etiquetee boolean not null default false,
  photo_url text,
  tickets_ouverts integer not null default 0,
  dernier_inventaire jsonb,
  cree_le timestamptz not null default now(),
  cree_par jsonb not null
);
create index if not exists materiel_lieu on materiel(lieu_id);

create table if not exists evenements (
  id bigserial primary key,
  materiel_ref text not null,
  materiel_nom text not null,
  type text not null,
  titre text not null,
  user_id uuid,
  user_nom text not null,
  lieu_id uuid,
  lieu_nom text,
  gps jsonb,
  commentaire text,
  photos jsonb not null default '[]',
  date timestamptz not null default now()
);
create index if not exists evenements_ref_date on evenements(materiel_ref, date desc);
create index if not exists evenements_date on evenements(date desc);

create table if not exists tickets (
  id uuid primary key default gen_random_uuid(),
  numero text not null,
  materiel_ref text not null,
  materiel_nom text not null,
  lieu_id uuid,
  lieu_nom text not null,
  description text not null default '',
  gravite text not null,
  statut text not null default 'ouvert',
  signale_par jsonb not null,
  valide_par jsonb,
  assigne_a jsonb,
  photos jsonb not null default '[]',
  photos_apres jsonb not null default '[]',
  gps jsonb,
  commentaire_reparation text,
  cree_le timestamptz not null default now(),
  maj_le timestamptz not null default now(),
  repare_le timestamptz
);
create index if not exists tickets_statut on tickets(statut);
create index if not exists tickets_ref on tickets(materiel_ref);

create table if not exists signalements (
  id uuid primary key default gen_random_uuid(),
  materiel_ref text not null,
  materiel_nom text not null,
  lieu_id uuid,
  lieu_nom text not null,
  description text not null default '',
  gravite text not null,
  photos jsonb not null default '[]',
  gps jsonb,
  declarant jsonb not null,
  statut text not null default 'a_valider',
  ticket text,
  traite_par jsonb,
  traite_le timestamptz,
  cree_le timestamptz not null default now()
);

create table if not exists propositions (
  id uuid primary key default gen_random_uuid(),
  materiel_ref text not null,
  materiel_nom text not null,
  de_lieu_id uuid,
  de_lieu_nom text not null,
  vers_lieu_id uuid not null,
  vers_lieu_nom text not null,
  par jsonb not null,
  statut text not null default 'a_valider',
  traite_par jsonb,
  traite_le timestamptz,
  cree_le timestamptz not null default now()
);

create table if not exists inventaires (
  id uuid primary key default gen_random_uuid(),
  lieu_id uuid not null,
  lieu_nom text not null,
  par jsonb not null,
  attendus jsonb not null default '[]',
  scannes jsonb not null default '[]',
  demarre_le timestamptz not null default now(),
  termine_le timestamptz
);
`

export async function migrer() {
  await sql.unsafe(SCHEMA)
  // Sessions expirées
  await sql`delete from sessions where expire_le < now()`
}
