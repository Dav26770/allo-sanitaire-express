-- ============================================================================
-- Migration 002 — Qualification des leads (Allo Sanitaire Express 93)
-- À exécuter dans Supabase (projet xmkvaetrejjqymahbgvi) :
-- Dashboard → SQL Editor → coller ce fichier → Run.
--
-- Tant que cette migration n'est pas passée, le site fonctionne quand même :
-- main.js détecte le refus d'insertion et replie la qualification dans la
-- colonne message (« Budget : … · Occupant : … · Score : 82/100 (chaud) »).
-- ============================================================================

alter table public.leads
  add column if not exists budget   text,
  add column if not exists occupant text,
  add column if not exists score    integer,
  add column if not exists qualite  text;

comment on column public.leads.budget   is 'Budget envisagé, libellé lisible (ex. « 6 000 – 10 000 € »)';
comment on column public.leads.occupant is 'Propriétaire / Locataire / Pour un proche';
comment on column public.leads.score    is 'Score de qualification 0-100 calculé côté site (main.js)';
comment on column public.leads.qualite  is 'chaud (score >= 70) / tiede (45-69) / froid (< 45)';

-- ----------------------------------------------------------------------------
-- NB fonction export_leads (utilisée par le Google Sheet) :
--   · si elle fait « select * from public.leads », rien d'autre à faire ;
--   · si elle liste les colonnes une à une, ajouter budget, occupant, score,
--     qualite à sa liste (Database → Functions → export_leads).
-- Vérification rapide après migration :
--   select column_name from information_schema.columns
--   where table_name = 'leads' order by ordinal_position;
-- ----------------------------------------------------------------------------
