# Supabase Database & Data Access

## Goal

Stand up biasly's Supabase data layer and make the site read from it instead of mock arrays:

1. A canonical SQL schema (`supabase/schema.sql`) for the core tables from AGENTS.md §7 — `sources`, `articles`, `article_analyses`, `logs`, `oxylabs_schedules`, `oxylabs_schedule_runs` — **without** the pgvector `embedding` column (§20 adds it later).
2. Typed, server-safe Supabase clients (anon read client + service-role admin client) and DB types.
3. Data-access query functions that the UI calls.
4. Wire the home page and article details page to render stored data (decision: "data layer + wire UI"), with empty states so the pages don't break while the DB has no analyzed articles yet.

Scope is the **database + data access layer only**. No scraping, no AI analysis, no scheduler, no cron — those are separate prompts. pgvector / related articles is explicitly out (deferred to §20).

## Skills read

- `.agents/skills/supabase/SKILL.md` — RLS-in-exposed-schemas rule, service-role never in client code, security checklist, "verify your work", schema-change workflow.
- AGENTS.md §5 (architecture layers), §7 (source of truth + table fields), §8 (active source selection), §19 (analysis fields the UI must show), §20 (embedding deferred), §21 (env vars + service-role/secret exposure rules).

## Existing code inspected

- `package.json` — Next.js `16.2.10`, React `19.2.4`. **`@supabase/supabase-js` is NOT installed.** Clerk is present (auth is Clerk, not Supabase Auth).
- `.env.local` — has `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` (a `sb_publishable_…` key), and `NEXT_SERVICE_ROLE_KEY` (a `sb_secret_…` key). No `.env.example` exists.
- `lib/` — only `mock-articles.ts`, `mock-article-details.ts`, `utils.ts`. No `lib/supabase/`. No `supabase/` dir.
- `app/page.tsx` — server component; maps `mockArticles` → `<NewsCard>` inside `<Link href={/article/${id}}>`. NewsCard props: `imageUrl, category, region, title, leftPercentage, centerPercentage, rightPercentage, sourcesCount`.
- `app/article/[id]/page.tsx` — async server component; looks up `mockArticleDetails[id]` (slug key). Renders title, category/region, author/date/readTime, hero image + caption, Bias Distribution, body paragraphs, Related Stories, Bias Analysis (overall bias + L/C/R rows + framing note), AI Summary (generated date + bullets), Source Breakdown (`totalSources`, per-bias source counts, `topSources` list).
- Components take fixed props (`components/ui/news-card.tsx`, `bias-meter.tsx`) — the mapping must feed them, not redesign them.

## Decisions / assumptions

1. **Env var rename (confirmed).** Rename `NEXT_SERVICE_ROLE_KEY` → `SUPABASE_SERVICE_ROLE_KEY` in `.env.local` to match AGENTS.md §21. Create `.env.example` as the canonical documented list. Do not print secret values in output.
2. **Client library: `@supabase/supabase-js` only — not `@supabase/ssr`.** `@supabase/ssr` exists to manage Supabase Auth session cookies; biasly uses Clerk for auth and Supabase only for data, so cookie-based SSR sessions are unnecessary. Pin the installed version and commit the lockfile (skill dependency-security rule).
3. **Two clients, both server-side in practice.**
   - `lib/supabase/server.ts` — anon/publishable-key client for **public reads** (relies on public-read RLS). Used by the pages.
   - `lib/supabase/admin.ts` — **service-role** client, `import "server-only"` guarded, for writes and privileged pipeline reads (used by later prompts). Never imported by client components.
   - A minimal `lib/supabase/client.ts` browser client (anon key) is included for completeness but the UI reads happen in server components via `server.ts`.
4. **RLS model.** Enable RLS on every table (exposed `public` schema). Public content tables — `sources`, `articles`, `article_analyses` — get a `SELECT` policy `TO anon, authenticated`. Operational tables — `logs`, `oxylabs_schedules`, `oxylabs_schedule_runs` — get **no public policy** (RLS on, no policy = deny to anon/authenticated; the service-role client bypasses RLS for the pipeline). No `user_metadata`/`auth.uid()` ownership predicates — this is public, non-user-scoped read data.
5. **Route param = article UUID.** `/article/[id]` uses the `articles.id` UUID. Home cards link with the UUID. (Mock slug ids are dropped.)
6. **Schema/UI shape gap — mapping with fallbacks.** The mock UI assumes multi-source aggregation (`totalSources`, `topSources`, per-source bias, `category`, `region`, `sourcesCount`); the real schema is single-article analysis. We feed the existing components best-fit values and gracefully omit what the DB can't provide, rather than redesigning cards now (a §19-faithful card redesign is a separate UI prompt). Mapping defined below.
7. **Schema is applied by hand in the Supabase SQL Editor**, since the Supabase MCP isn't authenticated in this environment. Deliver `supabase/schema.sql` + run instructions. Keep it idempotent (`create table if not exists`, `create policy` guarded) so re-runs are safe.
8. **Seed active sources** in `supabase/seed.sql` (homepages only, per §7 "DB is source of truth" — this is the correct place for source URLs, not scraping code). Include an optional, clearly-marked demo article + analysis so the wired UI renders end-to-end before the pipeline exists.

## Files to create / change

**Create**
- `supabase/schema.sql` — tables, indexes, RLS enable + policies (no `embedding`).
- `supabase/seed.sql` — active `sources` rows (homepages) + optional demo article/analysis.
- `.env.example` — canonical env list from §21.
- `lib/supabase/types.ts` — hand-written `Database`/row types matching the schema.
- `lib/supabase/server.ts` — anon read client factory.
- `lib/supabase/admin.ts` — service-role client, `server-only`.
- `lib/supabase/client.ts` — browser anon client (completeness).
- `lib/supabase/queries/articles.ts` — `getAnalyzedArticles()`, `getArticleWithAnalysis(id)`.
- `lib/supabase/queries/sources.ts` — `getActiveSources()`.
- `lib/supabase/mappers.ts` — DB row → component-prop mappers (keeps UI/data separated per §5).

**Change**
- `package.json` / `package-lock.json` — add pinned `@supabase/supabase-js`.
- `.env.local` — rename the service-role var only (leave URL/anon untouched).
- `app/page.tsx` — read `getAnalyzedArticles()`, map to `<NewsCard>`, empty state.
- `app/article/[id]/page.tsx` — read `getArticleWithAnalysis(id)`, map, `notFound()` on miss.

**Do not touch** `lib/mock-*.ts` yet (leave as reference until the pipeline produces real data; they can be deleted in a cleanup pass). Do not add the `embedding` column, `getRelatedArticles`, any API route, or scraping/AI code.

## Schema requirements (`supabase/schema.sql`)

Idempotent SQL. Key columns (types per §7):

- `sources`: `id uuid pk default gen_random_uuid()`, `name text not null`, `listing_url text not null unique`, `parser_strategy text`, `active boolean not null default true`, `logo_url text`, `created_at timestamptz default now()`.
- `articles`: `id uuid pk`, `source_id uuid references sources(id)`, `original_url text not null unique` (dedupe key), `canonical_url text`, `title text not null`, `image_url text not null`, `published_at timestamptz not null`, `raw_text text`, `scraped_at timestamptz default now()`, `analyzed_at timestamptz` (nullable). Index on `source_id`, `published_at desc`.
- `article_analyses`: `id uuid pk`, `article_id uuid references articles(id) on delete cascade unique`, `summary text`, `sentiment_score numeric`, `sentiment_label text`, `bias_score numeric`, `bias_label text`, `left_percentage numeric`, `center_percentage numeric`, `right_percentage numeric`, `confidence numeric`, `framing_notes text`, `loaded_terms text[]`, `disclaimer text`, `model text`, `created_at timestamptz default now()`. **No `embedding` column** (§20). Optional CHECK constraints: percentages 0–100, scores in range — keep lenient to avoid blocking inserts.
- `logs`: `id uuid pk`, `level text`, `event text`, `message text`, `context jsonb`, `created_at timestamptz default now()`.
- `oxylabs_schedules`: `id uuid pk`, `source_id uuid references sources(id)`, `oxylabs_schedule_id text` (string — large-int precision per §18), `cron text`, `active boolean default true`, `created_at timestamptz default now()`.
- `oxylabs_schedule_runs`: `id uuid pk`, `schedule_id uuid references oxylabs_schedules(id)`, `oxylabs_job_id text`, `result_status text`, `ran_at timestamptz default now()`.

RLS: `alter table … enable row level security` on all six. `create policy "public read" … for select to anon, authenticated using (true)` on `sources`, `articles`, `article_analyses` only. Guard policy creation so re-running the file doesn't error (drop-if-exists then create, or `do $$ … $$` existence check).

## Data-access requirements

- Use the **anon** client (`server.ts`) for the two read queries (public data + RLS). Use `admin.ts` nowhere in this prompt's UI path.
- `getAnalyzedArticles()`: select articles that have an analysis, newest first. Join analysis + source. **Follow the §21 joined-filter gotcha** — do not `.eq('article_analyses.x', …)`; instead select the embedded relation and filter "has analysis" in JS (drop rows whose `article_analyses` is null), or use an inner-join select shape. Return a typed array.
- `getArticleWithAnalysis(id)`: single article by UUID with its analysis + source; return `null` if not found or not analyzed.
- `getActiveSources()`: active sources for §8 (used by later prompts; include now so the layer is complete).
- All query modules are server-only (import the anon client, run in server components). Explicit return types, no `any`.

## DB → component prop mapping (`lib/supabase/mappers.ts`)

Home `<NewsCard>`:
- `imageUrl` ← `articles.image_url`
- `title` ← `articles.title`
- `leftPercentage/centerPercentage/rightPercentage` ← analysis percentages (fallback `0` if null)
- `category` ← analysis `bias_label` (capitalized) — closest available signal
- `region` ← `sources.name`
- `sourcesCount` ← `1` (single-source model); acceptable placeholder until the card is redesigned to §19

Article page:
- title, hero `image_url`, `published_at` (formatted), body from `raw_text` split into paragraphs (on blank lines / newlines; fall back to a single block)
- Bias Distribution + Bias Analysis rows ← analysis L/C/R + `bias_label`; "overall bias" line uses the dominant percentage
- AI Summary ← analysis `summary` (render as text or split bullets), `confidence` shown when present, `disclaimer` as the fine print, `framing_notes` as framing note
- Fields with no DB source (`author`, `imageCaption`, `topSources`, per-source counts, `readTime`, Related Stories) — omit those sub-blocks or show a neutral fallback; **do not fabricate** multi-source data. Note in a comment that Related Stories returns in §20.

## Security requirements (§21 + skill)

- `SUPABASE_SERVICE_ROLE_KEY` used **only** in `lib/supabase/admin.ts`, which starts with `import "server-only"`. Never referenced in client components or any `NEXT_PUBLIC_` context.
- Only `NEXT_PUBLIC_SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_ANON_KEY` reach the browser.
- RLS enabled on all tables; public read limited to the three content tables; operational tables have no anon/authenticated policy.
- Pin `@supabase/supabase-js` and commit `package-lock.json`.
- Do not echo secret values from `.env.local` in any output or commit.

## Acceptance criteria

- `supabase/schema.sql` runs cleanly in the SQL Editor (and re-runs without error); all six tables exist with RLS enabled and the three public-read policies present.
- With `seed.sql` applied, home page renders cards from DB rows; article page renders the seeded demo article with its analysis; unknown id → `notFound()`.
- With **no** analyzed articles, home shows an empty state (not a crash); article page 404s for unknown ids.
- Service-role key appears only in `admin.ts` (grep clean elsewhere); no service-role usage in the UI read path.
- `npm run typecheck` and `npm run lint` pass; `npm run build` passes (server modules + pages changed).

## Checks to run

- `npm run typecheck`
- `npm run lint`
- `npm run build`

## Manual test steps

1. In `.env.local`, confirm the rename to `SUPABASE_SERVICE_ROLE_KEY` (URL + anon unchanged).
2. Supabase Dashboard → SQL Editor → run `supabase/schema.sql`, then `supabase/seed.sql`.
3. `npm run dev`.
4. Open `http://localhost:3000` — cards render from Supabase (seeded article visible; source name + bias label shown). Confirm no service-role/network errors in the dev terminal.
5. Click the seeded card → `/article/<uuid>` renders title, hero image, body, bias distribution/analysis, and AI summary from the analysis row. Blocks with no DB data are cleanly omitted.
6. Visit `/article/does-not-exist` → 404.
7. (Optional) Temporarily point at an empty table / delete seed → home shows the empty state instead of erroring.
8. `grep -ri "SERVICE_ROLE" lib app` → only `lib/supabase/admin.ts` matches.
```
