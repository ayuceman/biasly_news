# Nav Pages: Blindspot + Local — Design

Date: 2026-07-22
Status: Approved for planning

Scope note: The nav has four links — Home (works), For You, Local, Blindspot. This
spec covers **shared infrastructure + Blindspot + Local**. **For You** (Clerk
`publicMetadata` followed-categories) is deliberately split into its own later
spec/prompt.

## Problem

`components/layout/site-header.tsx` renders "For You", "Local", "Blindspot" as dead
links (`href: "#"`). Only Home works. We want Local and Blindspot to be real working
pages. Both are Ground News-style concepts; our schema is single-article analysis
(L/C/R framing %, no cross-source coverage counts, no location data) — see the
[[biasly-ui-schema-gap]] note — so each is an honest adaptation of what our data supports.

## Decisions (from brainstorming)

- **Blindspot:** split view. Left-framed articles (`left_percentage >= 60`) shown under
  "Missed by the Right"; right-framed (`right_percentage >= 60`) under "Missed by the
  Left". Threshold constant = 60. No schema change.
- **Local:** add a nullable `region` column to `sources`; region picker + region-filtered
  feed. Tag the 5 seed sources (US / UK / International).
- **For You:** OUT OF SCOPE here (separate spec).

## Shared infrastructure (built first)

### ArticleGrid component

Extract the card grid + empty-state currently inline in `app/page.tsx` into
`components/ui/article-grid.tsx`:

- Props: `cards: NewsCardData[]`, `emptyTitle: string`, `emptyBody: string`.
- Renders the existing responsive grid of `ArticleLink` + `NewsCard`, or the existing
  empty-state block when `cards` is empty.
- `app/page.tsx` is refactored to use it (behavior unchanged). Blindspot and Local reuse it.

### Header active state

`site-header.tsx` currently hardcodes `active: true` on Home. Replace the dead `#`
hrefs with real routes and derive `active` from the current path:

- `navLinks` → `{ label: "Home", href: "/" }`, `{ label: "For You", href: "/for-you", withDot: true }`,
  `{ label: "Local", href: "/local" }`, `{ label: "Blindspot", href: "/blindspot" }`.
- Active detection needs `usePathname()`, a client hook. Extract the `<nav>` into a small
  client component `components/layout/site-nav.tsx` (`"use client"`); the header stays a
  server component. `For You` still points at `/for-you` even though that page ships later —
  it will 404 until the For You spec lands; that is acceptable and called out to the user.
  (Alternative considered: keep For You as `#` until its page exists. Rejected — the header
  change is trivial and the route will exist soon; a 404 is clearer than a dead anchor.)

## Blindspot — `/blindspot`

### Data

New query in `lib/supabase/queries/articles.ts`:

```
getBlindspotArticles(perColumn = 12): Promise<{ left: ArticleWithAnalysis[]; right: ArticleWithAnalysis[] }>
```

- Reuse the shared `SELECT`; fetch analyzed articles (same JS "has analysis" filter).
- `BLINDSPOT_LEAN_THRESHOLD = 60` (exported constant).
- `left` = articles with `analysis.left_percentage >= 60`, sorted by `left_percentage` desc,
  capped at `perColumn`. `right` = `analysis.right_percentage >= 60`, sorted desc, capped.
- All filtering/sorting in JS (§21 joined-table gotcha).

### Page

`app/blindspot/page.tsx` (RSC):

- Heading "Blindspot" + one-line explainer: framing is AI-estimated per article, not
  cross-source coverage counts.
- Two columns: **"Missed by the Right"** (left list) and **"Missed by the Left"** (right list),
  each rendering `ArticleGrid`-style cards (single-column within each side; reuse `NewsCard` +
  `ArticleLink`). If a side is empty, show a short per-column empty message.
- Responsive: stacked on mobile, two columns on `md+`.

## Local — `/local`

### Schema

- Add nullable `region text` to `sources`. Update `supabase/schema.sql` (table def +
  `alter table ... add column if not exists region text`), `lib/supabase/types.ts`
  (`Source.region: string | null`).
- Provide `UPDATE` SQL to tag the seed sources:
  - NPR, Fox News → `United States`
  - BBC News, The Guardian → `United Kingdom`
  - Reuters → `International`
- The joined source embed (`SourceEmbed = Pick<Source, "id" | "name" | "logo_url">`) must
  also select `region`; extend the embed type + the `source:sources ( ... )` select to
  include `region`.

### Data

- `getRegions(): Promise<string[]>` — distinct non-null `sources.region`, ordered (by name;
  count is not meaningful for a handful of regions).
- Extend `getAnalyzedArticles` options with `region?: string`; when set, filter mapped
  articles by `a.source?.region === region` (JS-side, §21).

### Page

`app/local/page.tsx` (RSC, `searchParams.region`):

- Region picker chips: a new `components/ui/region-chips.tsx` client component mirroring
  `CategoryChips` (same link-chip styling, "All" chip, active highlight, horizontal scroll),
  but linking to `/local?region=<name>`. Keep the PostHog capture as `region_selected`. Do
  NOT refactor the working `CategoryChips` — mirror it (the small duplication is preferred
  over reworking a shipped component). "All" clears; active highlighted.
- `ArticleGrid` filtered feed. Empty state: if no regions are tagged yet, explain sources
  need a region set; if a region has no articles, the standard empty message.

## Data flow

1. Blindspot: RSC → `getBlindspotArticles()` → two columns.
2. Local: RSC → `getRegions()` builds chips; `getAnalyzedArticles({ region })` builds the feed;
   `?region=` drives selection + filter.
3. Header: `SiteNav` highlights the link matching `usePathname()`.

## Error handling

- Queries throw on Supabase error (consistent with existing queries); pages surface via
  the existing error boundary behavior.
- Unknown `?region=` → no matches → empty state; chips still render.
- Region column absent (user hasn't run the ALTER) → `getRegions()` errors; documented as a
  required migration step before visiting `/local`.

## Security (AGENTS.md §21)

- Read-only pages using the existing anon/server client. No new secrets, no AI calls, no
  mutations, no new API routes. Region is public, non-sensitive data.

## Testing

- `npm run typecheck`, `npm run lint`, `npm run build`.
- Manual:
  - `/blindspot` — two columns; left column holds `left% >= 60` articles, right holds
    `right% >= 60`; empty sides show per-column message.
  - Run region ALTER + UPDATE SQL; `/local` — region chips appear; clicking filters the feed
    and sets `?region=`; "All" clears.
  - Header — the link for the current page is underlined/active; Home/Local/Blindspot navigate.

## Out of scope (YAGNI)

- For You page (separate spec).
- Real cross-source coverage counts for Blindspot.
- Per-article geolocation; region lives on the source only.
- Region CRUD UI (regions are set via SQL for now).
