# Home Page Implementation

## Goal

Build the biasly home page (`app/page.tsx`) matching the attached reference screenshot: utility bar, header with logo/nav/auth buttons, scrollable category chip row, "Top News" section with a 3-column grid of news cards, and footer. This replaces the current temporary style-guide demo in `app/page.tsx`. No backend pipeline exists yet (no scraping/AI analysis built), so the page renders from local mock data shaped like the eventual Supabase `articles` + `article_analyses` fields — trivial to swap for a real Supabase query later per section 7/19.

## Skills read

- `AGENTS.md` (root workflow, section 1 build list — "home page with news cards" is in scope, section 5 — UI must display stored data only / must not scrape or mutate, section 6 tech stack)
- No `.agents/skills/*` apply (not Clerk/Supabase/Oxylabs/ai-sdk work) — per AGENTS.md section 3 this is plain Next.js/Tailwind/shadcn UI work using existing project patterns.

## Existing code inspected

- `prompts/design-system.md` — prior foundation prompt; tokens, primitives, and rationale already established.
- `app/page.tsx` — currently a style-guide demo (typography/buttons/chips/bias meter/card swatches), not a real page.
- `app/layout.tsx` — Poppins font, no header/footer wrapper yet.
- `app/globals.css` — full token set already defined (colors incl. `left-bias`/`center-bias`/`right-bias`, typography scale `text-h1..caption`, radii, shadows, `--surface`, `--text-secondary`).
- `components/ui/button.tsx` — `primary`/`secondary`/`text`/`destructive` variants, sizes incl. `icon`.
- `components/ui/chip.tsx` — pill chip, optional trailing `+` (`withPlus`).
- `components/ui/bias-meter.tsx` — `bar` (full scale w/ 0/50/100 labels) and `pills` (3 segments) variants.
- `components/ui/news-card.tsx` — current card shows image, info icon, category · region, title, excerpt, bias pills, then a clock/time + bookmark/read-time footer row. The reference home page card has **no excerpt** and replaces the clock/bookmark footer with a plain **"N sources"** caption — needs a card variant change, not a new component.
- No header/footer/layout components exist yet; no mock data module exists yeat.

## Decisions / assumptions

- **Mock data, not Supabase.** Scraping/AI analysis pipelines aren't built (out of scope here). Add `lib/mock-articles.ts` exporting a typed array shaped like the real `articles` + `article_analyses` join (fields: id, title, category, region, sourcesCount, leftPercentage/centerPercentage/rightPercentage, imageSeed) so swapping in a real Supabase query later is a drop-in replacement of the data source, not the UI. This does not violate "UI must display stored data only" — there is no live scrape/AI call from the client; it's static local fixture data standing in for not-yet-built persistence, matching the 15 cards/categories/headlines/percentages/source-counts shown in the screenshot.
- **Images**: reference shows real photos; since no CMS/scraper exists, use deterministic placeholder photo URLs (`https://picsum.photos/seed/<slug>/800/450`) via the existing `imageUrl` background-image pattern in `NewsCard` (no `next/image` remote-pattern config needed since it's a CSS background, matching current implementation).
- **NewsCard change**: make `excerpt` optional (omit rendering when absent) and add an optional `sourcesCount` prop; when `sourcesCount` is provided, render `"{n} sources"` in the footer instead of the clock/bookmark row. Existing usages (design-system demo) keep working since both are optional and default to current behavior when `sourcesCount` is absent... actually simplify: home page always passes `sourcesCount`, no `timeAgo`/`readTime`/`excerpt`. Keep `timeAgo`/`readTime` optional too so the demo swatch in `app/page.tsx` (Card example section) keeps compiling unchanged.
- **New components** (new files, `components/layout/`): `SiteHeader` (utility bar + logo/nav/auth) and `SiteFooter` (brand blurb + link columns + social icons). Placed in `components/layout/` (not `components/ui/`) since they're page-chrome, not reusable primitives — consistent with shadcn convention of separating primitives from layout.
- **Nav/auth are presentational only** — no Clerk wiring yet (out of scope; Clerk auth is a separate future build-list item). "Subscribe"/"Login" buttons and nav links render but are non-functional placeholders (`href="#"`), matching "do not overbuild."
- **Category chips**: horizontally scrollable row (`overflow-x-auto`, no wrap) with a leading `+` icon-only chip and a trailing scroll-hint chevron button, matching the screenshot. Chip labels are static (`World Cup`, `IPL`, `Social Media`, `Business & Markets`, `Health & Medicine`, `Soccer`, `Artificial Intelligence`, `Arsenal FC`, `Extreme Weather and Disasters`).
- **Utility bar** (Browser Extension / Theme toggle / date / Set Location / International Edition) is static/decorative — no real theme switching, geolocation, or i18n logic (out of scope, "do not overbuild"). Date is hardcoded to match the reference (`Monday, June 1, 2026`) rather than `new Date()`, since it's a fixed mock-data screenshot, not a live clock feature.
- **Grid**: 3 columns on desktop (`md:grid-cols-2 lg:grid-cols-3`), single column on mobile, 24px gutter (`gap-6`), inside the existing `max-w-[1280px]` container.
- Replace the style-guide demo entirely in `app/page.tsx`; do not delete the design-system primitives it exercised (button/chip/bias-meter/news-card remain in `components/ui/`, just no longer demoed on the home route).
- `app/layout.tsx` gets `SiteHeader`/`SiteFooter` wrapped around `children` so every future page gets consistent chrome.

## Files likely to change

- `app/page.tsx` — rewritten to the real home page (chips + "Top News" grid)
- `app/layout.tsx` — wrap children with `SiteHeader` / `SiteFooter`
- `components/layout/site-header.tsx` — new
- `components/layout/site-footer.tsx` — new
- `components/ui/news-card.tsx` — `excerpt`, `timeAgo`, `readTime` become optional; add optional `sourcesCount`
- `lib/mock-articles.ts` — new, typed mock data (15 articles matching the screenshot's categories/titles/regions/percentages/source counts)

## Implementation requirements

### Utility bar
Full-width strip above the header, `text-caption`/`text-body-sm`, `text-text-secondary`, bottom border. Left: "Browser Extension" link. Center-right cluster: "Theme:" label + "Light" (active/bold) "Dark" "Auto" toggle group. Right cluster: current date, "Set Location" (with pin icon), globe icon + "International Edition" with chevron.

### Header
White background, bottom border, horizontal padding matching the 1280px container. Left: hamburger `Menu` icon button, "biasly" wordmark (`text-h2 font-bold`) with "News" sub-label and a small red-dot accent per the reference. Center: nav — `Home` (active, underlined in foreground color), `For You` (with small red notification dot), `Local`, `Blindspot` — `text-body-md font-medium`. Right: `Subscribe` (`Button variant="primary"`), `Login` (`Button variant="secondary"`).

### Category chip row
Below header, horizontally scrollable, `Chip` components from `components/ui/chip.tsx`: leading icon-only `+` chip, then the 9 category chips (plain, no trailing `+` per screenshot — reference only shows `+` on hover affordance for some; keep simple: all plain chips), trailing chevron-right scroll affordance button.

### Top News section
`text-h1 font-bold` "Top News" heading, then a responsive grid of `NewsCard`s (1 col mobile / 2 col tablet / 3 col desktop, `gap-6`), 15 mock articles.

### Footer
`bg-foreground text-background` (dark) full-width band per reference. 4-column layout (`grid-cols-1 sm:grid-cols-4`): brand blurb ("biasly / Balanced news coverage powered by AI."), "Company" links (About, Careers, Press, Contact), "Help" links (Help Center, Guides, Privacy Policy, Terms of Service), "Connect" social icons (X/Twitter, LinkedIn, Instagram, YouTube via `lucide-react`). Bottom bar: "© 2026 Biasly News. All rights reserved."

### Visual/typography/spacing details
- Container: `mx-auto max-w-[1280px] px-6`, consistent across utility bar, header, main content, footer inner wrapper.
- Card image aspect ratio `aspect-video`, `rounded-t-lg` (already in `NewsCard`).
- Bias pill row uses existing `variant="pills"` — Left red (`bg-left-bias`), Center gray (`bg-muted`), Right blue (`bg-right-bias`), each showing `Left N%` / `Center N%` / `Right N%`.
- "N sources" caption: `text-caption text-text-secondary`, replaces the clock/bookmark row when `sourcesCount` is passed.
- Responsive: chip row scrolls horizontally on all breakpoints; grid collapses 3→2→1 columns; header nav should not overflow on small screens (acceptable to keep desktop-first per reference — reference itself is desktop-only, so mobile just needs to not visually break, not be pixel-perfect).

## Security requirements

None — fully static/presentational, no data fetching, no secrets, no server code, no forms that submit anywhere.

## Acceptance criteria

- `app/page.tsx` renders utility bar, header, category chips, "Top News" heading, and a 15-card responsive grid matching the reference's structure and content (categories/titles/regions/percentages/source counts).
- `components/layout/site-header.tsx` and `site-footer.tsx` render on every page via `app/layout.tsx`.
- `NewsCard` renders correctly both in its new home-page usage (`sourcesCount`, no excerpt) and unchanged in the existing design-system demo usage if kept anywhere — no breaking prop changes (`excerpt`/`timeAgo`/`readTime` now optional, not removed).
- No TypeScript `any`, no unused code/props, no unrelated refactors to existing primitives beyond the described optional-prop change.
- Page is responsive down to mobile width without horizontal overflow of the page body (chip row scrolls internally instead).

## Checks to run

- `npm run typecheck`
- `npm run lint`
- `npm run build` (layout/route changes)

## Manual test steps

1. `npm run dev`
2. Open `http://localhost:3000`
3. Verify utility bar, header (logo, nav, Subscribe/Login), category chip row, and "Top News" heading render above a 3-column grid of 15 cards.
4. Verify each card shows image, info icon, "Category · Region", title, 3-segment bias pill row with correct colors/percentages, and "N sources" caption (no excerpt, no clock/bookmark row).
5. Verify footer renders with brand blurb, Company/Help link columns, social icons, and copyright line.
6. Resize the browser to mobile width (~375px) and confirm the grid collapses to 1 column, the chip row scrolls horizontally instead of wrapping/overflowing the page, and no element causes horizontal page scroll.
7. Confirm the design-system demo content that isn't part of the real home page (typography/buttons/chips swatches) has been removed from `app/page.tsx`.
