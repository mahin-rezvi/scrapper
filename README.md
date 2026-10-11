# DIUBoard

DIUBoard brings DIU department notices and class routines into one searchable dashboard. It uses Next.js App Router, TypeScript, Tailwind CSS, Neon Postgres, Cheerio, Gemini for notice analysis and OCR fallback, and PDF.js for local PDF text/layout extraction.

## Features

- Searchable and filterable notices from DIU's 31 academic department boards plus the ICT in Education, DSC Hall, and Registrar boards.
- Cursor-paginated notice results, direct source/attachment links, and a live overview backed by database totals.
- Five-minute incremental notice polling, duplicate-safe updates, gradual archive backfill, and sync status history.
- Routine PDF discovery and parsing after each notice poll, only when a department's latest notice is a class routine.
- PDF.js extraction that maps routine text by page coordinates into day, time-slot, row, room, course, and teacher cells, with Gemini vision fallback for scanned PDFs or unsupported table layouts.
- Department-aware timetable search by section (including codes such as `64_I`), teacher, course, or room, plus a tabular routine view that mirrors the source PDF.
- Device-local saved sections for one-tap access, with no account required.
- A routine management page for manual fetches and reviewing published routine versions.

## Local setup

1. Install dependencies and copy the environment template:

   ```bash
   npm ci
   cp .env.example .env.local
   ```

2. Create the app role if needed and set the connection strings:

   ```bash
   neon roles create --branch production --name diuboard_app
   neon connection-string production --database-name Routines --role-name diuboard_app --pooled
   ```

   Set `DIU_DATABASE_URL` to the pooled `diuboard_app` connection and `DIU_DATABASE_URL_UNPOOLED` to the direct `neondb_owner` connection. Set `GEMINI_API_KEY` for notice analysis and vision fallback, and a long random `ROUTINE_SYNC_SECRET` to enable manual routine scans. Text-based routine PDFs are parsed locally and need no API key.

3. Apply the database migration with the direct connection:

   ```bash
   npm run db:migrate
   ```

4. Seed all tracked DIU boards and run the initial notice and routine sync. The scraper adds older pages gradually on later scheduled runs:

   ```bash
   npm run sync:run
   ```

5. Start the app:

   ```bash
   npm run dev
   ```

The app connects to Neon only from server-side Next.js code. Keep `DIU_DATABASE_URL` server-only and never prefix it with `NEXT_PUBLIC_`.

For Vercel and GitHub Actions, set `DIU_DATABASE_URL` to the pooled `diuboard_app` connection. Use `DIU_DATABASE_URL_UNPOOLED` locally or in a separate migration job only when applying schema changes; scheduled notice/routine polling does not need the direct owner connection.

## Routine updates

The scheduled GitHub Actions workflow polls DIU boards every five minutes and backfills one older notice page per department on each run. The dashboard and open routine pages refresh from Neon every five minutes while visible. DIU does not provide a notice webhook, so this is near-real-time polling rather than a push-based real-time feed. Routine parsing runs only when a department's latest stored notice is a class routine; a failed notice poll skips routine parsing for that department.

Apply schema migrations separately when the schema changes; scheduled polling never runs DDL. Configure the database role secret below after running `npm run db:migrate` once for the target database. Add these GitHub repository secrets:

- `DIU_DATABASE_URL`
- `GEMINI_API_KEY`

`GEMINI_MODEL` remains optional and defaults to `gemini-2.5-flash` for notice analysis. `GEMINI_ROUTINE_MODEL` optionally selects the vision fallback model and defaults to `gemini-3.8-flash`. Text-based routine PDFs are parsed locally; the Gemini API key is used only when a PDF has no usable text layer or the local table mapping fails validation. For manual routine scans on `/routine/manage`, configure `ROUTINE_SYNC_SECRET` in the Vercel environment.

Routine extraction uses PDF text positions first, then Gemini vision as a fallback, and validates the resulting Room/Course/Teacher grid before publishing. Examination and mid-term routine notices are excluded from class-timetable discovery, and an extracted exam title is rejected as a final safeguard. The student view falls back to the last recognized class routine instead of showing an exam timetable, and clearly labels that fallback when the latest published version is not a class routine. A new version becomes current only after its complete table has been written successfully; the previous version remains current if PDF retrieval or parsing fails. If neither extraction path produces a complete, schema-valid table, the new routine is rejected. The parser is not claimed to be perfect: supported PDF layouts should be checked against their source whenever DIU changes a template.

Notice search uses PostgreSQL full-text search with a matching GIN index and keyset pagination, so loading older notices does not require scanning and skipping every prior page. Run `npm run db:migrate` to apply the idempotent notice search/category indexes on an existing installation.

## Scripts

- `npm run dev` — run the app locally.
- `npm run lint` — lint the app.
- `npm run test:routines` — run routine search and notice-classification regression tests.
- `npm run db:migrate` — apply pending SQL migrations with the direct Neon connection.
- `npm run sync:run` — sync notices and check routine PDFs.
- `npm run notices:backfill` — fetch the full available notice archive from every tracked department board into Neon.
- `npm run scrape:dry` — inspect the notice scraper output locally.

## Database

The versioned SQL migration lives in `db/migrations/`. It creates department, notice, sync-history, routine-version, routine-day, time-slot, and table-cell records, plus the atomic routine publishing function. The migration runner records applied versions in `diu_schema_migrations` and wraps each migration in a transaction.

Public pages read the database through the server-side application connection. The Neon Data API is not enabled, so the database connection string stays on the server and public clients cannot query the database directly.
