# AI Article Analysis (`POST /api/analyze`)

## Goal

Implement biasly's **AI article analysis** (AGENTS.md §19): a `POST /api/analyze` action route
that finds valid articles with no analysis yet, runs each through an OpenAI model via the Vercel AI
SDK to produce a neutral summary, sentiment, and AI-estimated political framing, validates the model
output with Zod, and saves it to `article_analyses` — setting `articles.analyzed_at` only after a
valid analysis row is written. Returns a run-summary object and writes neat console + `logs`-table
logging throughout, mirroring the scrape pipeline.

**In scope:** the analysis pipeline + `POST /api/analyze` only. Default behavior analyzes **all**
pending valid articles, in configurable batches, until none remain.

**Out of scope (separate prompts):** pgvector embeddings + Related Articles (§20) — do **not** add an
`embedding` column, do **not** call any embeddings model. Oxylabs Scheduler / Vercel Cron (§18). Card
and details UI redesign (the home feed already renders analyzed articles via existing mappers; once
this route runs, analyzed articles appear automatically).

## Skills read

- `.agents/skills/ai-sdk/SKILL.md` — never write AI SDK code from memory; use the version-matched
  bundled docs in `node_modules/ai/docs/` and `node_modules/@ai-sdk/openai/docs/`. Install `ai` only
  first, then `@ai-sdk/openai`. Prefer structured output (`generateObject`) validated against a Zod
  schema. Verify every API/option against bundled docs/source for the installed version; run the type
  checker after changes. `@ai-sdk/openai` reads `OPENAI_API_KEY` by default.
- `.agents/skills/supabase/SKILL.md` — service-role client bypasses RLS for pipeline writes/reads,
  never in client code; **joined-filter gotcha (§21):** never `.eq('foreignTable.col', v)` — fetch the
  embed and filter in JS; RLS model already applied; verify work after implementing.
- AGENTS.md §5 (layer separation — AI is its own layer; route handlers stay thin), §7 (article_analyses
  fields), §14 (POST for actions), §15 (`x-biasly-admin-secret`), §19 (AI analysis + framing output
  rules + required behavior), §21 (security, env vars, joined-filter gotcha), §22 (checks).

## Existing code inspected

- `supabase/schema.sql` — `article_analyses` already has every §19 column (summary, sentiment_score,
  sentiment_label, bias_score, bias_label, left/center/right_percentage, confidence, framing_notes,
  `loaded_terms text[]`, disclaimer, model) with CHECK constraints for the numeric ranges and a
  `unique` `article_id`. **No `embedding` column** (deferred to §20). `articles.analyzed_at` is
  nullable. No schema change is needed for this prompt.
- `lib/pipeline/scrape.ts` — the orchestrator pattern to mirror: service-role client + `createRunLogger`,
  per-item try/catch, counters, returns a summary object.
- `lib/pipeline/logger.ts` — `createRunLogger(admin)` gives `event()`, `counters`, `incrRejection()`,
  `summary()`. Counters are scrape-shaped; analysis needs its own counters/summary (see below), so a
  small dedicated logger or a light generalization is used rather than forcing scrape counters.
- `lib/pipeline/admin-auth.ts` — `hasValidAdminSecret(request)` guards action routes.
- `lib/supabase/admin.ts` — `createSupabaseAdminClient()` (service role, `NEXT_PUBLIC_SUPABASE_URL` +
  `SUPABASE_SERVICE_ROLE_KEY`).
- `lib/supabase/queries/articles.ts` — established pattern for fetching an `article_analyses` embed and
  normalizing/filtering in JS (used to detect pending articles here).
- `app/api/scrape/route.ts` — thin POST handler pattern: `runtime="nodejs"`, `dynamic="force-dynamic"`,
  `maxDuration`, admin-secret check, JSON body parse, delegate, return summary / 401 / 400 / 500.
- `lib/supabase/types.ts` — `ArticleAnalysis`, `SentimentLabel`, `BiasLabel` types to reuse.
- `package.json` — `ai`, `@ai-sdk/openai`, and `zod` are **not installed** yet.
- `.env.example` / `.env.local` — key is currently misnamed `OPEN_API_KEY` in `.env.local`.

## Decisions and assumptions

- **Provider: OpenAI** (confirmed by the user; matches `.env.example`/`.env.local`, overriding
  AGENTS.md's Anthropic wording for this task). Use `@ai-sdk/openai`. Default model **`gpt-4o-mini`**
  (cheap, structured-output capable) via an `ANALYSIS_MODEL` env override; the exact model ID will be
  confirmed against current OpenAI models during implementation, and the AI SDK API (`generateObject`
  / schema helper) verified against the installed bundled docs — not written from memory.
- **Env var:** the AI SDK OpenAI provider reads `OPENAI_API_KEY`. Fix the typo in `.env.local`
  (`OPEN_API_KEY` → `OPENAI_API_KEY`) and keep `.env.example` as `OPENAI_API_KEY`. No secret is
  committed. (Optional `ANALYSIS_MODEL` documented in `.env.example`.)
- **Pending detection (§19 req 1):** an article is pending when **no `article_analyses` row exists**
  for it — never `analyzed_at IS NULL` alone. Implemented by selecting articles with an
  `article_analyses(id)` embed and keeping rows whose embed is empty (JS filter, per the §21 gotcha),
  ordered oldest-scraped first, paged so full runs continue until none remain.
- **bias_score is derived, not model-provided:** `bias_score = (right_percentage − left_percentage) / 100`,
  computed in code after validation — the model returns only the three percentages + label.
- **Batching:** `ANALYSIS_BATCH_SIZE` env (default 5) controls per-batch size; batching only exists to
  avoid timeouts. Articles processed sequentially within a batch to stay simple and within rate limits.
- **Invalid output handling:** validate model output with Zod; on failure **retry once**; if still
  invalid, count the article as `failed` and skip it — never write partial/invalid analysis, never set
  `analyzed_at`.
- **No `any`; server-only modules; small functions** per §21. AI logic lives in the AI layer, DB writes
  in the pipeline orchestrator, the route stays thin.

## Files likely to change / add

- **add** `lib/ai/analysis-schema.ts` — Zod schema for the model's structured output + a refinement
  enforcing framing rules (percentages are 0–100 and sum to 100 within a small tolerance; label ∈
  {left, center, right, mixed, unclear}); exported inferred type.
- **add** `lib/ai/analyze-article.ts` (`server-only`) — builds the analysis prompt from an article,
  calls the AI SDK `generateObject` with the schema + model, returns the validated object or throws;
  exposes the resolved model name. Verified against bundled AI SDK docs.
- **add** `lib/pipeline/analyze.ts` (`server-only`) — orchestrator: load pending articles (batched),
  call the AI layer, derive `bias_score`, insert the `article_analyses` row, set `analyzed_at`, log
  per-article + per-batch + final summary; loop until no pending remain (or until `limit`/`articleIds`
  scope is exhausted).
- **add** `lib/pipeline/analysis-types.ts` (or extend `lib/pipeline/types.ts`) — `AnalyzeOptions`
  (`limit?`, `articleIds?`, `batchSize?`) and `AnalysisSummary` (status, analyzed, skipped, failed,
  batches, totalDurationMs, plus failure reasons grouped by count).
- **add** `app/api/analyze/route.ts` — thin `POST` handler (admin secret, parse options, delegate,
  return summary), `runtime="nodejs"`, `dynamic="force-dynamic"`, `maxDuration=300`.
- **edit** `.env.local` (rename `OPEN_API_KEY` → `OPENAI_API_KEY`) and `.env.example` (add optional
  `ANALYSIS_MODEL`; keep `OPENAI_API_KEY`).
- **edit** `package.json` / lockfile — add `ai`, `@ai-sdk/openai`, `zod` (pinned).
- Reuse `createRunLogger` if it cleanly generalizes; otherwise add a small analysis-specific logger in
  `lib/pipeline/logger.ts` producing the analysis summary shape. No new UI, no schema SQL.

## Implementation requirements

1. `POST /api/analyze` requires the `x-biasly-admin-secret` header (§15); missing/invalid → `401`.
   Invalid JSON body → `400`; unexpected pipeline error → `500` with a message. Node runtime only.
2. Body options: `{ limit?, articleIds?, batchSize? }`. Default (no options) analyzes **all** pending
   valid articles. `articleIds` restricts to those IDs (still only ones that are pending). `limit`
   caps total analyzed. `batchSize` overrides `ANALYSIS_BATCH_SIZE`. Do **not** hardcode 10, latest
   scrape only, specific sources, or a fixed one-time batch.
3. Pending detection uses the LEFT-JOIN/embed rule above — never `analyzed_at` alone.
4. For each article, call the model with a neutral, framing-aware prompt using **article text only**
   (title + `raw_text`); do not infer framing from the source name. Produce: neutral `summary`,
   `sentiment_score` (−1..1) + `sentiment_label` (positive/neutral/negative), `left/center/right`
   percentages (0–100, sum 100), `politicalFramingLabel` (left/center/right/mixed/unclear, matching the
   strongest percentage unless confidence is low / percentages are close → `unclear`), `confidence`
   (0..1), `framing_notes`, `loaded_terms` (string array), and a `disclaimer` stating framing is
   AI-estimated, not objective truth.
5. Validate with Zod before saving; on invalid output retry once, then mark failed without saving.
6. Save to `article_analyses`: all §19 fields, `bias_score` derived in code, `model` = resolved model
   id. Then set `articles.analyzed_at = now()` — only after the analysis row is saved. Respect the
   `unique(article_id)` constraint (skip/treat as already-analyzed on 23505).
7. Log per-article progress (analyzing / analyzed / skipped / failed), per-batch counts, and a final
   summary object (analyzed, skipped, failed counts + failure reasons grouped by count + duration) to
   both console and the `logs` table, mirroring the scrape logger.

## Security requirements

- Route protected by `x-biasly-admin-secret`; secret only in `BIASLY_ADMIN_SECRET`, never in URL/query,
  never exposed to the browser (§15, §21).
- All AI + DB work is server-only (`import "server-only"` on AI/pipeline modules); `OPENAI_API_KEY` and
  `SUPABASE_SERVICE_ROLE_KEY` never reach client code (§21).
- No model/DB calls from browser code. No new `NEXT_PUBLIC_*` values.

## Acceptance criteria

- `POST /api/analyze` with a valid secret analyzes all pending articles in batches, saves one
  `article_analyses` row per article with all §19 fields, derives `bias_score`, sets `analyzed_at`, and
  returns a summary with analyzed/skipped/failed counts.
- Percentages always sum to 100 and the label follows the strongest-percentage rule (or `unclear` when
  weak/close); invalid model output is retried once then failed, never saved.
- Re-running the route is idempotent: already-analyzed articles are not re-analyzed (no duplicate rows).
- Missing/invalid secret → 401; invalid JSON → 400.
- Analyzed articles appear on the home feed (they now have an analysis row); no `embedding` column or
  embeddings call was added.

## Checks to run

- `npm run typecheck`
- `npm run lint`
- `npm run build` (new route + server modules + new deps → build affected)

## Exact manual test steps

1. Ensure `.env.local` has a real `OPENAI_API_KEY` (renamed from `OPEN_API_KEY`) and `BIASLY_ADMIN_SECRET`.
2. `npm run dev`, and watch the dev-server terminal — analysis progress logs there (§17).
3. (If needed) scrape first so pending articles exist:
   ```bash
   curl -X POST http://localhost:3000/api/scrape \
     -H "x-biasly-admin-secret: <BIASLY_ADMIN_SECRET>" \
     -H "Content-Type: application/json" -d '{}'
   ```
4. Analyze all pending articles:
   ```bash
   curl -X POST http://localhost:3000/api/analyze \
     -H "x-biasly-admin-secret: <BIASLY_ADMIN_SECRET>" \
     -H "Content-Type: application/json" -d '{}'
   ```
   Expect a JSON summary `{ status, analyzed, skipped, failed, batches, ... }`.
5. Optional scoped runs:
   ```bash
   # cap total analyzed
   curl -X POST http://localhost:3000/api/analyze -H "x-biasly-admin-secret: <SECRET>" \
     -H "Content-Type: application/json" -d '{"limit":2}'
   # specific articles
   curl -X POST http://localhost:3000/api/analyze -H "x-biasly-admin-secret: <SECRET>" \
     -H "Content-Type: application/json" -d '{"articleIds":["<uuid>"]}'
   ```
6. Auth check: same call **without** the header → `401`.
7. Idempotency: run step 4 again → previously analyzed articles are skipped, `analyzed=0` (or only new).
8. Verify in Supabase (Dashboard → Table Editor / SQL): each analyzed article has one
   `article_analyses` row with summary, sentiment, percentages summing to 100, `bias_score`, and a
   non-null `analyzed_at`.
9. Load `http://localhost:3000/` → analyzed articles now render on the home feed.
