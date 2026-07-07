# DIU Notice Tracker

Next.js app for scraping Daffodil International University notices from the
server-rendered backend, storing new notices in Postgres, uploading attachments
to Cloudflare R2, analyzing notice text with Gemini, and displaying the results
on a dashboard.

## Setup

1. Install dependencies:

```bash
npm install
```

2. Copy environment variables:

```bash
cp .env.example .env.local
```

3. Fill `.env.local` with Neon/Postgres, Gemini, R2, and cron secret values.

4. Run migrations and seed departments:

```bash
npm run db:migrate
npm run db:seed
```

5. Start the app:

```bash
npm run dev
```

The dashboard is available at `/dashboard`. The protected scraper endpoint is
`/api/cron/scrape` and requires:

```text
Authorization: Bearer <CRON_SECRET>
```

## Scraper Dry Run

Use the dry-run command before changing parser selectors:

```bash
npm run scrape:dry -- --department=hall --full
npm run scrape:dry -- --department=eee
```

Dry runs fetch and print notices only. They do not write to Postgres, upload to
R2, or call Gemini.

## Adding A Department

Add the backend department code and display name in
`lib/scraper/departments.ts`, then run the seed script again:

```bash
npm run db:seed
```

The scraper uses URLs in this form:

```text
https://webbackend.daffodilvarsity.edu.bd/department/{code}/notice
https://webbackend.daffodilvarsity.edu.bd/department/{code}/notice-detail/{id}
```

## Scheduling

`vercel.json` currently defines a once-daily Vercel Cron run:

```json
{ "path": "/api/cron/scrape", "schedule": "0 6 * * *" }
```

For checks more frequent than once per day on Vercel Hobby, use a GitHub Actions
scheduled workflow that calls `/api/cron/scrape` with the same bearer token.
