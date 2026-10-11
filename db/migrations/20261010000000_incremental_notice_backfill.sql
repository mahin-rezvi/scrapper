ALTER TABLE public.departments
  ADD COLUMN IF NOT EXISTS notice_backfill_page integer NOT NULL DEFAULT 2
    CHECK (notice_backfill_page >= 2),
  ADD COLUMN IF NOT EXISTS notice_backfill_complete boolean NOT NULL DEFAULT false;

INSERT INTO public.diu_schema_migrations (version)
VALUES ('20261010000000_incremental_notice_backfill')
ON CONFLICT (version) DO NOTHING;
