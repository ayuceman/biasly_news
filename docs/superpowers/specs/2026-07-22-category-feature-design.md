# Category Feature — Design

Date: 2026-07-22
Status: Approved for planning

## Problem

The category row on the home page is entirely mock:

- `app/page.tsx` holds a hardcoded array of 9 category strings.
- `components/ui/category-chips.tsx` — clicking a chip only fires a PostHog
  `category_selected` event; nothing filters the feed.
- `lib/supabase/mappers.ts` derives a card's `category` from `capitalize(bias_label)`
  as an admitted placeholder — it is a bias label, not a topic.
- The schema has no category/topic concept; `article_analyses` has no such column.

We want real, AI-assigned topic categories, chips that reflect the categories
actually present, and clicking a chip that filters the feed via a shareable URL.

## Decisions (from brainstorming)

- **Data source:** AI assigns a category; persist it on a new `article_analyses.category` column.
- **Category set:** a fixed enum the AI must map into, to keep distinct values clean:
  `Politics, Business, Technology, Science, Health, Sports, Entertainment, World, Environment, Other`.
- **Filter behavior:** server-side filter via URL (`/?category=Sports`) — shareable/bookmarkable, SSR.
- **Chip list:** distinct categories actually present in analyzed articles, ordered by article count.
- **Backfill:** cheap category-only backfill for existing analyzed rows (no full re-analysis, no re-embedding),
  mirroring the §20 embedding backfill pattern already in `lib/pipeline/analyze.ts`.

## Architecture

Layers stay separated per AGENTS.md §5. UI displays stored data only.

### 1. Data model

Add nullable `category text` to `article_analyses`.

- Update `supabase/schema.sql` (add the column to the table definition).
- Update `lib/supabase/types.ts` (`ArticleAnalysis.category: string | null`).
- Provide `ALTER TABLE article_analyses ADD COLUMN category text;` to run in the
  Supabase SQL Editor before testing (AGENTS.md §7). Nullable so existing rows are
  valid immediately and get filled by the backfill.

The canonical enum lives in `lib/ai/analysis-schema.ts` as
`export const ARTICLE_CATEGORIES = [...] as const` so the AI schema, the classifier,
and any UI fallback share one source of truth.

### 2. AI layer (`lib/ai/`)

- `analysis-schema.ts`: add `ARTICLE_CATEGORIES` and `category: z.enum(ARTICLE_CATEGORIES)`
  to `analysisSchema`. `AnalysisOutput` gains `category`.
- `analyze-article.ts`: add one system-prompt line describing `category` and the allowed
  values. No other change to `analyzeArticle`.
- New `classifyCategory(title, summary)` (in `analyze-article.ts` or a small
  `classify-category.ts`): a single `generateObject` call with a minimal
  `z.object({ category: z.enum(ARTICLE_CATEGORIES) })` schema, using title + existing
  summary (not full article text). Cheap; used only by the backfill path. Same
  timeout/maxRetries hardening as `analyzeArticle`.

### 3. Analysis pipeline (`lib/pipeline/analyze.ts`)

- `saveAnalysis` writes `category: output.category` in the insert. New articles are
  categorized on the normal path — no extra call.
- Add a category backfill pass mirroring the embedding backfill:
  - `getCategoryBacklogIds(admin, options)` — `article_analyses` rows where
    `category IS NULL`, paged, honoring `articleIds`/`limit`, returning `{ article_id, summary, title? }`.
  - `backfillCategory(admin, articleId, category)` — `UPDATE article_analyses SET category`
    for that `article_id`. Never touches `analyzed_at` or `embedding`.
  - A loop that loads title + summary, calls `classifyCategory`, and updates. Counts
    tracked in the existing logger summary (add `categoriesBackfilled` or reuse a
    generic counter — implementation detail for the plan).
- Ordering: the category backfill runs after the embedding backfill so both existing
  gaps are filled per run. Independent of the embedding backfill (an article can have
  an embedding but null category, or vice versa).

### 4. Data access (`lib/supabase/queries/articles.ts`)

- Add `category` to the `SELECT` (and thus `DETAIL_SELECT`).
- `getAnalyzedArticles({ limit, category })`: same query as today; when `category` is
  provided, filter the mapped results in JS (`a.analysis.category === category`) — NOT
  via `.eq('article_analyses.category', …)` (AGENTS.md §21 joined-table gotcha).
- New `getDistinctCategories(): Promise<string[]>`: select `category` from
  `article_analyses` where `category` is not null, count occurrences in JS, return
  distinct categories ordered by count desc. Server-side, service/server client.

### 5. UI

- `app/page.tsx` (RSC): read `searchParams.category`; call `getDistinctCategories()`
  and `getAnalyzedArticles({ category })`; pass the distinct list + the active category
  to `CategoryChips`; render only matching cards. Empty-state copy when a filter yields
  no cards.
- `components/ui/category-chips.tsx`: chips render as `<Link href={"/?category=" + name}>`.
  An **"All"** chip links to `/` (clears filter). Active chip is visually highlighted.
  Keep the PostHog `category_selected` capture on click. Props become
  `{ categories: string[]; active?: string }`.
- `lib/supabase/mappers.ts` `toNewsCardData`: use `row.analysis.category` for the card
  category, falling back to `capitalize(row.analysis.bias_label)` only when `category`
  is still null (backfill window). Comment updated to reflect that category is now real.

## Data flow

1. New article analyzed → `analyzeArticle` returns `category` → `saveAnalysis` persists it.
2. Existing analyzed rows with `category IS NULL` → next `/api/analyze` run →
   category backfill → `classifyCategory` → `UPDATE`.
3. Home page (RSC) → `getDistinctCategories()` builds the chip row; `getAnalyzedArticles({ category })`
   builds the feed; `?category=` drives both selection highlight and filtering.

## Error handling

- AI category is Zod-enum validated; invalid output fails the same way analysis already
  does (retry once, else the article stays pending / category stays null and is retried next run).
- Backfill failures are per-row and logged; they never set `analyzed_at` and never block
  other rows (same isolation as the embedding backfill).
- Unknown `?category=` value → no cards match → empty-state message; chips still render.

## Security (AGENTS.md §21)

- All AI/classification calls stay server-only (`server-only` modules; OPENAI_API_KEY
  never reaches the browser). No new secrets. No new API surface — backfill runs inside
  the existing `POST /api/analyze` (admin-secret protected) and the cron pipeline.

## Testing

- `npm run typecheck`, `npm run lint`, `npm run build` (routes + schema + server modules change).
- Manual: run `ALTER TABLE` SQL; `POST /api/analyze` (with `x-biasly-admin-secret`) to
  backfill categories on existing rows; load `/` and confirm chips reflect real categories;
  click a chip and confirm the URL becomes `/?category=...`, the feed filters, and the
  active chip highlights; click **All** to clear.

## Out of scope (YAGNI)

- Dedicated `/category/[name]` routes.
- Multi-category selection.
- Re-running sentiment/bias/embedding during category backfill.
