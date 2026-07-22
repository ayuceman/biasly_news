# News Details Page UI

## Goal

Build the biasly news article details page (dynamic route `app/article/[id]/page.tsx`) matching the attached reference screenshot: article headline/byline/hero image, full body text, Bias Analysis panel, AI Summary panel, Source Breakdown panel, Related Stories grid, and a newsletter CTA band — all sitting inside the existing `SiteHeader`/`SiteFooter` chrome. Mock data only (no Supabase/AI pipeline exists yet), matching the pattern already used for the home page.

## Skills read

- `AGENTS.md` (root workflow; section 1 build list — "news details page with full article analysis" is in scope; section 5 — UI must display stored data only, must not scrape/analyze/mutate; section 19 — framing must be shown as AI-estimated, not objective truth; section 6 tech stack).
- No `.agents/skills/*` apply — plain Next.js/Tailwind UI work, same as the home page build.

## Existing code inspected

- `prompts/design-system.md`, `prompts/home-page.md` — established tokens/primitives and the mock-data pattern this page continues.
- `app/page.tsx` — home page: `mx-auto max-w-[1280px] px-6` container, renders inside `SiteHeader`/`SiteFooter` from `app/layout.tsx`.
- `components/layout/site-header.tsx`, `site-footer.tsx` — already wrap every route via `app/layout.tsx`; reused as-is, no changes needed.
- `components/ui/bias-meter.tsx` — `bar` variant (full-width 3-segment bar + 0/50/100 scale) and `pills` variant (compact 3-segment). Neither matches the reference's **vertical stacked bar list** (Left/Center/Right as separate horizontal rows with label, %, and a proportional bar) used in both the "Bias Analysis" sidebar panel and "Bias Distribution" panel — needs a new small presentational block built from `bg-left-bias`/`bg-center-bias`(as `bg-muted`, matching existing `pills` convention)/`bg-right-bias` tokens rather than a new `BiasMeter` variant, since the layout (stacked rows vs. side-by-side segments) is structurally different, not just a style tweak.
- `components/ui/news-card.tsx` — used as-is for the "Related Stories" grid (4 cards, 2-column) since it already supports `imageUrl`/`category`/`region`/`title` — reference's related-story cards omit bias pills and sources count, so pass without `leftPercentage`/etc... actually `NewsCard` currently requires `leftPercentage`/`centerPercentage`/`rightPercentage` (not optional). Related-story cards in the reference show only image, category · region-style eyebrow (`World · Middle East`), title, date, read time — no bias pills. Reusing `NewsCard` as-is would force fake bias pills to render. Decision: build a small local `RelatedStoryCard` presentational block in the same file instead of changing `NewsCard`'s required props (avoids touching a shared primitive's contract for one page).
- `lib/mock-articles.ts` — `MockArticle` type has id/imageSeed/category/region/title/left/center/right percentages/sourcesCount. Missing fields the details page needs: author, published date, read time, full body paragraphs, AI summary bullets, framing notes, loaded terms, disclaimer, confidence, per-source name+bias breakdown, caption/photo credit.
- `lib/utils.ts` — `cn()` helper.
- `app/globals.css` — confirmed tokens: `--color-left-bias`, `--color-center-bias` (checked: used as `bg-muted` in pills variant — reference "Center" pill is white/light gray with black text, matches `bg-muted`), `--color-right-bias`, `text-h1`..`text-caption` scale, `--color-border`, `--color-text-secondary`, `--color-card`.

## Decisions / assumptions

- **New mock data module**: add `lib/mock-article-details.ts` exporting a `MockArticleDetail` type + a `mockArticleDetails: Record<string, MockArticleDetail>` keyed by the same `id`s as `mockArticles`, so `/article/[id]` can join home-page card data with full-detail data. Only fully populate the `trump-iran-peace-proposal` entry (matches the reference screenshot exactly: byline "By David Morgan", "May 31, 2026 · 12 min read", 7 body paragraphs, 5 AI summary bullets, 12 total sources with the 7 listed source rows/bias labels shown in the reference, 6 related stories — reference shows 6 but only "up to 4" is layout-safe in a 2-col grid... reference actually shows 6 related-story tiles in a 2-column x 3-row grid, so build exactly 6). Do not fabricate full detail objects for the other 11 mock articles (out of scope/unrequested); `generateStaticParams`/route just needs to not crash if an unknown id is visited — render Next's default 404 via `notFound()` from `next/navigation` when the id isn't in the map.
- **Route**: `app/article/[id]/page.tsx`, a Server Component reading `params.id`, looking up `mockArticleDetails[id]`, calling `notFound()` if missing. Home page `NewsCard`s should link to `/article/{id}` — add `Link` wrapping in `app/page.tsx`'s card-grid `.map()` (small necessary change, not a new component).
- **Layout**: two-column at `lg` breakpoint (`grid-cols-1 lg:grid-cols-[1fr_360px] gap-8`) inside the existing `max-w-[1280px] px-6` container — main column (headline, meta row, hero image + caption, mobile-only compact bias-distribution card, body text, Related Stories, mobile-only newsletter band) and a right sidebar (Bias Analysis panel, AI Summary panel, Source Breakdown panel) that is sticky on desktop (`lg:sticky lg:top-8 lg:self-start`) matching the reference's fixed-feeling right rail.
- **Bias Distribution card** (the horizontal red/white/blue segmented bar directly under the hero image, reference shows "Left 20% | Center 31% | Right 49%" + "12 sources" caption) reuses the existing `BiasMeter` `pills` variant directly — this one *does* match an existing primitive, unlike the sidebar's stacked-row version.
- **Icons**: reference's small circled "i" info-tooltip icons (next to "Bias Analysis", "AI Summary", "Source Breakdown", "Bias Distribution" headings) rendered as a static `Info` lucide icon, non-interactive (no real tooltip logic — "do not overbuild").
- **Article actions row** (Save / bookmark / Share / more-options icons next to the byline) rendered as static icon buttons (`Bookmark`, `Share2`, `MoreHorizontal` from lucide-react), non-functional, matching "Subscribe"/"Login" being presentational-only elsewhere in the codebase.
- **"How We Analyze Bias" / "Provide Feedback" / "View All Sources" buttons**: render as `Button variant="secondary"` full-width inside their panels, `href="#"`/non-functional, consistent with existing placeholder-link convention.
- **AI summary disclaimer** ("AI summaries can make mistakes.") rendered per section 19's "AI-estimated, not objective truth" requirement — static caption text above the "Provide Feedback" button, matching the reference.
- **Newsletter CTA band** ("Stay Informed. Stay Balanced.") — new `NewsletterCta` presentational block local to this page file (not a shared component; only used here so far), light-gray full-bleed-within-container band with email input (`<input>` styled to match `Button`/`border-border` tokens, non-functional — no real subscribe logic, `type="email"` with `disabled` submit avoided per "do not overbuild"; instead keep it enabled but the button has no `onClick`/`type="button"`, consistent with other static CTAs in the codebase) + `Button variant="primary"`.
- **Images**: same `https://picsum.photos/seed/<slug>/<w>/<h>` pattern as the home page — hero image uses `imageSeed` at a larger size (e.g. `1200/700`), related-story thumbnails reuse each story's own `imageSeed` at card size (`800/450`, matching `NewsCard`'s existing usage).
- **Utility bar top date**: reference shows "Monday, June 1, 2026" — already hardcoded in `SiteHeader`, no change needed; article's own byline date ("May 31, 2026") is separate mock data, not derived from the header date.

## Files likely to change

- `app/article/[id]/page.tsx` — new, the details page (Server Component)
- `lib/mock-article-details.ts` — new, typed mock detail data (fully populated for `trump-iran-peace-proposal` only)
- `app/page.tsx` — wrap each `NewsCard` in a `Link href={`/article/${article.id}`}` so home cards navigate to their detail page

## Implementation requirements

### Page header / breadcrumb
`text-caption text-text-secondary`: "Politics · United States" eyebrow above the headline.

### Headline + byline row
`text-h1 font-bold` two-line headline ("Trump Sends Iran Revised Peace Proposal With Tougher Terms: Report"). Below: byline row — "By David Morgan" (`text-body-sm text-text-secondary`), "May 31, 2026", "12 min read", separated by `·`, plus a right-aligned cluster of static icon buttons: Save (`Bookmark`), Share (`Share2`), more (`MoreHorizontal`).

### Hero image
`aspect-[16/9]` (or reference-matching ratio) `rounded-lg` image via `bg-cover bg-center` background-image pattern (same as `NewsCard`), with a caption line below in `text-caption text-text-secondary` ("President Donald Trump in the Cabinet Room at the White House, Washington, D.C., May 30, 2026. Photo: Andrew Harnik/Getty Images").

### Bias Distribution card (main column, under hero)
Bordered `rounded-lg` card: "Bias Distribution" heading + info icon, then `BiasMeter variant="pills"` at 20/31/49, then "12 sources" caption below.

### Article body
7 paragraphs, `text-body-lg text-foreground`, `flex flex-col gap-4`, matching the reference's article text about the Iran proposal.

### Related Stories (main column, below body)
"Related Stories" `text-h2 font-bold` heading, then a `grid grid-cols-1 sm:grid-cols-2 gap-6` of 6 related-story tiles (small image thumbnail + eyebrow "World · Middle East" style + title + date + read time, no bias pills) — build as a local `RelatedStoryCard` in the page file, matching titles/dates/categories from the reference: "Iran Says It Will Not Negotiate Under 'Maximum Pressure'" (World · Middle East, May 29 2026, 8 min read), "Bipartisan Group Urges Diplomacy With Iran" (Politics · United States, May 26 2026, 5 min read), "US Sanctions More Iranian Entities Over Nuclear Program" (Politics · United States, May 28 2026, 6 min read), "What's in the 2015 Iran Nuclear Deal?" (Science · Nuclear Policy, May 25 2026, 10 min read), "Oman Hosts Another Round of US-Iran Nuclear Talks" (World · Middle East, May 27 2026, 7 min read), "Israel Reaffirms Red Line Over Iranian Nuclear Program" (World · Middle East, May 24 2026, 6 min read).

### Newsletter CTA band (main column, bottom)
Light `bg-surface rounded-lg` band: "Stay Informed. Stay Balanced." (`text-h3 font-bold`) + "Get the top stories and bias analysis delivered to your inbox." (`text-body-sm text-text-secondary`), email input + `Button variant="primary"`>Subscribe</Button>` inline on desktop, stacked on mobile.

### Sidebar — Bias Analysis panel
Bordered `rounded-lg` card, sticky on desktop: "Bias Analysis" heading + info icon. "Overall Bias" label, big `text-h1 font-bold text-right-bias` value "Right 49%", "Based on 12 balanced sources" caption. Then 3 stacked rows (Left 20%, Center 31%, Right 49%) — each row: label + percentage on one line, a full-width thin proportional bar below (red/gray/blue matching `bg-left-bias`/`bg-muted`/`bg-right-bias`) — this is the new stacked-row bias block described in "Existing code inspected." Divider, then explanatory caption text ("Our analysis is based on..."), then `Button variant="secondary"` full width "How We Analyze Bias".

### Sidebar — AI Summary panel
Bordered `rounded-lg` card: "AI Summary" heading + info icon, "Generated May 31, 2026 · 3 min read" caption, then a `<ul>` of 5 bullet points (`text-body-sm`) summarizing the proposal (content matching the reference's 5 bullets), then "AI summaries can make mistakes." caption, then `Button variant="secondary"` full width "Provide Feedback".

### Sidebar — Source Breakdown panel
Bordered `rounded-lg` card: "Source Breakdown" heading + info icon, "12 Total Sources" caption. 3 stacked rows (Left 2 (20%), Center 4 (31%), Right 6 (49%)) using the same stacked-row bias block as the Bias Analysis panel. Divider, "Top Sources" mini-table: 7 rows of source name + bias label (`Fox News` Right, `The Wall Street Journal` Center, `Reuters` Center, `BBC` Center, `CNN` Left, `The New York Times` Center, `The Washington Post` Center, `Newsmax` Right — reference shows 8 rows total incl. Newsmax, use all 8), bias label colored `text-right-bias`/`text-left-bias`/`text-foreground` per row. Then `Button variant="secondary"` full width "View All Sources".

### Visual/typography/spacing details
- Container: `mx-auto max-w-[1280px] px-6 py-8`, consistent with home page.
- Sidebar cards: `border border-border rounded-lg bg-card p-5`, `flex flex-col gap-4` stacked with `gap-6` between the three panels.
- Stacked bias-row block: label row `flex justify-between text-body-sm font-medium`, bar `h-2 rounded-full bg-muted overflow-hidden` with an inner `h-full` colored div sized to the percentage.
- Responsive: sidebar stacks below main content on mobile/tablet (`grid-cols-1`), becomes a sticky right rail at `lg`. Related Stories grid collapses to 1 column below `sm`. No horizontal overflow at any width.

## Security requirements

None — fully static/presentational, mock data only, no data fetching, no secrets, no server code, no forms that submit anywhere.

## Acceptance criteria

- `app/article/[id]/page.tsx` renders for `id="trump-iran-peace-proposal"` with headline, byline row, hero image + caption, Bias Distribution card, 7-paragraph body, Related Stories grid (6 tiles), and Newsletter CTA in the main column; Bias Analysis, AI Summary, and Source Breakdown panels in the sidebar — matching the reference screenshot's structure and content.
- Visiting `/article/<unknown-id>` renders Next's `notFound()` 404 instead of crashing.
- Home page cards (`app/page.tsx`) link to `/article/{id}` and clicking one navigates to the details page.
- Sidebar is a sticky right rail on desktop widths and stacks below the article body on mobile, with no horizontal page overflow at any width.
- No TypeScript `any`, no unused code, no unrelated refactors to existing shared primitives (`NewsCard`, `BiasMeter`, `Button` unchanged).

## Checks to run

- `npm run typecheck`
- `npm run lint`
- `npm run build` (new route added)

## Manual test steps

1. `npm run dev`
2. Open `http://localhost:3000` and click the "Trump Sends Iran Revised Peace Proposal..." card — confirm it navigates to `/article/trump-iran-peace-proposal`.
3. Verify headline, byline (author/date/read time + Save/Share/more icons), hero image + caption, Bias Distribution card (20/31/49 pills + "12 sources"), and 7 body paragraphs render in the main column.
4. Verify the sidebar shows Bias Analysis (overall "Right 49%" + 3 stacked bias rows + "How We Analyze Bias" button), AI Summary (5 bullets + disclaimer + "Provide Feedback" button), and Source Breakdown (12 total + 3 stacked rows + 8-row source table + "View All Sources" button).
5. Verify Related Stories shows 6 tiles in a 2-column grid, and the Newsletter CTA band renders at the bottom of the main column.
6. Resize to desktop width (~1440px) and confirm the sidebar is visually pinned (sticky) while scrolling the article body; resize to mobile (~375px) and confirm the sidebar stacks below the article content with no horizontal scroll anywhere on the page.
7. Visit `http://localhost:3000/article/does-not-exist` and confirm a 404 page renders instead of a crash.
