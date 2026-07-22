# Design System Implementation

## Goal

Implement the biasly design system foundation (brand, typography, colors, spacing, icons, buttons, chips, bias meter, card, shadows, border radius, grid) shown in the attached UI reference, so all future pages/components are built on consistent tokens and primitives. This is foundation work — no news/article pages are being built yet.

## Skills read

- `AGENTS.md` (root workflow, tech stack, "do not overbuild" rule, section 21 code standards)
- No `.agents/skills/*` apply directly (this isn't Clerk/Supabase/Oxylabs/ai-sdk); per AGENTS.md section 3, Tailwind/shadcn work uses existing project patterns + package docs.
- Read Next.js font docs (`node_modules/next/dist/docs/01-app/01-getting-started/13-fonts.md`) to confirm `next/font/google` usage is unchanged in this Next 16 version.

## Existing code inspected

- `app/layout.tsx` — currently loads Geist/Geist Mono via `next/font/google`, sets `--font-geist-sans`/`--font-geist-mono` CSS vars.
- `app/globals.css` — Tailwind v4 `@import "tailwindcss"` + `@theme inline` block, only `--color-background`/`--color-foreground` tokens defined, dark mode via `prefers-color-scheme`.
- `app/page.tsx` — placeholder `<div>Home</div>`.
- `package.json` — fresh `create-next-app` (Next 16.2.10, React 19.2.4, Tailwind v4). No shadcn/ui, no `components.json`, no Radix, no `clsx`/`cva` yet.
- No `components/` directory yet.

## Decisions / assumptions

- Initialize shadcn/ui now (per user confirmation) — `components.json`, `lib/utils.ts` (`cn` helper), and shadcn's `Button` primitive, restyled via our own CSS variables/Tailwind theme to match the reference instead of default shadcn styling.
- Poppins is the only typeface in the reference (headings and body both use it per the typography panel) — load via `next/font/google` with weights 400/500/600/700, expose as `--font-poppins`, set as the default sans font for the whole app (replacing Geist).
- Tokens (colors, spacing scale, radii, shadows) go into `app/globals.css` under `@theme inline` as CSS variables so they're usable both as Tailwind utility classes (e.g. `bg-primary`, `rounded-md`, `shadow-sm`) and as raw `var(--...)` where needed.
- Dark mode: reference is light-only; keep the existing `prefers-color-scheme` dark override structure in place but only invert `background`/`foreground`-style neutrals, not brand/semantic colors (brand black/white and semantic bias colors stay fixed — flip only surface/text-secondary/border/divider neutrals for dark backgrounds). Do not attempt a pixel-perfect dark variant beyond that — out of scope for this reference.
- Components built as reusable primitives in `components/ui/`: `Button` (shadcn-based, variants primary/secondary/text × states default/hover/outline/disabled), `Chip` (category chip with optional `+` icon, e.g. "World Cup +"), `BiasMeter` (3-segment left/center/right bar with percentages), and a `NewsCard` example matching the reference's card (image, category · region eyebrow, title, excerpt, bias meter row, footer with clock/read-time icons).
- Icons: reference uses a simple line-icon set (2px stroke, rounded caps — menu, search, bookmark, clock, info, share, external-link, calendar, trend-up, tag, user, bell, sliders, check-circle, more). Use `lucide-react` (already the de-facto icon set for shadcn/ui, MIT, matches the described style) rather than hand-drawing SVGs.
- `app/page.tsx` will be updated to render a small style-guide/demo view (buttons, chips, bias meter, one card) so the system is visually verifiable — not the real home page (that's a separate future task per AGENTS.md section 1 build list).

## Files likely to change

- `app/globals.css` — full token set (brand colors, typography scale, spacing, shadows, radii) via `@theme inline`
- `app/layout.tsx` — swap Geist → Poppins font loading
- `components.json` — new, shadcn config
- `lib/utils.ts` — new, `cn()` helper
- `components/ui/button.tsx` — new, shadcn Button restyled to brand
- `components/ui/chip.tsx` — new
- `components/ui/bias-meter.tsx` — new
- `components/ui/news-card.tsx` — new
- `app/page.tsx` — temporary style-guide demo rendering the above
- `package.json` — new deps: `lucide-react`, `class-variance-authority`, `clsx`, `tailwind-merge`, `@radix-ui/react-slot` (shadcn Button deps)

## Implementation requirements

### Typography (Poppins)
- H1 32px / Bold / line-height 1.2 — page/screen title
- H2 24px / SemiBold / 1.3 — section title
- H3 20px / SemiBold / 1.3 — card/module title
- H4 16px / Medium / 1.4 — subheading
- Body Large 16px / Regular / 1.6 — important content
- Body Medium 14px / Regular / 1.6 — body text
- Body Small 13px / Regular / 1.6 — supporting text
- Caption 11px / Regular / 1.4 — labels, meta text

### Colors
- Primary: text-primary `#0D0D0F`, text-secondary `#6B7280`, surface `#F6F6F6`
- Semantic: left-bias `#B42318`, center-bias `#E5E7EB` (bg) / neutral text, right-bias `#1D4ED8`
- Neutrals: bg-primary `#FFFFFF`, bg-secondary `#F0F0F0`, border `#E5E7EB`, divider `#E5E7EB`

### Spacing
4px base unit scale: 4, 8, 16, 24, 32, 40, 64px

### Border radius
Small 4px, Medium 8px, Large 12px, Full 9999px

### Shadows
- Small: `0 1px 2px rgba(0,0,0,0.05)`
- Medium: `0 4px 12px rgba(0,0,0,0.08)`
- Large: `0 12px 24px rgba(0,0,0,0.12)`

### Grid
Container max-width 1280px, 12 columns, 24px gutter, 24px margin

### Buttons
Three kinds × four states each:
- Primary: default = solid black bg / white text; hover = slightly lighter/darker black per reference (interpret as `#1a1a1a`→ hover uses secondary-gray tone per swatch, verify visually against reference then adjust); outline = white bg, black border+text; disabled = gray bg, gray text, `pointer-events-none opacity-50`
- Secondary: default/hover/outline all white bg with border, black text (hover = subtle bg tint); disabled = grayed out
- Text: default = black text no bg; hover = blue-ish/link-colored text (reference shows blue on hover) — use primary text color default, a link/accent blue on hover; no outline/disabled variants shown (omit or mark `not applicable`)

### Chips / category tags
Pill-shaped (full radius), `bg-secondary`, `text-primary`, small padding, optional trailing `+` icon (lucide `Plus`), e.g. "World Cup", "IPL", "Business & Markets", "More +"

### Bias meter
Three-segment horizontal bar: Left % (red bg, white text), Center % (light gray bg, dark text), Right % (blue bg, white text). Segments sized proportionally to their percentage, rounded ends on the outer edges only. Include a 0%–50%–100% scale label row below when used in the full "BIAS METER" panel context; the compact card version (as in `NewsCard`) omits the scale row and shows just the three segments with percentages inside.

### Card
Image (rounded top corners, `object-cover`), eyebrow row ("Category · Region"), H3 title (2-line clamp), body-small excerpt (2-line clamp), compact bias meter row, footer row with clock icon + relative time and bookmark icon + read time, `info` icon button top-right on the image, card uses `shadow-small`, `rounded-medium` (or `-large`, verify against reference), 1px border in `--color-border`.

## Security requirements

None — this is presentational-only, no data fetching, no secrets, no server code involved.

## Acceptance criteria

- `app/globals.css` defines all tokens listed above as CSS variables consumable via Tailwind v4 `@theme inline` (i.e. `bg-primary`, `text-primary`, `rounded-md`, etc. resolve correctly).
- Poppins loads via `next/font/google` and is the default body font app-wide; Geist fonts removed.
- `components/ui/button.tsx` renders all primary/secondary/text variants with correct default/hover/outline/disabled visuals matching the reference swatch.
- `components/ui/chip.tsx`, `components/ui/bias-meter.tsx`, `components/ui/news-card.tsx` exist and visually match the reference's "CARD EXAMPLE" and "BIAS METER" panels.
- `app/page.tsx` renders a demo screen showing buttons (all variants/states), chips, the full bias meter panel, and one news card — enough to visually verify the system in a browser.
- No TypeScript `any`, no unused code, no unrelated refactors.

## Checks to run

- `npm install` (new deps)
- `npm run typecheck`
- `npm run lint`
- `npm run build` (config/deps changed — shadcn init touches `next.config`/`tsconfig` path aliases potentially)

## Manual test steps

1. `npm run dev`
2. Open `http://localhost:3000`
3. Verify Poppins font is applied (Network tab shows a woff2 font request self-hosted, not from fonts.googleapis.com).
4. Verify button variants/states render and hover states work (mouse over each button).
5. Verify the bias meter shows Left 25% (red) / Center 50% (gray) / Right 25% (blue) proportional segments.
6. Verify the demo news card shows image, title, excerpt, bias meter, and footer icons matching the reference layout.
7. Resize the browser to a narrow width to confirm the demo layout doesn't break (basic responsiveness, not pixel-perfect mobile spec since reference is desktop-only).
