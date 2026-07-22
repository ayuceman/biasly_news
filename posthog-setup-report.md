# PostHog post-wizard report

The wizard completed a client-and-server PostHog integration for this Next.js App Router project. It installed `posthog-js` and `posthog-node`, initialized browser analytics and exception capture, added Clerk-based user identification and logout reset behavior, instrumented key reader conversion and engagement actions, captured server-side pipeline outcomes and exceptions with awaited delivery, configured the required environment variables, and verified the result with scoped linting, TypeScript, and a production build.

| Event | Description | File |
|---|---|---|
| `category_selected` | A visitor selects a news category from the home feed. | `components/ui/category-chips.tsx` |
| `article_opened` | A visitor opens an article from the home feed. | `components/ui/article-link.tsx` |
| `subscription_started` | A visitor starts the subscription flow from the site header. | `components/ui/tracked-subscribe-button.tsx` |
| `article_saved` | A signed-in reader selects the save action on an article. | `components/ui/article-actions.tsx` |
| `article_shared` | A signed-in reader selects the share action on an article. | `components/ui/article-actions.tsx` |
| `newsletter_subscription_submitted` | A reader submits the newsletter subscription form on an article. | `components/ui/newsletter-signup.tsx` |
| `scrape_pipeline_completed` | An authenticated administrative scrape request completes with its outcome counters. | `app/api/scrape/route.ts` |
| `analysis_pipeline_completed` | An authenticated administrative analysis request completes with its outcome counters. | `app/api/analyze/route.ts` |

## Next steps

We've built insights and a dashboard to monitor reader behavior and content operations:

- [Analytics basics dashboard](https://us.posthog.com/project/53409/dashboard/1883551)
- [Reader engagement funnel](https://us.posthog.com/project/53409/insights/wpvVlx5F)
- [Article opens by category](https://us.posthog.com/project/53409/insights/22Qw7ecm)
- [Subscription intent](https://us.posthog.com/project/53409/insights/ZUT5L3kH)
- [Article engagement actions](https://us.posthog.com/project/53409/insights/WQL7WSxA)
- [Pipeline completions](https://us.posthog.com/project/53409/insights/IBxIjBFu)

## Verify before merging

- [ ] Run a full production build and fix any lint or type errors introduced by the generated code.
- [ ] Run the test suite — call sites that were rewritten or instrumented may need updated mocks or fixtures.
- [ ] Add `NEXT_PUBLIC_POSTHOG_PROJECT_TOKEN` and `NEXT_PUBLIC_POSTHOG_HOST` to `.env.example` and any bootstrap scripts so collaborators know what to set.
- [ ] Wire source-map upload (`posthog-cli sourcemap` or the build pipeline's upload step) into CI so production stack traces de-minify.
- [ ] Confirm the returning-visitor path calls `identify` after Clerk restores the authenticated user session.

### Agent skill

We've left an agent skill folder in the project. This context can support further agent development in Claude Code and helps future changes follow current PostHog integration practices.
