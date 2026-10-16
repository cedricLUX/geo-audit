-- Table des audits AI Department (optionnelle : sans Supabase, l'app garde les audits en mémoire).
create table if not exists public.audits (
  id uuid primary key,
  email text not null,
  created_at timestamptz not null default now(),
  profile jsonb,
  summary jsonb
);
create index if not exists audits_email_created_idx on public.audits (email, created_at desc);
-- Accès réservé au serveur (clé service_role) : aucune politique publique.
alter table public.audits enable row level security;
