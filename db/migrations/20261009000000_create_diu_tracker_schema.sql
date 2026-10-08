CREATE TABLE IF NOT EXISTS public.departments (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  code text NOT NULL UNIQUE CHECK (code ~ '^[a-z0-9-]{1,64}$'),
  name text NOT NULL,
  source_url text NOT NULL,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.notices (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  department_id bigint NOT NULL REFERENCES public.departments(id) ON DELETE CASCADE,
  source_id bigint NOT NULL CHECK (source_id > 0),
  title text NOT NULL,
  category text,
  body_text text NOT NULL DEFAULT '',
  body_html text,
  attachments jsonb NOT NULL DEFAULT '[]'::jsonb
    CHECK (jsonb_typeof(attachments) = 'array'),
  source_url text NOT NULL,
  published_at timestamptz,
  first_seen_at timestamptz NOT NULL DEFAULT now(),
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (department_id, source_id)
);

CREATE INDEX IF NOT EXISTS notices_department_published_idx
  ON public.notices (department_id, published_at DESC NULLS LAST, id DESC);
CREATE INDEX IF NOT EXISTS notices_recent_idx
  ON public.notices (published_at DESC NULLS LAST, id DESC);

CREATE TABLE IF NOT EXISTS public.sync_runs (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  kind text NOT NULL DEFAULT 'notices' CHECK (kind IN ('notices', 'routines')),
  status text NOT NULL CHECK (status IN ('running', 'completed', 'partial', 'failed')),
  departments_processed integer NOT NULL DEFAULT 0 CHECK (departments_processed >= 0),
  notices_added integer NOT NULL DEFAULT 0 CHECK (notices_added >= 0),
  notices_refreshed integer NOT NULL DEFAULT 0 CHECK (notices_refreshed >= 0),
  routines_added integer NOT NULL DEFAULT 0 CHECK (routines_added >= 0),
  errors integer NOT NULL DEFAULT 0 CHECK (errors >= 0),
  message text,
  started_at timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz
);
CREATE INDEX IF NOT EXISTS sync_runs_recent_idx
  ON public.sync_runs (kind, started_at DESC, id DESC);

CREATE TABLE IF NOT EXISTS public.routine_versions (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  department_id bigint NOT NULL REFERENCES public.departments(id) ON DELETE CASCADE,
  notice_id bigint REFERENCES public.notices(id) ON DELETE SET NULL,
  title text NOT NULL,
  version_label text,
  effective_from date,
  prepared_by text,
  source_pdf_url text NOT NULL,
  content_sha256 text NOT NULL CHECK (content_sha256 ~ '^[a-f0-9]{64}$'),
  parsed_data jsonb NOT NULL CHECK (jsonb_typeof(parsed_data) = 'object'),
  is_current boolean NOT NULL DEFAULT true,
  parsed_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (department_id, content_sha256)
);
CREATE UNIQUE INDEX IF NOT EXISTS routine_one_current_per_department_idx
  ON public.routine_versions (department_id) WHERE is_current;
CREATE INDEX IF NOT EXISTS routine_versions_department_created_idx
  ON public.routine_versions (department_id, created_at DESC, id DESC);
CREATE INDEX IF NOT EXISTS routine_versions_notice_id_idx
  ON public.routine_versions (notice_id) WHERE notice_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS public.routine_days (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  routine_id bigint NOT NULL REFERENCES public.routine_versions(id) ON DELETE CASCADE,
  day_index smallint NOT NULL CHECK (day_index >= 0),
  day_name text NOT NULL,
  UNIQUE (routine_id, day_index)
);

CREATE TABLE IF NOT EXISTS public.routine_time_slots (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  routine_id bigint NOT NULL REFERENCES public.routine_versions(id) ON DELETE CASCADE,
  day_index smallint NOT NULL CHECK (day_index >= 0),
  slot_index smallint NOT NULL CHECK (slot_index >= 0),
  time_label text NOT NULL,
  start_time time,
  end_time time,
  UNIQUE (routine_id, day_index, slot_index)
);

CREATE TABLE IF NOT EXISTS public.routine_entries (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  routine_id bigint NOT NULL REFERENCES public.routine_versions(id) ON DELETE CASCADE,
  day_index smallint NOT NULL CHECK (day_index >= 0),
  row_index smallint NOT NULL CHECK (row_index >= 0),
  slot_index smallint NOT NULL CHECK (slot_index >= 0),
  room text NOT NULL DEFAULT '',
  course text NOT NULL DEFAULT '',
  teacher text NOT NULL DEFAULT '',
  section_code text,
  UNIQUE (routine_id, day_index, row_index, slot_index)
);
CREATE INDEX IF NOT EXISTS routine_entries_section_lookup_idx
  ON public.routine_entries (routine_id, section_code, day_index, slot_index)
  WHERE section_code IS NOT NULL;

CREATE OR REPLACE FUNCTION public.publish_routine_version(
  p_department_id bigint,
  p_title text,
  p_version_label text,
  p_effective_from date,
  p_prepared_by text,
  p_source_pdf_url text,
  p_content_sha256 text,
  p_parsed_data jsonb,
  p_notice_id bigint DEFAULT NULL
) RETURNS bigint
LANGUAGE plpgsql
AS $$
DECLARE
  v_routine_id bigint;
  v_day jsonb;
  v_slot jsonb;
  v_row jsonb;
  v_cell jsonb;
  v_day_index integer;
  v_slot_index integer;
  v_row_index integer;
BEGIN
  PERFORM 1 FROM public.departments WHERE id = p_department_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Unknown department id %', p_department_id;
  END IF;

  SELECT id INTO v_routine_id
  FROM public.routine_versions
  WHERE department_id = p_department_id AND content_sha256 = p_content_sha256;

  IF v_routine_id IS NOT NULL THEN
    UPDATE public.routine_versions
    SET is_current = false
    WHERE department_id = p_department_id AND is_current AND id <> v_routine_id;
    UPDATE public.routine_versions
    SET is_current = true,
        source_pdf_url = p_source_pdf_url,
        notice_id = COALESCE(p_notice_id, notice_id)
    WHERE id = v_routine_id;
    RETURN v_routine_id;
  END IF;

  INSERT INTO public.routine_versions (
    department_id, notice_id, title, version_label, effective_from, prepared_by,
    source_pdf_url, content_sha256, parsed_data, is_current
  ) VALUES (
    p_department_id, p_notice_id, p_title, p_version_label, p_effective_from, p_prepared_by,
    p_source_pdf_url, p_content_sha256, p_parsed_data, false
  ) RETURNING id INTO v_routine_id;

  FOR v_day, v_day_index IN
    SELECT value, (ordinality - 1)::integer
    FROM jsonb_array_elements(p_parsed_data->'days') WITH ORDINALITY
  LOOP
    INSERT INTO public.routine_days (routine_id, day_index, day_name)
    VALUES (v_routine_id, v_day_index, v_day->>'name');

    FOR v_slot, v_slot_index IN
      SELECT value, (ordinality - 1)::integer
      FROM jsonb_array_elements(v_day->'slots') WITH ORDINALITY
    LOOP
      INSERT INTO public.routine_time_slots (
        routine_id, day_index, slot_index, time_label, start_time, end_time
      ) VALUES (
        v_routine_id, v_day_index, v_slot_index, v_slot->>'label',
        NULLIF(v_slot->>'startTime', '')::time,
        NULLIF(v_slot->>'endTime', '')::time
      );
    END LOOP;

    FOR v_row, v_row_index IN
      SELECT value, (ordinality - 1)::integer
      FROM jsonb_array_elements(v_day->'rows') WITH ORDINALITY
    LOOP
      FOR v_cell, v_slot_index IN
        SELECT value, (ordinality - 1)::integer
        FROM jsonb_array_elements(v_row->'cells') WITH ORDINALITY
      LOOP
        INSERT INTO public.routine_entries (
          routine_id, day_index, row_index, slot_index, room, course, teacher, section_code
        ) VALUES (
          v_routine_id, v_day_index, v_row_index, v_slot_index,
          COALESCE(v_cell->>'room', ''), COALESCE(v_cell->>'course', ''),
          COALESCE(v_cell->>'teacher', ''), NULLIF(v_cell->>'sectionCode', '')
        );
      END LOOP;
    END LOOP;
  END LOOP;

  UPDATE public.routine_versions
  SET is_current = false
  WHERE department_id = p_department_id AND is_current;
  UPDATE public.routine_versions SET is_current = true WHERE id = v_routine_id;
  RETURN v_routine_id;
END;
$$;

REVOKE ALL ON FUNCTION public.publish_routine_version(
  bigint, text, text, date, text, text, text, jsonb, bigint
) FROM PUBLIC;

GRANT USAGE ON SCHEMA public TO diuboard_app;
GRANT SELECT, INSERT, UPDATE ON public.departments, public.notices, public.sync_runs,
  public.routine_versions, public.routine_days, public.routine_time_slots,
  public.routine_entries TO diuboard_app;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO diuboard_app;
GRANT EXECUTE ON FUNCTION public.publish_routine_version(
  bigint, text, text, date, text, text, text, jsonb, bigint
) TO diuboard_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE ON TABLES TO diuboard_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT USAGE, SELECT ON SEQUENCES TO diuboard_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT EXECUTE ON FUNCTIONS TO diuboard_app;

CREATE TABLE IF NOT EXISTS public.diu_schema_migrations (
  version text PRIMARY KEY,
  applied_at timestamptz NOT NULL DEFAULT now()
);
INSERT INTO public.diu_schema_migrations (version)
VALUES ('20261009000000_create_diu_tracker_schema')
ON CONFLICT (version) DO NOTHING;
