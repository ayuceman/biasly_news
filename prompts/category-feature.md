# Category Feature

Design spec: `docs/superpowers/specs/2026-07-22-category-feature-design.md`

## Goal

Replace the mock category row with real, AI-assigned topic categories:

- AI assigns a category to every analyzed article, persisted on a new
  `article_analyses.category` column (fixed enum).
- Existing analyzed rows are backfilled cheaply (no full re-analysis, no re-embedding).
- The home page chip row shows the categories actually present, ordered by count.
- Clicking a chip filters the feed via a shareable URL (`/?category=Sports`); an "All"
  chip clears the filter; the active chip is highlighted.
- Cards show the real category instead of the `bias_label` placeholder.

## Skills read

- `.agents/skills/ai-sdk` — `generateObject` structured output with a Zod enum schema.
- `.agents/skills/supabase` — schema/column change, service-role reads, joined-table
  filter gotcha (§21).
- `node_modules/next/dist/docs/` — App Router `searchParams` in a Server Component,
  server/client boundaries for the chips.

## Existing code inspected

- `app/page.tsx` — hardcoded 9-string `categories` array; renders `CategoryChips` + feed.
- `components/ui/category-chips.tsx` — client component; chip click only fires PostHog
  `category_selected`; no filtering.
- `components/ui/article-link.tsx` — already forwards `category` to PostHog on open.
- `lib/supabase/mappers.ts` — `toNewsCardData` sets `category: capitalize(bias_label)` (placeholder).
- `lib/supabase/queries/articles.ts` — `getAnalyzedArticles`, `SELECT`/`DETAIL_SELECT`,
  JS-side "has analysis" filtering; §21 gotcha respected.
- `lib/supabase/types.ts` — `ArticleAnalysis` type (no category).
- `lib/ai/analysis-schema.ts` — `analysisSchema`, `FRAMING_LABELS`, `normalizeFraming`.
- `lib/ai/analyze-article.ts` — `analyzeArticle`, `SYSTEM_PROMPT`, timeout/retry hardening.
- `lib/pipeline/analyze.ts` — pending detection (LEFT JOIN), `saveAnalysis`, and the §20
  embedding backfill (`getEmbeddingBacklogIds` / `backfillEmbedding`) — the pattern to mirror.
- `supabase/schema.sql` — `article_analyses` table definition.

## Decisions / assumptions

- Category enum (single source of truth in `lib/ai/analysis-schema.ts` as
  `ARTICLE_CATEGORIES`): `Politics, Business, Technology, Science, Health, Sports,
  Entertainment, World, Environment, Other`.
- `category` column is **nullable** so existing rows stay valid until backfilled; the
  mapper falls back to the capitalized `bias_label` only while `category` is null.
- Server-side filtering is done by fetching analyzed articles then filtering in JS by
  `analysis.category` (NOT `.eq('article_analyses.category', …)` — §21 gotcha).
- Category backfill uses title + existing `summary` via a cheap `classifyCategory` call;
  it never re-runs sentiment/bias/embedding and never rewrites `analyzed_at`.
- Backfill runs inside the existing `POST /api/analyze` flow (admin-secret protected) and
  therefore the cron pipeline too — no new API route, no new secret.

## Files likely to change

- `supabase/schema.sql` — add `category text` to `article_analyses`.
- `lib/supabase/types.ts` — `ArticleAnalysis.category: string | null`.
- `lib/ai/analysis-schema.ts` — `ARTICLE_CATEGORIES`, `category` in `analysisSchema`,
  `AnalysisOutput` gains `category`.
- `lib/ai/analyze-article.ts` (or new `lib/ai/classify-category.ts`) — system-prompt line
  for `category`; new `classifyCategory(title, summary)`.
- `lib/pipeline/analyze.ts` — `saveAnalysis` writes `category`; add
  `getCategoryBacklogIds` + `backfillCategory` + a backfill pass (after the embedding pass).
- `lib/pipeline/analysis-types.ts` — add a backfill counter if the summary needs it.
- `lib/supabase/queries/articles.ts` — `category` in `SELECT`; `getAnalyzedArticles`
  accepts a `category` filter; new `getDistinctCategories()`.
- `lib/supabase/mappers.ts` — `toNewsCardData` uses real `category` with fallback.
- `app/page.tsx` — read `searchParams.category`; build chips from distinct categories;
  filter feed; empty state for no-match.
- `components/ui/category-chips.tsx` — chips as `<Link>`; "All" chip; active highlight;
  props `{ categories: string[]; active?: string }`; keep PostHog capture.

## Implementation requirements

1. Add `ARTICLE_CATEGORIES` enum + `category` to `analysisSchema`; add the prompt line.
2. Persist `category` in `saveAnalysis`. New articles categorized with no extra AI call.
3. `classifyCategory(title, summary)`: single `generateObject`, minimal
   `z.object({ category: z.enum(ARTICLE_CATEGORIES) })`, same timeout/`maxRetries` as
   `analyzeArticle`. Server-only.
4. Category backfill mirroring the §20 embedding backfill: page `article_analyses` where
   `category IS NULL`, load title + summary, classify, `UPDATE` the row. Honor
   `articleIds`/`limit`. Per-row error isolation; log counts in the summary.
5. `getDistinctCategories()`: distinct non-null categories present, ordered by count desc.
6. `getAnalyzedArticles({ limit?, category? })`: JS-side filter on `analysis.category`
   when `category` is set; existing behavior unchanged when it is not.
7. `app/page.tsx`: `?category=` drives the feed and the active chip; render an empty state
   when a filter matches nothing (reuse existing empty-state styling).
8. `CategoryChips`: `<Link>` chips + "All" chip; highlight active; retain
   `posthog.capture("category_selected", { category })` on click.
9. `toNewsCardData`: real category with `bias_label` fallback while null.

## Security requirements (AGENTS.md §21)

- `classifyCategory` and all pipeline code stay in `server-only` modules; `OPENAI_API_KEY`
  and service-role key never reach browser code.
- No new API route, no new env var, no secret in URLs. Chips are plain navigation links.

## Acceptance criteria

- `ALTER TABLE article_analyses ADD COLUMN category text;` documented for the user to run.
- New analysis runs write a valid enum `category`.
- `POST /api/analyze` backfills `category` for existing analyzed rows without re-running
  sentiment/bias/embedding and without changing `analyzed_at`.
- Home chips reflect real distinct categories, ordered by count, plus an "All" chip.
- Clicking a chip sets `/?category=<name>`, filters the feed, and highlights the active
  chip; "All" clears it.
- Cards display the real category (fallback to bias label only for not-yet-backfilled rows).
- No `.eq('article_analyses.category', …)` usage anywhere.

## Checks to run

- `npm run typecheck`
- `npm run lint`
- `npm run build` (routes, schema, and server modules changed)

## Manual test steps

1. Run in Supabase SQL Editor: `ALTER TABLE article_analyses ADD COLUMN category text;`
2. Start dev server: `npm run dev` (watch the terminal for backfill logs — §17).
3. Backfill existing rows:
   ```bash
   curl -X POST http://localhost:3000/api/analyze \
     -H "x-biasly-admin-secret: <BIASLY_ADMIN_SECRET>"
   ```
   Confirm the terminal logs category backfill progress and a final summary.
4. Open `http://localhost:3000/` — chips show real categories ordered by count, plus "All".
5. Click a chip → URL becomes `/?category=<name>`, feed filters, active chip highlighted,
   cards show the real category.
6. Click "All" → filter clears, full feed returns.
7. Visit a bogus `/?category=Nonexistent` → empty-state message renders; chips still show.
