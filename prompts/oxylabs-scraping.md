# Oxylabs Manual Scraping Pipeline

## Goal

Implement biasly's **manual scrape-to-insert pipeline** (AGENTS.md §9–§16): a `POST /api/scrape`
action route that, for the selected active sources, fetches each source homepage live through the
Oxylabs Web Scraper API, extracts real article links from homepage story cards, rejects
non-article URLs, dedupes against Supabase, scrapes only article detail pages, validates and cleans
them, and inserts only valid articles (append-only) — returning the §9 run-summary object and
writing neat console + `logs`-table run logging throughout.

**In scope:** the manual scraping pipeline only, plus the read routes that make it testable
(`GET /api/sources`, `GET /api/logs`).

**Out of scope (separate prompts):** Oxylabs Scheduler + Vercel Cron (§18), AI analysis `POST /api/analyze`
(§19), pgvector / related articles (§20). Inserted articles will have `analyzed_at = null` and won't
appear on the home feed until the analysis prompt runs — this is expected and called out in the test steps.

## Skills read

- `.agents/skills/oxylabs-web-scraper/SKILL.md` — Realtime endpoint `POST https://realtime.oxylabs.io/v1/queries`,
  HTTP Basic Auth with `OXY_WSA_USERNAME`/`OXY_WSA_PASSWORD`, `source: "universal"` + `url` for arbitrary pages,
  `render: "html"` for JS-heavy pages, response shape `{ results: [{ content, status_code, url }] }`,
  ~180s client timeout for rendered requests.
- `.agents/skills/supabase/SKILL.md` — service-role client bypasses RLS for pipeline writes, never in client code;
  joined-filter gotcha (§21); RLS model already applied; verify work after implementing.
- AGENTS.md §5 (layer separation), §7 (article required fields), §8 (source selection), §9 (canonical
  scrape-to-insert pipeline + shared rules: URL existence check, article content gate, run logging,
  non-article reject list), §10–§13 (storage/link-extraction/candidate-filter/validation-cleanup rules),
  §14 (POST for actions), §15 (`x-biasly-admin-secret`), §16 (manual scraping behavior), §17 (test output),
  §21 (security + joined-filter gotcha), §22 (checks).
- `node_modules/next/dist/docs/01-app/01-getting-started/15-route-handlers.md` — Next 16 route handler
  convention: `app/api/<name>/route.ts`, `export async function POST/GET(request: Request)`, `Response.json`,
  not cached by default.

## Existing code inspected

- `supabase/schema.sql` — `sources`, `articles`, `article_analyses`, `logs`, `oxylabs_schedules`,
  `oxylabs_schedule_runs` all exist with RLS. `articles.original_url` is `unique` (dedupe key);
  `image_url` and `published_at` are `NOT NULL`; `logs` has `level, event, message, context jsonb`.
- `lib/supabase/admin.ts` — `createSupabaseAdminClient()`, `import "server-only"`, service-role. **Use this for
  all pipeline reads/writes.**
- `lib/supabase/server.ts` / `client.ts` — anon read clients (not used by the pipeline).
- `lib/supabase/queries/sources.ts` — `getActiveSources()` (anon client). The pipeline needs source
  selection via the **admin** client, so add a pipeline-side source loader rather than reuse this.
- `lib/supabase/types.ts` — `Source`, `Article` row types to reuse.
- `seed.sql` — active sources: Reuters `https://www.reuters.com/`, NPR `https://www.npr.org/`,
  BBC News `https://www.bbc.com/news`, Fox News `https://www.foxnews.com/`, The Guardian `https://www.theguardian.com/us`.
- `package.json` — `zod` present, **`cheerio` NOT installed**. Next `16.2.10`, React `19`.
- `.env.example` — `OXY_WSA_USERNAME`, `OXY_WSA_PASSWORD`, `BIASLY_ADMIN_SECRET` already listed.
- No `app/api/` directory yet.

## Decisions / assumptions

1. **Manual pipeline only.** Scheduler, AI analysis, and pgvector are deferred to their own prompts
   (matches AGENTS §16 vs §18/§19/§20). If you want the scheduler bundled, say so at approval.
2. **Oxylabs source = `universal` with `render: "html"`** via the Realtime endpoint for both homepage and
   detail fetches — biasly's sources are news sites, not a supported structured target, and are JS-heavy.
   HTTP Basic Auth from `OXY_WSA_USERNAME`/`OXY_WSA_PASSWORD`. Per-request client timeout ~180s (AbortController).
3. **Cheerio for parsing.** Add `cheerio` (pinned) + commit the lockfile (Supabase skill dependency-pinning
   rule applies project-wide). Homepage link extraction and detail cleanup both use Cheerio server-side.
4. **Service-role client for the whole pipeline** (`lib/supabase/admin.ts`). It bypasses RLS so it can read
   sources, run the URL existence check, and insert articles. Never reached from browser code.
5. **Source selection (§8).** Request body may include `{ sources?: string[], perSource?: number }`.
   `sources` matches active sources by `name` (case-insensitive) or `listing_url`. Default = all active
   sources; default `perSource = 5` valid articles per source. Loaded live from Supabase — no hardcoded URLs.
6. **Generic + source-specific extraction.** A generic homepage extractor (anchors inside story-card-like
   containers, absolute-URL normalization, same-registrable-domain filter) plus a small per-source
   `parser_strategy` hook keyed off `sources.parser_strategy`. Reuters/NPR/BBC/Fox/Guardian use documented
   URL-shape heuristics (§11 examples) to keep candidates to real article detail URLs. Unknown sources fall
   back to the generic extractor + the shared candidate filter.
7. **Reject before detail scrape (§9 step 4, §12).** A shared non-article reject list + candidate URL check
   drop category/section/topic/author/search/nav/show/live/game/product/corporate/newsletter/video-only URLs
   using URL-path heuristics, before spending an Oxylabs detail request.
8. **URL existence check (§9).** Chunk candidate URLs and never pass more than **15** to a single `.in()`.
   Check both `original_url` and `canonical_url` existence; skip already-stored URLs.
9. **Article content gate + cleanup (§13).** Save only with meaningful body (≥3 paragraphs **or** ≥900 clean
   chars) + image URL + published date + article-specific URL + non-generic title. Strip scripts/styles/ads/
   newsletter/subscription/related/most-viewed/social/nav/CSS dumps before saving `raw_text`. Extract
   `image_url` (og:image → article img fallback) and `published_at` (article:published_time / `<time>` /
   JSON-LD). If image or date missing → reject (do not save).
10. **Append-only inserts (§10).** Insert one row at a time (or a small batch) tolerating unique-violation
    races on `original_url`; never delete/replace existing articles. `analyzed_at` stays null.
11. **Run logging (§9).** Neat server-side `console` messages at each stage + a final summary object, and
    persist key events/summary to the `logs` table via a small logger. API response returns the same summary.
12. **Admin secret (§15).** `POST /api/scrape` requires header `x-biasly-admin-secret` === `BIASLY_ADMIN_SECRET`;
    missing/invalid → `401`. Never in query string or browser code.
13. **Runtime.** Route handlers run on the Node.js runtime (Cheerio + service-role need Node, not Edge). Set
    `export const runtime = "nodejs"` and `export const maxDuration` high enough for multi-source scrapes;
    `export const dynamic = "force-dynamic"`.

## Files to create / change

**Create — pipeline library (`lib/pipeline/`, server-only):**
- `lib/pipeline/oxylabs.ts` — `fetchHtml(url)`: Oxylabs Realtime `universal` + `render:"html"` call, Basic Auth,
  timeout, returns `{ html, statusCode, finalUrl }`; throws typed errors on non-200.
- `lib/pipeline/reject-list.ts` — canonical non-article reject list (§9) + `isNonArticleUrl(url)`.
- `lib/pipeline/extract-links.ts` — `extractCandidateLinks(html, source)`: homepage story-card links,
  normalize to absolute, dedupe, same-domain filter, generic + `parser_strategy` hooks (§11).
- `lib/pipeline/candidate-filter.ts` — `isLikelyArticleUrl(url, source)` (§12) using the reject list +
  article-shape heuristics; stricter-choice-on-uncertainty.
- `lib/pipeline/parse-article.ts` — `parseArticle(html, url, source)`: Cheerio cleanup, title, image URL,
  published date, paragraph/body extraction + the §13 content gate; returns a validated candidate or a
  typed rejection reason.
- `lib/pipeline/validate.ts` — Zod schema for the article insert shape; `raw_text` cleanup helpers.
- `lib/pipeline/logger.ts` — `createRunLogger()`: console logging + `logs`-table persistence (service role) +
  running counters, `.summary()` returns the §9 summary object.
- `lib/pipeline/sources.ts` — `loadSelectedSources(admin, { sources?, perSource? })` via service-role client.
- `lib/pipeline/scrape.ts` — `runScrapePipeline(options)`: orchestrates §9 steps 1–9; reused later by the
  scheduler prompt (keep trigger-agnostic: accept a `getHomepageHtml` strategy so §18 can pass job HTML).
- `lib/pipeline/types.ts` — `ScrapeOptions`, `ScrapeSummary`, `Candidate`, `RejectionReason`.

**Create — routes:**
- `app/api/scrape/route.ts` — `POST`, admin-secret guard, parse body, call `runScrapePipeline`, return summary.
- `app/api/sources/route.ts` — `GET`, list active sources (read; no secret) for §8 selection/testing.
- `app/api/logs/route.ts` — `GET`, recent `logs` rows (read; no secret) for observing runs.

**Change:**
- `package.json` / `package-lock.json` — add pinned `cheerio`.
- `.env.example` — already has the needed vars; add a comment only if a new var is introduced (none expected).

**Do not touch:** `supabase/schema.sql` (schema already supports this), `lib/supabase/*` clients, the UI, mock files.

## Implementation requirements

- Follow the §9 canonical pipeline order exactly: load sources → get homepage HTML (live Oxylabs here) →
  extract candidates → reject non-articles → normalize/dedupe → URL existence check → scrape detail pages →
  validate + clean → append-only insert → run logging + summary.
- Keep layers separate (§5): routes are thin (auth + parse + call + respond); all scraping/parsing/DB logic
  lives in `lib/pipeline/*`. No business logic in route files; no UI imports.
- Stop scraping a source once `perSource` valid articles are inserted (better fewer good than many bad, §16).
- Every network + parse step wrapped in try/catch; per-source errors logged and do not abort the whole run.
- Explicit TypeScript types, no `any`; centralize limits (per-source default, `.in()` chunk size = 15,
  timeouts) as named constants.
- `raw_text` must read like one article after cleanup (§13), not a page dump.

## Security requirements (§15, §21)

- `POST /api/scrape` rejects missing/invalid `x-biasly-admin-secret` with `401`; secret only from
  `BIASLY_ADMIN_SECRET` env, never in URL or browser.
- Oxylabs credentials, service-role key used only in server-only `lib/pipeline/*` / `lib/supabase/admin.ts`;
  never `NEXT_PUBLIC_`, never shipped to the client.
- No scraping/Oxylabs/DB-write code path reachable from client components.
- Node.js runtime for the routes; pin `cheerio` and commit the lockfile.

## Acceptance criteria

- `POST /api/scrape` with a valid secret runs the full pipeline, inserts only valid article detail pages
  (never a homepage/listing/category page), skips duplicates, and returns the §9 summary object
  (status, sources checked, candidates found/rejected, duplicates skipped, detail pages scraped, articles
  inserted/rejected/failed, total duration, rejection reasons grouped by count).
- Missing/invalid secret → `401`; no work done.
- Re-running immediately inserts ~0 new articles (dedupe via URL existence check + unique constraint).
- Console shows neat per-stage logs; `logs` table has run rows; `GET /api/logs` returns them.
- `GET /api/sources` lists active sources for selection.
- No service-role key / Oxylabs creds outside server-only modules (grep clean).
- `npm run typecheck`, `npm run lint`, and `npm run build` pass (routes + server modules added).

## Checks to run

- `npm run typecheck`
- `npm run lint`
- `npm run build`

## Manual test steps

1. Confirm `.env.local` has `OXY_WSA_USERNAME`, `OXY_WSA_PASSWORD`, `SUPABASE_SERVICE_ROLE_KEY`,
   `BIASLY_ADMIN_SECRET`, and the Supabase URL/anon vars.
2. `npm run dev` and watch the dev terminal (scrape progress logs there — §17).
3. List sources:
   ```bash
   curl http://localhost:3000/api/sources
   ```
4. Scrape 2 sources, 3 articles each (adjust names to seeded sources):
   ```bash
   curl -X POST http://localhost:3000/api/scrape \
     -H "content-type: application/json" \
     -H "x-biasly-admin-secret: <BIASLY_ADMIN_SECRET>" \
     -d '{"sources":["Reuters","NPR"],"perSource":3}'
   ```
   Expect a JSON summary; watch per-stage logs in the dev terminal.
5. Default run (all active sources, 5 each):
   ```bash
   curl -X POST http://localhost:3000/api/scrape \
     -H "content-type: application/json" \
     -H "x-biasly-admin-secret: <BIASLY_ADMIN_SECRET>" -d '{}'
   ```
6. Re-run step 5 immediately → `articlesInserted` ~0, `duplicatesSkipped` high (dedupe works).
7. Missing secret → `401`:
   ```bash
   curl -i -X POST http://localhost:3000/api/scrape -H "content-type: application/json" -d '{}'
   ```
8. Inspect run logs:
   ```bash
   curl http://localhost:3000/api/logs
   ```
9. In Supabase → Table Editor → `articles`: new rows are real article detail pages with `title`,
   `image_url`, `published_at`, cleaned `raw_text`, `analyzed_at = null`. No homepage/category rows.
10. Note: inserted articles won't show on the home feed until the AI-analysis prompt (§19) sets analysis —
    expected at this stage.
11. `grep -riE "SERVICE_ROLE|OXY_WSA" lib app` → only server-only `lib/**` matches; no route/UI leakage.
