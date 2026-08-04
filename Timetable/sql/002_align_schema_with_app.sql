-- =====================================================================
-- MIGRATION 002 : alignement du schéma live avec l'application
-- =====================================================================
-- Les CREATE TABLE IF NOT EXISTS de supabase_dev_policies.sql n'ont eu
-- aucun effet sur la base existante : plusieurs colonnes utilisées par
-- l'app ET par les fonctions RPC manquent réellement en production, ce
-- qui provoque les erreurs Postgres 42703 :
--   * matches.score1 / score2 / winner_id  -> complete_poule_match et
--     advance_bracket_winner échouent systématiquement.
--   * matches.finished_at                  -> clôture d'un match.
--   * tables.name / label / number         -> lecture des tables libres.
-- À exécuter dans l'éditeur SQL Supabase (idempotent).
-- =====================================================================

ALTER TABLE public.matches
  ADD COLUMN IF NOT EXISTS score1 integer,
  ADD COLUMN IF NOT EXISTS score2 integer,
  ADD COLUMN IF NOT EXISTS winner_id uuid REFERENCES public.players(id),
  ADD COLUMN IF NOT EXISTS finished_at timestamptz;

ALTER TABLE public.tables
  ADD COLUMN IF NOT EXISTS number integer,
  ADD COLUMN IF NOT EXISTS name text,
  ADD COLUMN IF NOT EXISTS label text,
  ADD COLUMN IF NOT EXISTS status text DEFAULT 'free';

-- Le nom d'une table est optionnel : il est dérivé de son numéro côté app.
ALTER TABLE public.tables ALTER COLUMN name DROP NOT NULL;

-- Les fonctions RPC ne reconnaissent que 'free' / 'busy'.
UPDATE public.tables SET status = 'free'
  WHERE status IS NULL OR upper(status) IN ('DISPONIBLE', 'LIBRE', 'AVAILABLE');
UPDATE public.tables SET status = 'busy'
  WHERE upper(status) IN ('EN COURS', 'OCCUPE', 'PLAYING');

-- Les matchs sont désormais filtrés par tableau (category_id) et non plus
-- par tournoi.
CREATE INDEX IF NOT EXISTS idx_matches_category ON public.matches (category_id);
