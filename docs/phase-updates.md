# Phase Updates

Last updated: 2026-07-07

## Current State

- Phase 0 scaffold exists with Next.js App Router, TypeScript, Tailwind, ESLint,
  Prisma, Cheerio, R2 SDK, `@google/genai`, Zod, Day.js, and project scripts.
- Phase 1 database is implemented with Prisma schema, initial migration SQL,
  Prisma 7 config, singleton client, and a seed script for the 9 confirmed
  departments.
- Phase 2 scraper is implemented with live-verified selectors for the DIU
  backend. Live HTML checked on 2026-07-07:
  - List page: `div.blog-entry`, title/detail link in `h3.heading a`, category
    in the first `div.col-md-2`, date in the `fa-calendar-alt` column.
  - Detail page: title in `div.title h3`, body in misspelled `div.conten`,
    resource links via `/download-file/`.
  - Raw inspection copies were saved locally during verification at
    `/tmp/hall-notice.html` and `/tmp/hall-detail-3754.html`.
- Phase 3 new-notice detection is implemented in `lib/pipeline/runPipeline.ts`.
  It checks the `(departmentId, sourceId)` unique key instead of trusting source
  ID ordering.
- Phase 4 resource upload is implemented through `lib/storage/uploadResource.ts`
  with R2 `PutObjectCommand`; per-resource failures are logged and do not stop
  the notice.
- Phase 5 Gemini analysis is implemented with `@google/genai`, JSON response
  mode, Zod validation, and one retry on validation failure.
- Phase 6 cron pipeline route is implemented at `/api/cron/scrape` and requires
  `Authorization: Bearer ${CRON_SECRET}`.
- Phase 7 scheduling is configured in `vercel.json` as once daily at `0 6 * * *`.
- Phase 8 dashboard now exists at `/dashboard`, filters by department, and shows
  notices with analysis, priority, deadlines, resources, and source links.
- `README.md` now covers setup, dry runs, adding departments, and scheduling.

## Verification Completed

- Live fetch of `https://webbackend.daffodilvarsity.edu.bd/department/hall/notice`
  succeeded after network approval.
- Live fetch of
  `https://webbackend.daffodilvarsity.edu.bd/department/hall/notice-detail/3754`
  succeeded after network approval.
- The live pages confirmed the scraper selector assumptions above.

## Verification Still Needed

- `npm run build` could not be run in the current shell because `npm` and `node`
  are not available on PATH.
- `npm run scrape:dry -- --department=hall --full` could not be run for the same
  reason. Re-run this once Node/npm are available.
- End-to-end checks still need real environment values:
  - `npx prisma migrate dev --name init` or equivalent against the target DB.
  - `npm run db:seed`, then confirm the 9 departments.
  - Run the pipeline twice and confirm no duplicate `Notification` rows.
  - Confirm at least one notice attachment uploads to R2 and the public URL loads.
  - Confirm Gemini creates a schema-valid `Analysis` row.
  - Hit `/api/cron/scrape` with the bearer token and confirm `RunLog` entries.

## Notes For Future Work

- Do not scrape `daffodilvarsity.edu.bd`; use
  `https://webbackend.daffodilvarsity.edu.bd`.
- Keep `GEMINI_MODEL` configurable. Current default is `gemini-2.5-flash`.
- `Department.lastSeenId` is bookkeeping only. The duplicate gate must remain the
  database unique key on `(departmentId, sourceId)`.
- If Vercel Hobby scheduling is too infrequent, add a GitHub Actions scheduled
  workflow that calls `/api/cron/scrape` with `CRON_SECRET`.
