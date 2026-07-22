# For You Page — Design

Date: 2026-07-22
Status: Approved for planning

Scope: the final nav page — **For You** (`/for-you`). Follows the shared infra shipped
with Blindspot + Local (`ArticleGrid`, `SiteNav` active-state, the category feature).

## Problem

`/for-you` is the last dead nav link. It should be a personalized feed. There is Clerk
auth but no stored user preferences. Decision (from brainstorming): personalize by
**followed categories** stored in Clerk `publicMetadata`, reusing the `ARTICLE_CATEGORIES`
enum from the category feature.

## Decisions

- Interests are `publicMetadata.interests: string[]` on the Clerk user — a subset of
  `ARTICLE_CATEGORIES`. `publicMetadata` is readable server + client, writable server-side
  only (via `clerkClient().users.updateUserMetadata`), which fits: the feed reads it, a
  server action writes it.
- Clerk SDK is v7 (current): use `auth()` / `currentUser()` / `<Show>` (no Core-2 caveats).
- Signed-out users see a sign-in prompt, not a feed.
- Signed-in with no interests → interest picker. With interests → feed + edit affordance.

## Architecture

### Data

Extend `getAnalyzedArticles` options with `categories?: string[]` (multi-category), filtered
in JS (§21 gotcha), matching `analysis.category` against the set. Keep the existing single
`category` option. For You calls `getAnalyzedArticles({ categories: interests })`.

### Server action — `app/for-you/actions.ts` (`"use server"`)

`saveInterests(interests: string[])`:

1. `const { isAuthenticated, userId } = await auth();` — throw if not authenticated
   (server actions are public endpoints; §21 — verify auth).
2. Validate: keep only values in `ARTICLE_CATEGORIES` (drop anything else); de-dupe.
3. `const client = await clerkClient(); await client.users.updateUserMetadata(userId, { publicMetadata: { interests } });`
4. `revalidatePath("/for-you")` so the RSC re-renders with the new feed.

### Page — `app/for-you/page.tsx` (RSC)

1. `const { isAuthenticated } = await auth();`
   - Signed-out → a centered prompt with `SignInButton` (modal): "Sign in to build your
     personalized feed."
2. Signed-in: `const user = await currentUser();` read
   `interests = Array.isArray(user?.publicMetadata?.interests) ? user.publicMetadata.interests as string[] : []`.
3. Render `<InterestsBar initial={interests} allCategories={ARTICLE_CATEGORIES} />` (client).
4. If `interests.length > 0`: `getAnalyzedArticles({ categories: interests })` → `ArticleGrid`.
   Else: an `ArticleGrid` empty-state prompting the user to pick interests (no query needed).

### InterestsBar — `components/for-you/interests-bar.tsx` (`"use client"`)

- Props: `initial: string[]`, `allCategories: readonly string[]`.
- State: `selected` (Set), `editing` (boolean; starts `true` when `initial` is empty).
- Collapsed (has interests, not editing): show selected category chips + an "Edit interests"
  button that sets `editing`.
- Editing: show all categories as toggle chips (selected = filled, unselected = muted);
  "Save" and (if `initial` non-empty) "Cancel". Save calls the `saveInterests` server
  action inside `useTransition`, then `router.refresh()` on success; disable the button
  while pending. PostHog `interests_saved` capture with the chosen categories.
- Import the server action directly from `app/for-you/actions.ts`.

## Data flow

1. RSC reads interests from Clerk → renders bar + (interest-filtered) feed.
2. User edits chips → Save → server action validates + writes `publicMetadata` + revalidates.
3. Revalidation + `router.refresh()` re-renders the RSC with the updated feed.

## Error handling

- Unauthenticated server-action call throws (defense-in-depth even though the UI hides it).
- Invalid/unknown categories are filtered out before saving.
- Empty selection is allowed (clears the feed back to the picker prompt).
- Clerk write failure surfaces as a thrown error; the bar keeps the prior selection (no
  optimistic mutation of `publicMetadata`).

## Security (AGENTS.md §21)

- Server action verifies auth and validates input against the fixed enum. `clerkClient` and
  `CLERK_SECRET_KEY` stay server-side. No Supabase writes, no new secrets, no admin routes.
- Interests are non-sensitive personalization data in `publicMetadata` (intentionally
  client-readable).

## Testing

- `npm run typecheck`, `npm run lint`, `npm run build`.
- Manual: signed-out `/for-you` shows the sign-in prompt; sign in → pick interests → Save →
  feed filters to those categories; reload persists; "Edit interests" reopens the picker;
  the For You nav link is active.

## Out of scope (YAGNI)

- Per-source or per-keyword following (categories only).
- Ranking/recommendation beyond category membership.
- Syncing interests to Supabase (Clerk `publicMetadata` is the store).
