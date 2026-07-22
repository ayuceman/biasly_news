# Nav Pages: Blindspot + Local

Design spec: `docs/superpowers/specs/2026-07-22-nav-pages-blindspot-local-design.md`

## Goal

Make the dead nav links real. This prompt covers **shared infra + Blindspot + Local**.
For You is a separate later prompt.

- Header: real routes + active state from the current path.
- `/blindspot`: two columns — "Missed by the Right" (`left% >= 60`) and "Missed by the
  Left" (`right% >= 60`).
- `/local`: `region` on sources + region picker + region-filtered feed.

## Skills read

- `.agents/skills/supabase` — `sources.region` column, joined-table filter gotcha (§21).
- `node_modules/next/dist/docs/` — App Router routes, `searchParams`, server/client split,
  `usePathname`.

## Existing code inspected

- `components/layout/site-header.tsx` — hardcoded `#` hrefs, `active: true` on Home.
- `app/page.tsx` — inline card grid + empty state (to be extracted).
- `components/ui/category-chips.tsx` — link-chip pattern to mirror for regions.
- `components/ui/news-card.tsx`, `components/ui/article-link.tsx` — card + link.
- `lib/supabase/queries/articles.ts` — `SELECT`, `getAnalyzedArticles({ limit, category })`,
  `JoinedRow`, `SourceEmbed`, JS-side "has analysis" filter.
- `lib/supabase/mappers.ts` — `toNewsCardData`, `NewsCardData`.
- `lib/supabase/types.ts` — `Source`, `ArticleWithAnalysis`.
- `supabase/schema.sql`, `supabase/seed.sql` — sources: Reuters, NPR, BBC News, Fox News,
  The Guardian.

## Decisions / assumptions

- `BLINDSPOT_LEAN_THRESHOLD = 60`.
- Region tagging: NPR & Fox → `United States`; BBC & Guardian → `United Kingdom`;
  Reuters → `International`.
- `region` is nullable; set via SQL for now (no CRUD UI).
- For You link points at `/for-you` and will 404 until its own prompt ships (acceptable).
- Mirror `CategoryChips` into `RegionChips`; do not refactor the shipped `CategoryChips`.

## Files likely to change / add

- `components/ui/article-grid.tsx` (new) — reusable grid + empty state.
- `app/page.tsx` — use `ArticleGrid`.
- `components/layout/site-nav.tsx` (new, client) — nav with `usePathname` active state.
- `components/layout/site-header.tsx` — real routes; render `SiteNav`.
- `app/blindspot/page.tsx` (new).
- `app/local/page.tsx` (new).
- `components/ui/region-chips.tsx` (new).
- `lib/supabase/queries/articles.ts` — `getBlindspotArticles`, `getRegions`,
  `region` in `SELECT` + `SourceEmbed`, `region` option on `getAnalyzedArticles`.
- `lib/supabase/types.ts` — `Source.region`, `SourceEmbed` region.
- `supabase/schema.sql` — `sources.region` column + `alter ... add column if not exists`.

## Implementation requirements

1. `ArticleGrid`: props `{ cards, emptyTitle, emptyBody }`; render existing grid or empty
   state. Refactor `app/page.tsx` to use it (behavior unchanged).
2. `SiteNav` (`"use client"`): map nav links; active when `usePathname()` matches href
   (exact match for `/`, prefix/exact for others). Keep the `withDot` on For You. Header
   stays a server component and renders `SiteNav`.
3. `sources.region`: schema + ALTER + `types.ts` (`Source.region: string | null`); extend
   `SourceEmbed` and the `source:sources ( ... )` select to include `region`.
4. `getBlindspotArticles(perColumn = 12)`: returns `{ left, right }`; left = `left% >= 60`
   desc, right = `right% >= 60` desc, each capped; JS-side filter/sort. Export
   `BLINDSPOT_LEAN_THRESHOLD`.
5. `getRegions()`: distinct non-null `sources.region`, ordered by name.
6. `getAnalyzedArticles` gains `region?`; filter mapped articles by `source?.region` in JS.
7. `RegionChips`: mirror `CategoryChips`; link to `/local?region=<name>`; "All" chip;
   active highlight; PostHog `region_selected` capture.
8. `/blindspot`: heading + AI-estimate explainer; two responsive columns using
   `NewsCard` + `ArticleLink`; per-column empty message.
9. `/local`: `searchParams.region`; `RegionChips` from `getRegions()`;
   `getAnalyzedArticles({ region })` feed via `ArticleGrid`; empty/no-regions states.

## Security requirements (AGENTS.md §21)

- Read-only pages, existing server/anon client. No AI calls, no mutations, no new API
  routes, no new secrets. Region is public data.

## Acceptance criteria

- Header links navigate; the current page's link is active-styled.
- `/blindspot` shows the two correctly-populated columns; empty sides handled.
- After the region ALTER + UPDATE SQL, `/local` shows region chips; clicking filters the
  feed and sets `?region=`; "All" clears.
- No `.eq('sources.region', …)` or other joined-table `.eq()` filters.
- `npm run typecheck`, `npm run lint`, `npm run build` all pass.

## Checks to run

- `npm run typecheck`
- `npm run lint`
- `npm run build`

## Manual test steps

1. `/blindspot` — confirm left column = strongly left-framed, right column = strongly
   right-framed; empty sides show a message.
2. In Supabase SQL Editor:
   ```sql
   ALTER TABLE sources ADD COLUMN region text;
   UPDATE sources SET region = 'United States'  WHERE name IN ('NPR', 'Fox News');
   UPDATE sources SET region = 'United Kingdom'  WHERE name IN ('BBC News', 'The Guardian');
   UPDATE sources SET region = 'International'    WHERE name = 'Reuters';
   ```
3. `/local` — region chips appear; click one → `?region=` set, feed filters, chip active;
   "All" clears.
4. Header — navigate between Home / Local / Blindspot; active link is underlined.
   (For You 404s until its own prompt ships.)
