# Oxylabs Scheduler + Vercel Cron (automatic hourly pipeline)

## Goal

Implement the Oxylabs Scheduler integration and the automatic hourly pipeline described in AGENTS.md §18. Deliver **all parts together**:

1. **Sync schedules route** — `POST /api/oxylabs/schedules`: creates one Oxylabs schedule per active source homepage, stores them in `oxylabs_schedules`, and deactivates orphaned Oxylabs schedules.
2. **List schedules route** — `GET /api/oxylabs/schedules`: reads stored schedule rows.
3. **Runs status route** — `GET /api/oxylabs/runs`: reads stored run rows.
4. **Manual process route** — `POST /api/oxylabs/scheduled-results/process`: on-demand processing of completed scheduled results through the scrape-to-insert pipeline.
5. **Cron pipeline route** — `GET /api/cron/pipeline`: chains scheduled-result processing → AI analysis, protected by `CRON_SECRET`.
6. **Vercel Cron config** — `vercel.json` registering the automatic hourly trigger at `:15`.

## Skills read

- `.claude/skills/oxylabs-web-scraper` (SKILL.md) — Web Scraper API auth, endpoints, `universal`/`render:html`.
- `.claude/skills/supabase` (SKILL.md) — RLS model, service-role usage, joined-table filter gotcha.
- Live Oxylabs Scheduler docs fetched from `https://developers.oxylabs.io/products/web-scraper-api/features/scheduler` (per §18 — do not assume from memory).

## Live Scheduler API facts (from the docs — verify again at implementation time)

Base host: `https://data.oxylabs.io/v1`. HTTP Basic Auth with `OXY_WSA_USERNAME:OXY_WSA_PASSWORD`.

| Action | Method + Path | Body / Notes |
| --- | --- | --- |
| Create schedule | `POST /v1/schedules` | `{ cron, items: [...], end_time }`. Returns `schedule_id` (large int), `active`, `next_run_at`. |
| List schedules | `GET /v1/schedules` | Returns `{ schedules: [<large int ids>] }`. |
| Get schedule | `GET /v1/schedules/{id}` | Status + stats. |
| Get runs | `GET /v1/schedules/{id}/runs` | `{ runs: [{ run_id, jobs: [{ id, result_status, ... }], success_rate }] }`. Use this, NOT `/jobs`. |
| Set state | `PUT /v1/schedules/{id}/state` | `{ "active": false }`. 202, empty body. |
| Fetch a job's result | `GET /v1/queries/{job_id}/results` | Returns `{ results: [{ content, status_code, url }] }` — same shape as the manual scraper. Confirm this exact path against the docs before coding. |

`items` per schedule = a single job matching the manual scraper's request so scheduled HTML is comparable:
```json
{ "source": "universal", "url": "<source.listing_url>", "render": "html" }
```
`cron` for schedules: `"0 * * * *"` (top of every hour). `end_time`: a far-future timestamp in `YYYY-MM-DD HH:MM:SS` format (e.g. `"2035-12-31 23:59:59"`).

### Large-integer precision — CRITICAL (§18)

`schedule_id` and job `id` are 64-bit integers exceeding `Number.MAX_SAFE_INTEGER`. `JSON.parse` silently corrupts them.

- After **create**, read `schedule_id` from the raw response **text** via regex (`/"schedule_id"\s*:\s*(\d+)/`) before any `JSON.parse`. Store the exact digit string in `oxylabs_schedules.oxylabs_schedule_id`.
- From **`GET /schedules`**, extract the id list from raw text (`/"schedules"\s*:\s*\[([^\]]*)\]/` then match `\d+`), not parsed numbers.
- From **`GET /runs`**, extract each job block from raw text and within each capture `"id":(\d+)` and `"result_status":"([^"]+)"`. Job objects are flat, so a per-`{...}`-block regex preserves both the exact id string and its status together. Never take a job `id` from `JSON.parse`.
- Never convert a parsed JS number back to string — precision is already lost at parse time.

## Existing code inspected

- `lib/pipeline/scrape.ts` — `runScrapePipeline({ options, getHomepageHtml, getDetailHtml })`. `getHomepageHtml: (source) => Promise<string>` defaults to live Oxylabs; `getDetailHtml` defaults to live. **Reuse this unchanged** — the scheduler only overrides `getHomepageHtml`.
- `lib/pipeline/oxylabs.ts` — `fetchHtml(url)` client (Basic Auth from `OXY_WSA_*`, 180s timeout, `results[0].content` extraction). Mirror its auth/error style in the new scheduler client.
- `lib/pipeline/sources.ts` — `loadSelectedSources(admin, { sources })` matches active sources by name/listing_url.
- `lib/pipeline/analyze.ts` — `runAnalysisPipeline(options)`. **Reuse unchanged** for cron step two.
- `lib/pipeline/admin-auth.ts` — `hasValidAdminSecret(request)` for the `x-biasly-admin-secret` guard.
- `lib/pipeline/logger.ts` — `createRunLogger` / `createAnalysisLogger` (console + `logs` table + summary object). Reuse the scrape logger's summary via the pipeline.
- `lib/supabase/admin.ts` — `createSupabaseAdminClient()` (service role).
- `lib/supabase/types.ts` — `OxylabsSchedule`, `OxylabsScheduleRun` already defined.
- `supabase/schema.sql` — `oxylabs_schedules` (`oxylabs_schedule_id text`) and `oxylabs_schedule_runs` (`oxylabs_job_id text`, `result_status text`) already exist with RLS enabled + no public policy. **No schema change needed.**
- `app/api/scrape/route.ts`, `app/api/analyze/route.ts` — thin-handler pattern (auth → parse → delegate → PostHog → JSON summary) to mirror.

## Decisions / assumptions

- **No schema migration required** — the two scheduler tables and TS types already match §7/§18. If implementation reveals a gap, stop and flag it (do not silently alter schema).
- One Oxylabs schedule per active source (1 item = that source's homepage). Clean 1:1 lets processed job HTML map back to its source.
- **Sync route** creates schedules idempotently: for each active source without a live stored schedule row, create one and insert a row. Then run **orphan deactivation** (§18): `GET /v1/schedules`, diff against `oxylabs_schedule_id` values in the DB, `PUT .../state {active:false}` for any Oxylabs id not in the DB.
- **Processing** iterates stored active schedule rows; for each: `GET /runs`, take the most recent run's jobs with `result_status === 'done'`, fetch each done job's result HTML, record a `oxylabs_schedule_runs` row per job (status), and collect a `Map<source_id, html>`. Then call `runScrapePipeline` with `options.sources` = the names of sources that produced fresh HTML and a `getHomepageHtml` that returns the map entry (throws if missing). `getDetailHtml` stays live (default) — detail pages are always scraped live (§18).
- **Cron route** (`GET /api/cron/pipeline`): step one = process scheduled results; step two = `runAnalysisPipeline({})`. Step two **always runs even if step one throws** (§18 — pre-existing unanalyzed articles). Protected by `CRON_SECRET`; in local dev (`NODE_ENV !== 'production'` or `CRON_SECRET` unset) skip the check so it can be tested manually. Do NOT use `BIASLY_ADMIN_SECRET` here. Do NOT add `CRON_SECRET` to `.env.local`.
- **Route methods** (§14): schedules create + process = `POST` (with `x-biasly-admin-secret`); schedules list + runs list = `GET`; cron = `GET` (Vercel Cron sends GET), `CRON_SECRET`-protected.
- Vercel Cron: `{ "crons": [{ "path": "/api/cron/pipeline", "schedule": "15 * * * *" }] }`. Note in test steps that Vercel Hobby limits cron to once/day; hourly needs Pro.

## Files likely to change / add

- `lib/pipeline/oxylabs-scheduler.ts` (new) — Scheduler API client: `createSchedule`, `listOxylabsScheduleIds`, `getScheduleRuns` (raw-text id/status extraction), `fetchJobResultHtml`, `setScheduleState`. Precision-safe throughout. `server-only`.
- `lib/pipeline/scheduler.ts` (new) — orchestration: `syncSchedules(admin)`, `processScheduledResults(admin)` → `ScrapeSummary`, plus the `oxylabs_schedule_runs` recording. Reuses `runScrapePipeline`.
- `app/api/oxylabs/schedules/route.ts` (new) — `POST` (sync) + `GET` (list).
- `app/api/oxylabs/runs/route.ts` (new) — `GET` (list stored runs).
- `app/api/oxylabs/scheduled-results/process/route.ts` (new) — `POST` (manual process).
- `app/api/cron/pipeline/route.ts` (new) — `GET` (process → analyze).
- `vercel.json` (new) — cron registration.
- `lib/pipeline/scheduler-types.ts` (new, if needed) — sync/process summary shapes.
- `.env.example` — no new vars (all scheduler vars already present); confirm `CRON_SECRET` comment stays accurate.

## Implementation requirements

- TypeScript, small typed functions, `server-only` on every server module, no `any`, thin route handlers.
- Scheduler client mirrors `oxylabs.ts`: Basic Auth from `OXY_WSA_*`, `AbortController` timeout, explicit error messages.
- All large IDs stored/handled as strings; extraction from raw response text via regex before any parse.
- Reuse `runScrapePipeline` and `runAnalysisPipeline` — **do not duplicate** validation, cleanup, dedupe, URL-existence-check, or run-logging logic (§18).
- Processing must not save raw homepage results as articles; only the pipeline inserts, after validation.
- Record one `oxylabs_schedule_runs` row per job processed (`schedule_id` = local uuid, `oxylabs_job_id`, `result_status`).
- Cron: reject missing/wrong `CRON_SECRET` with `401` in production; skip check in dev. Log progress + completion for both steps.
- Action routes return the pipeline summary object as JSON; mirror the PostHog capture pattern from existing routes (optional but consistent).

## Security requirements (§15, §21)

- `POST /api/oxylabs/schedules` and `POST /api/oxylabs/scheduled-results/process` require `x-biasly-admin-secret`; reject missing/invalid with `401`. Never via query string.
- `GET /api/cron/pipeline` protected only by `CRON_SECRET` (Vercel-injected), never callable by browsers/users; never protected by the admin secret.
- Oxylabs credentials, service-role key, OpenAI key never reach browser code; all new modules are `server-only`. No Oxylabs/OpenAI/scrape/analysis calls from client code.
- Node runtime on every new route (`export const runtime = "nodejs"`); never Edge.

## Acceptance criteria

- `POST /api/oxylabs/schedules` creates one Oxylabs schedule per active source, stores exact string ids, deactivates orphans, returns a summary (created/existing/deactivated counts).
- `GET /api/oxylabs/schedules` returns stored schedule rows; `GET /api/oxylabs/runs` returns stored run rows.
- `POST /api/oxylabs/scheduled-results/process` processes only `result_status === 'done'` jobs, runs the pipeline on scheduled homepage HTML, inserts only valid new articles, records run rows, and returns a `ScrapeSummary`.
- `GET /api/cron/pipeline` runs process→analyze, runs analysis even if processing throws, is `401` without the right `CRON_SECRET` in production, and is testable locally without the secret.
- `vercel.json` registers `/api/cron/pipeline` at `15 * * * *`.
- No large-integer id is ever passed through `JSON.parse`.
- `npm run typecheck` and `npm run lint` pass; `npm run build` passes (new routes).

## Checks to run

- `npm run typecheck`
- `npm run lint`
- `npm run build` (routes added)

## Manual test steps (share after implementation)

Watch the `npm run dev` terminal for `[scrape]` / `[analyze]` logs. Env: `OXY_WSA_*`, Supabase keys, `BIASLY_ADMIN_SECRET`, `OPENAI_API_KEY` set in `.env.local`. Do not set `CRON_SECRET` locally.

```bash
# 1. Create Oxylabs schedules (one per active source) + deactivate orphans
curl -X POST http://localhost:3000/api/oxylabs/schedules \
  -H "x-biasly-admin-secret: $BIASLY_ADMIN_SECRET"

# 2. List stored schedule rows
curl http://localhost:3000/api/oxylabs/schedules

# 3. (after Oxylabs has run at least once, ~top of the hour) Process done results
curl -X POST http://localhost:3000/api/oxylabs/scheduled-results/process \
  -H "x-biasly-admin-secret: $BIASLY_ADMIN_SECRET"

# 4. List stored run rows
curl http://localhost:3000/api/oxylabs/runs

# 5. Run the full automatic pipeline locally (no CRON_SECRET needed in dev)
curl http://localhost:3000/api/cron/pipeline

# 6. Auth negative test — should 401
curl -X POST http://localhost:3000/api/oxylabs/scheduled-results/process
```

Note: two one-time setups (§18) — creating Oxylabs schedules (step 1) and deploying `vercel.json` so Vercel Cron calls `/api/cron/pipeline` at `:15`. Neither triggers the other; both are required for full automation. Vercel Hobby allows only daily cron — hourly needs Pro.
