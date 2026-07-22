# Clerk Authentication

## Goal

Add Clerk authentication to biasly so users can sign in / sign up and see their account, while all news pages stay public. Wire the auth UI into the existing site header ("Login" button) without changing the current layout or design language.

## Skills read

- `.agents/skills/clerk/SKILL.md` (router) — version detection
- `.agents/skills/clerk-setup/SKILL.md` — install, ClerkProvider placement, pitfalls
- `.agents/skills/clerk-nextjs-patterns/SKILL.md` — server vs client auth, middleware, `<Show>`
- Clerk Next.js quickstart (WebFetch) — current App Router setup
- `node_modules/next/dist/docs/.../file-conventions/proxy.md` — Next.js 16 `proxy.ts` convention

## Existing code inspected

- `package.json` — Next.js `16.2.10`, React `19.2.4`, `@clerk/nextjs` NOT yet installed. → current Clerk SDK (v7), current-SDK APIs (no Core 2 callouts).
- `app/layout.tsx` — root layout; `<body>` renders `<SiteHeader />`, content, `<SiteFooter />` directly. Uses Poppins font var.
- `components/layout/site-header.tsx` — top nav with a `<Button variant="primary">Subscribe</Button>` and `<Button variant="secondary">Login</Button>` (the Login button is the auth entry point).
- `components/ui/button.tsx` — shadcn-style Button (cva variants: primary/secondary/text/destructive) supporting `asChild`.
- `.env.local` — already contains `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` and `CLERK_SECRET_KEY` (test keys). No `clerk` CLI provisioning needed.
- `components.json` — shadcn/ui present.
- No `middleware.ts` / `proxy.ts` currently exists.

## Decisions / assumptions

1. **Current SDK, not Core 2.** Use `@clerk/nextjs` (v7), `<Show>`, `isAuthenticated`.
2. **Middleware file is `proxy.ts`** (Next.js 16 renamed `middleware.ts` → `proxy.ts`). Root-level, exports `clerkMiddleware()`.
3. **All routes stay public.** biasly is a public news site — home (`/`) and article pages (`/article/[id]`) must not require auth. `clerkMiddleware()` runs without a `createRouteMatcher` protect call, so auth is *available* everywhere but *enforced* nowhere. (Confirm at approval if any route should be gated.)
4. **Modal auth, not dedicated pages.** Use `<SignInButton mode="modal">` / `<SignUpButton mode="modal">` rather than building `/sign-in` and `/sign-up` routes — keeps it minimal and matches the header-button UX. No `NEXT_PUBLIC_CLERK_SIGN_IN_URL` etc. needed.
5. **Match existing design, no new dependency for theming.** Instead of adding `@clerk/ui` shadcn theme, reuse the existing shadcn `Button`: wrap the current "Login" button in `<SignInButton>` via `asChild`, keep "Subscribe" as-is, and show `<UserButton />` when signed in. This avoids overbuilding while staying on-brand.
6. **ClerkProvider inside `<body>`** (current-SDK requirement), wrapping header + content + footer so auth context is available to all.

## Files likely to change

- `package.json` / `package-lock.json` — add `@clerk/nextjs`.
- `app/layout.tsx` — wrap body children in `<ClerkProvider>`.
- `components/layout/site-header.tsx` — replace static "Login" button with Clerk `<Show>` + `<SignInButton>` / `<UserButton>`.
- `proxy.ts` (new, project root) — `clerkMiddleware()` + matcher.
- `.env.local` — already set; verify only, do not overwrite keys.

## Implementation requirements

1. `npm install @clerk/nextjs`.
2. Create `proxy.ts` at project root:
   ```ts
   import { clerkMiddleware } from '@clerk/nextjs/server'

   export default clerkMiddleware()

   export const config = {
     matcher: [
       // Skip Next internals and static files, run on everything else
       '/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)',
       // Always run on API routes
       '/(api|trpc)(.*)',
     ],
   }
   ```
3. In `app/layout.tsx`, import `ClerkProvider` from `@clerk/nextjs` and wrap the existing `<SiteHeader /> / content / <SiteFooter />` tree inside `<body>` (provider inside body, not around `<html>`). No other layout changes.
4. In `components/layout/site-header.tsx`, in the right-hand button cluster:
   - Keep `<Button variant="primary">Subscribe</Button>`.
   - Replace the static Login button with:
     ```tsx
     <Show when="signed-out">
       <SignInButton mode="modal">
         <Button variant="secondary">Login</Button>
       </SignInButton>
     </Show>
     <Show when="signed-in">
       <UserButton />
     </Show>
     ```
   - Import `Show`, `SignInButton`, `UserButton` from `@clerk/nextjs`.
   - `site-header.tsx` may need `"use client"` if `<Show>` requires a client boundary — verify against the installed SDK and add only if required.

## Security requirements

- `CLERK_SECRET_KEY` stays server-only; never import it or reference it in client components. Only `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` reaches the browser (handled internally by the SDK).
- Do not overwrite or print existing `.env.local` secret values.
- No auth logic in browser code beyond Clerk's own components/hooks.

## Acceptance criteria

- App builds and runs with Clerk installed; no missing-key warnings.
- Signed-out users see "Login" (modal opens on click) and "Subscribe"; home and article pages load without auth.
- After signing in, the header shows `<UserButton />` (avatar + menu) instead of "Login".
- `proxy.ts` present at root; auth context works site-wide; static assets and CSS still load (matcher excludes them).
- No use of the secret key in client code.

## Checks to run

- `npm run typecheck`
- `npm run lint`
- `npm run build` (config/server surface changed: new `proxy.ts`, provider in layout)

## Manual test steps

1. `npm run dev`.
2. Open `http://localhost:3000` — home page loads fully (cards, header, footer), "Login" + "Subscribe" visible.
3. Click **Login** → Clerk modal opens. Complete sign-up/sign-in with a test account.
4. After auth, header shows the user avatar (`<UserButton />`); open it and confirm "Sign out" works and returns to signed-out state.
5. Navigate to an article page (`/article/<id>`) while signed out — confirm it loads without redirect.
6. Confirm no console errors and CSS/images render (matcher not blocking assets).
