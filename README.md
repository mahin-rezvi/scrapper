# DIUBoard

DIUBoard brings DIU department notices and class routines into one searchable dashboard. It uses Next.js App Router, TypeScript, Tailwind CSS, Neon Postgres, Cheerio, and Gemini.

## Features

- Recent notices from DIU's 31 academic department boards plus the ICT in Education, DSC Hall, and Registrar boards.
- Daily incremental notice sync, duplicate-safe updates, and sync status history.
- Daily discovery of routine PDFs across tracked departments.
- Gemini PDF extraction that stores the routine as day, time-slot, row, room, course, and teacher cells.
- Section search, including codes such as `64_I`, and a tabular routine view that mirrors the source PDF.
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

   Set `DIU_DATABASE_URL` to the pooled `diuboard_app` connection and `DIU_DATABASE_URL_UNPOOLED` to the direct `neondb_owner` connection. Set `GEMINI_API_KEY` to a Gemini API key and a long random `ROUTINE_SYNC_SECRET` to enable manual routine scans.

3. Apply the database migration with the direct connection:

   ```bash
   npm run db:migrate
   ```

4. Seed all tracked DIU boards and run the initial notice and routine sync:

   ```bash
   npm run sync:run
   ```

5. Start the app:

   ```bash
   npm run dev
   ```

The app connects to Neon only from server-side Next.js code. Keep `DIU_DATABASE_URL` server-only and never prefix it with `NEXT_PUBLIC_`.

## Routine updates

The scheduled GitHub Actions workflow scans DIU boards each day at 06:00 UTC. Add these repository secrets:

- `DIU_DATABASE_URL`
- `DIU_DATABASE_URL_UNPOOLED`
- `GEMINI_API_KEY`

Optional repository variables are `GEMINI_MODEL` and `GEMINI_ROUTINE_MODEL`; both default to `gemini-2.5-flash` when unset. To allow the manual action on `/routine/manage`, also configure `ROUTINE_SYNC_SECRET` in the deployment environment. The key is checked server-side and is not stored in Neon.

Routine extraction is validated before publishing. A new version becomes current only after its complete table has been written successfully; the previous version remains current if PDF retrieval or parsing fails.

## Scripts

- `npm run dev` — run the app locally.
- `npm run lint` — lint the app.
- `npm run db:migrate` — apply pending SQL migrations with the direct Neon connection.
- `npm run sync:run` — sync notices and check routine PDFs.
- `npm run scrape:dry` — inspect the notice scraper output locally.

## Database

The versioned SQL migration lives in `db/migrations/`. It creates department, notice, sync-history, routine-version, routine-day, time-slot, and table-cell records, plus the atomic routine publishing function. The migration runner records applied versions in `diu_schema_migrations` and wraps each migration in a transaction.

Public pages read the database through the server-side application connection. The Neon Data API is not enabled, so the database connection string stays on the server and public clients cannot query the database directly.
