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

3. Fill `.env.local` with Neon/Postgres, Gemini, and R2 values.

4. Run migrations and seed departments:

```bash
npm run db:migrate
npm run db:seed
```

5. Start the app:

```bash
npm run dev
```

The dashboard is available at `/dashboard`. The scraper endpoint is public at
`/api/cron/scrape` and can be triggered directly by cron or a manual request.

## Production Deploy

Set these environment variables in Vercel before publishing:

- `NEON_DATABASE_URL`
- `GEMINI_API_KEY`
- `GEMINI_MODEL`
- `R2_ACCOUNT_ID`
- `R2_ACCESS_KEY_ID`
- `R2_SECRET_ACCESS_KEY`
- `R2_BUCKET_NAME`
- `R2_PUBLIC_URL_BASE`
- `SCRAPER_USER_AGENT`
- `PIPELINE_MAX_NEW_PER_DEPARTMENT`
- `PIPELINE_INTER_REQUEST_DELAY_MS`

Then apply the existing migration and seed departments against the production
database:

```bash
npx prisma migrate deploy
npm run db:seed
```

Run one real scrape to populate the dashboard:

```bash
npm run scrape:run
```

`PIPELINE_MAX_NEW_PER_DEPARTMENT` defaults to `2` so cron runs stay short on
hosted/serverless deployments. Increase it later if your plan allows longer
background execution.

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
scheduled workflow that calls `/api/cron/scrape` directly.

The included GitHub Actions workflow needs this repository secret:

- `DEPLOY_URL` - your public deployment URL, for example
  `https://your-project.vercel.app`

# scrapper
