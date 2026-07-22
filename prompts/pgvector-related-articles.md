# pgvector embeddings + Related Articles (AGENTS.md §20)

## Goal

Implement AGENTS.md §20 on top of the working §19 AI analysis pipeline:

1. Enable pgvector and add an `embedding vector(1536)` column + IVFFlat cosine index to `article_analyses`.
2. Extend the AI analysis pipeline (`POST /api/analyze`) to also generate an OpenAI `text-embedding-3-small` embedding for each article and save it, setting `analyzed_at` only after **both** analysis and embedding are saved.
3. Backfill embeddings for already-analyzed articles whose `article_analyses` row has `embedding IS NULL`, without re-running the full analysis.
4. Add `getRelatedArticles(articleId, embedding)` and a Related Articles section (up to 5, cosine similarity) to the news details page.

Keep it minimal. Do not overbuild, do not refactor unrelated code.

## Skills read

- `supabase` (SKILL.md) — RLS on exposed tables, pgvector, security checklist, manual SQL apply.
- `ai-sdk` (SKILL.md) — verified `embed` against bundled `node_modules/ai@7.0.32` docs (`embeddings.mdx`). API: `embed({ model, value, abortSignal, maxRetries })` → `{ embedding: number[] }`. Provider method `provider.embeddingModel('text-embedding-3-small')` (1536 dims).

## Existing code inspected

- `supabase/schema.sql` — `article_analyses` defined, no `embedding` column yet (deferred to §20 per the header comment). RLS enabled; `article_analyses` has a public-read policy.
- `lib/supabase/types.ts` — hand-written types; `ArticleAnalysis` has no `embedding`; `ArticleWithAnalysis` join shape.
- `lib/supabase/queries/articles.ts` — `getAnalyzedArticles` (home feed) and `getArticleWithAnalysis` (detail), both via the **anon** `createSupabaseServerClient`, shared `SELECT` constant, JS-side normalization of joined arrays.
- `lib/supabase/admin.ts` / `server.ts` — service-role vs anon clients.
- `lib/ai/analyze-article.ts` — builds the OpenAI provider once (proxied via `OPENAI_PROXY_URL` when set), `resolveModelName()`, timeout + `maxRetries: 1`.
- `lib/ai/analysis-schema.ts` — Zod schema + `normalizeFraming`.
- `lib/pipeline/analyze.ts` — orchestrator: `getPendingArticleIds` (pending = **no** `article_analyses` row, JS-filtered), batched, `saveAnalysis` inserts then sets `analyzed_at`, `runAnalysisPipeline`.
- `lib/pipeline/analysis-types.ts` — `AnalyzeOptions`, `AnalysisSummary`.
- `app/article/[id]/page.tsx` — server component detail page; renders bias panels + AI summary in a right `aside`.
- No `app/api/cron/pipeline` route exists yet (§18 not implemented), so `/api/analyze` is the only analysis entry point to touch.

## Decisions / assumptions

- **Manual SQL apply.** Per project practice (no Supabase MCP/CLI wired up), all DDL is applied by the user in Supabase Dashboard → SQL Editor. I provide idempotent SQL; I update `supabase/schema.sql` and `lib/supabase/types.ts` to match. I cannot run the migration for you.
- **§20 backfill needs an explicit pass.** §20 says articles with an analysis row but `embedding IS NULL` should be "picked up on the next run." The current `getPendingArticleIds` only treats **no analysis row** as pending, so a row with a null embedding would be skipped. I add a dedicated **embedding-backfill pass** that UPDATEs the existing row (never re-inserts — the `article_id` unique constraint would otherwise 23505). Full-analysis articles get their embedding inline in the same insert.
- **Embedding not added to the home-feed SELECT.** A 1536-float vector × 60 cards is wasteful. Only the detail query selects `embedding`; the home feed is unchanged.
- **Related-articles ordering uses an RPC.** supabase-js cannot express `order by embedding <=> $param`. I add a Postgres function `get_related_articles(query_embedding, exclude_id, match_count)` and call it with `.rpc()`. `SECURITY INVOKER` (default) — it only reads already-public tables.
- **`getRelatedArticles` uses the service-role client** (as §20 states) via `createSupabaseAdminClient`.
- **pgvector insert format.** PostgREST expects a vector as a bracketed string literal (`'[0.1,0.2,...]'`), not a raw JS array. A small `toVectorLiteral(number[])` helper formats it. Reading `embedding` back returns that same string form, which is passed straight into the RPC param.
- **Provider reuse.** Extract the proxied OpenAI provider + `makeProxiedFetch` into `lib/ai/openai-provider.ts` and import it from both `analyze-article.ts` and the new `embed-article.ts`, so embeddings honor `OPENAI_PROXY_URL` too. This is the only refactor, confined to the AI layer.
- **No new env vars.** Embeddings reuse `OPENAI_API_KEY` + `OPENAI_PROXY_URL`. Embedding model is fixed at `text-embedding-3-small` (must stay 1536 to match the column). `.env.example` unchanged.
- **IVFFlat `lists = 100`** as a sane default for a small/medium article set.

## Files likely to change

**SQL / schema (manual apply + repo sync):**
- `supabase/schema.sql` — add `create extension if not exists vector;`, the `embedding vector(1536)` column, the IVFFlat index, and the `get_related_articles` function. Keep idempotent.
- `lib/supabase/types.ts` — add `embedding` to `ArticleAnalysis` (typed `string | null`); add a `RelatedArticle` type.

**AI layer:**
- `lib/ai/openai-provider.ts` — **new**; exports the shared proxied `provider`.
- `lib/ai/analyze-article.ts` — import the shared provider (remove the local provider/`makeProxiedFetch`).
- `lib/ai/embed-article.ts` — **new**; `embedArticle(title, body): Promise<number[]>` + `EMBEDDING_MODEL`, timeout, `maxRetries: 1`, and a `toVectorLiteral` helper (or colocate the helper in the pipeline).

**Pipeline:**
- `lib/pipeline/analyze.ts` — generate the embedding alongside analysis; include it in the `saveAnalysis` insert; set `analyzed_at` only after both; add the embedding-backfill pass for `embedding IS NULL` rows; log/summarize embedding events.
- `lib/pipeline/analysis-types.ts` — add `embedded` / `embeddingFailed` counters to `AnalysisSummary` (optional, minimal).

**Queries + UI:**
- `lib/supabase/queries/articles.ts` — detail query selects `embedding`; add `getRelatedArticles(articleId, embedding)` via `.rpc()` on the admin client.
- `app/article/[id]/page.tsx` — fetch related when the current article has an embedding; render a Related Articles section (≤5); hide it when no embedding or no results.
- (New small presentational component only if the section warrants it; otherwise inline.)

## Implementation requirements

### SQL (idempotent; user applies in SQL Editor)
```sql
create extension if not exists vector;

alter table public.article_analyses
  add column if not exists embedding vector(1536);

create index if not exists article_analyses_embedding_idx
  on public.article_analyses using ivfflat (embedding vector_cosine_ops)
  with (lists = 100);

create or replace function public.get_related_articles(
  query_embedding vector(1536),
  exclude_id uuid,
  match_count int default 5
)
returns table (
  id uuid, title text, image_url text, published_at timestamptz,
  source_name text, bias_label text,
  left_percentage numeric, center_percentage numeric, right_percentage numeric,
  similarity float
)
language sql stable
as $$
  select a.id, a.title, a.image_url, a.published_at,
         s.name as source_name, an.bias_label,
         an.left_percentage, an.center_percentage, an.right_percentage,
         1 - (an.embedding <=> query_embedding) as similarity
  from public.article_analyses an
  join public.articles a on a.id = an.article_id
  left join public.sources s on s.id = a.source_id
  where an.embedding is not null
    and a.analyzed_at is not null
    and a.id <> exclude_id
  order by an.embedding <=> query_embedding
  limit match_count;
$$;
```
Mirror all of this into `supabase/schema.sql` (extension + column + index + function), placed after the `article_analyses` table.

### Embedding generation
- `embedArticle(title, body)`: embed `"${title}\n\n${body}"` truncated to a bounded length (reuse a `MAX_TEXT_CHARS`-style cap), `abortSignal: AbortSignal.timeout(...)`, `maxRetries: 1`. Returns `number[]` of length 1536.
- `toVectorLiteral(v: number[]): string` → `'[' + v.join(',') + ']'`.

### Pipeline
- **Full-analysis path:** after `analyzeWithRetry` succeeds, call `embedArticle`. If the embedding fails, do **not** save partial analysis (or save analysis but leave `embedding` null and let the backfill retry it) — chosen behavior: save analysis with `embedding` set; only set `analyzed_at` after the insert (with embedding) succeeds. If embedding generation throws, count the article as failed for this run and skip saving, so the next run retries cleanly. (Confirm this exact choice at implementation; the invariant is: `analyzed_at` is set only when the row has a non-null embedding.)
- **Backfill path:** query `article_analyses` for `article_id` where `embedding is null` (chunked, respecting the ≤15 `.in()` rule if used), load each article's title/raw_text, embed, `update ... set embedding = ...`, and set `articles.analyzed_at` if still null. Never insert.
- Extend logging + the final summary object with embedding counts.

### Queries + UI
- Detail `SELECT` adds `embedding` inside the `article_analyses (...)` embed; keep the JS array-normalization.
- `getRelatedArticles(articleId, embeddingLiteral)`: `admin.rpc('get_related_articles', { query_embedding: embeddingLiteral, exclude_id: articleId, match_count: 5 })`, returns `RelatedArticle[]`.
- Detail page: if `analysis.embedding` is present, fetch related and render a section (title, source, small bias indicator, link to `/article/[id]`). Hide entirely when embedding is absent or the list is empty. Match existing panel styling (rounded border, `text-h4` heading, Tailwind tokens already in use).

## Security requirements (§21 + supabase skill)

- Embeddings, OpenAI calls, and RPC run **server-side only** (`server-only` modules, Node runtime). No secrets to the browser.
- `get_related_articles` is `SECURITY INVOKER` (default) and reads only already-public tables; no `SECURITY DEFINER`.
- RLS unchanged: existing public-read on `articles`/`article_analyses`/`sources` covers the new read path. The new column inherits the table's RLS.
- Service-role key stays server-only via `createSupabaseAdminClient` (`server-only` import).

## Acceptance criteria

- pgvector enabled; `article_analyses.embedding vector(1536)` + IVFFlat cosine index exist; `supabase/schema.sql` and `lib/supabase/types.ts` reflect them.
- Running `POST /api/analyze` on pending articles saves analysis **and** a non-null 1536-dim embedding; `analyzed_at` is set only when the embedding is present.
- Re-running `POST /api/analyze` after nulling an embedding backfills that embedding via UPDATE (no duplicate-row error, no re-analysis of unrelated fields beyond what's needed).
- The details page shows a Related Articles section (≤5, ordered by cosine similarity, excluding the current article) when the current article has an embedding, and hides it otherwise.
- `npm run typecheck` and `npm run lint` pass; `npm run build` passes (routes/server modules changed).

## Checks to run

- `npm run typecheck`
- `npm run lint`
- `npm run build`

## Manual test steps

1. Apply the SQL from this prompt in Supabase Dashboard → SQL Editor (extension, column, index, function). Confirm no errors.
2. Start dev: `npm run dev` (watch the terminal for pipeline logs).
3. Trigger analysis (replace secret):
   ```bash
   curl -X POST http://localhost:3000/api/analyze \
     -H "x-biasly-admin-secret: $BIASLY_ADMIN_SECRET" \
     -H "content-type: application/json" -d '{"limit": 5}'
   ```
   Expect the summary to report analyzed articles and embedding counts. In Supabase, verify `article_analyses.embedding` is populated and `articles.analyzed_at` set.
4. Backfill check: in SQL Editor, `update public.article_analyses set embedding = null where article_id = '<some-analyzed-id>';` then re-run the curl above. Confirm the embedding is repopulated (UPDATE, not a new row) and no 23505 error appears in logs.
5. Open `http://localhost:3000/article/<analyzed-id>` — confirm a Related Articles section with up to 5 similar articles, each linking to its detail page. Open an article whose embedding is null (or before backfill) and confirm the section is absent.
```
