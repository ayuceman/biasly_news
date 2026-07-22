# For You Page

Design spec: `docs/superpowers/specs/2026-07-22-for-you-page-design.md`

## Goal

Make `/for-you` a personalized feed driven by followed categories stored in Clerk
`publicMetadata.interests` (a subset of `ARTICLE_CATEGORIES`).

- Signed-out → sign-in prompt.
- Signed-in, no interests → interest picker.
- Signed-in, with interests → feed filtered to those categories + "Edit interests".

## Skills read

- `.agents/skills/clerk` → `clerk-nextjs-patterns` (server-actions.md, server-vs-client.md):
  `auth()`/`currentUser()`, server-action auth, `<Show>`. SDK is v7 (current) — no Core-2 caveats.
- `node_modules/next/dist/docs/` — server actions, `revalidatePath`, RSC/client split.

## Existing code inspected

- `components/layout/site-nav.tsx` — `/for-you` already routed + active-state ready.
- `lib/ai/analysis-schema.ts` — `ARTICLE_CATEGORIES` (shared enum).
- `lib/supabase/queries/articles.ts` — `getAnalyzedArticles({ category })`, JS-side filter (§21).
- `components/ui/article-grid.tsx` — `ArticleGrid` (cards + empty state).
- `lib/supabase/mappers.ts` — `toNewsCardData`.
- `components/layout/site-header.tsx` — `SignInButton`/`Show` usage (Clerk v7).
- `app/layout.tsx` — `ClerkProvider` present; middleware in `proxy.ts`.

## Decisions / assumptions

- Interests stored in Clerk `publicMetadata.interests: string[]`; written server-side via
  `clerkClient().users.updateUserMetadata`.
- Reuse `ARTICLE_CATEGORIES` as the pickable set; validate against it before saving.
- Empty selection allowed (returns to picker prompt).
- No Supabase changes; no sync of interests to the DB.

## Files likely to change / add

- `lib/supabase/queries/articles.ts` — add `categories?: string[]` to
  `GetAnalyzedArticlesOptions` + JS-side multi-category filter.
- `app/for-you/actions.ts` (new, `"use server"`) — `saveInterests(interests)`.
- `app/for-you/page.tsx` (new, RSC).
- `components/for-you/interests-bar.tsx` (new, `"use client"`).

## Implementation requirements

1. `getAnalyzedArticles`: `categories?: string[]`; when non-empty, filter mapped articles to
   `categories.includes(a.analysis.category ?? "")`. Keep existing `category`/`region`.
2. `saveInterests(interests: string[])`: `await auth()`, throw if not authenticated; filter
   to `ARTICLE_CATEGORIES` + de-dupe; `await clerkClient()` then
   `users.updateUserMetadata(userId, { publicMetadata: { interests } })`; `revalidatePath("/for-you")`.
3. `/for-you` page: signed-out → centered `SignInButton` prompt; signed-in → read interests
   from `currentUser().publicMetadata`, render `InterestsBar`, and the interest-filtered
   `ArticleGrid` (or a "pick interests" empty state when none).
4. `InterestsBar` (`"use client"`): toggle chips for all categories; collapsed view with
   "Edit interests" when interests exist; Save via the server action in `useTransition` +
   `router.refresh()`; disable while pending; PostHog `interests_saved` capture.

## Security requirements (AGENTS.md §21)

- Server action verifies auth and validates input against the fixed enum. `clerkClient` and
  `CLERK_SECRET_KEY` stay server-side. No new secrets, no Supabase writes, no admin routes.

## Acceptance criteria

- Signed-out `/for-you` shows the sign-in prompt (no feed).
- Signed-in with no interests shows the picker; saving persists to Clerk and shows the feed.
- Feed contains only articles whose category is in the saved interests.
- Reload persists interests; "Edit interests" reopens the picker; For You nav link active.
- `npm run typecheck`, `npm run lint`, `npm run build` pass.

## Checks to run

- `npm run typecheck`
- `npm run lint`
- `npm run build`

## Manual test steps

1. `npm run dev`; open `/for-you` signed out → sign-in prompt.
2. Sign in → interest picker; select e.g. Politics + Technology → Save.
3. Feed shows only those categories; reload → interests persist.
4. Click "Edit interests" → change selection → Save → feed updates.
5. Header → For You link is active/underlined on `/for-you`.
