import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import type {
  Article,
  ArticleAnalysis,
  ArticleWithAnalysis,
  RelatedArticle,
  Source,
} from "@/lib/supabase/types";

type SourceEmbed = Pick<Source, "id" | "name" | "logo_url" | "region">;

// Row shape returned by the joined selects below. Supabase's query builder types
// embedded relations as arrays; at runtime a to-one relation is a single object,
// so we normalize both source and analysis defensively.
type JoinedRow = Article & {
  source: SourceEmbed | SourceEmbed[] | null;
  article_analyses: ArticleAnalysis | ArticleAnalysis[] | null;
};

const SELECT = `
  id, source_id, original_url, canonical_url, title, image_url,
  published_at, raw_text, scraped_at, analyzed_at,
  source:sources ( id, name, logo_url, region ),
  article_analyses (
    id, article_id, summary, sentiment_score, sentiment_label, bias_score,
    bias_label, left_percentage, center_percentage, right_percentage,
    confidence, framing_notes, loaded_terms, disclaimer, model, category, created_at
  )
`;

// Detail view additionally needs the analysis `embedding` to fetch related
// articles (§20). The feed SELECT deliberately omits it (1536 floats/card).
const DETAIL_SELECT = SELECT.replace(
  "model, created_at",
  "model, created_at, embedding"
);

function firstAnalysis(
  row: JoinedRow
): ArticleAnalysis | null {
  const a = row.article_analyses;
  if (!a) return null;
  return Array.isArray(a) ? a[0] ?? null : a;
}

function firstSource(row: JoinedRow): SourceEmbed | null {
  const s = row.source;
  if (!s) return null;
  return Array.isArray(s) ? s[0] ?? null : s;
}

function toArticleWithAnalysis(
  row: JoinedRow
): ArticleWithAnalysis | null {
  const analysis = firstAnalysis(row);
  if (!analysis) return null; // "has analysis" filter applied in JS (§21 gotcha)
  const { article_analyses: _analyses, source: _source, ...article } = row;
  void _analyses;
  void _source;
  return { ...article, source: firstSource(row), analysis };
}

export type GetAnalyzedArticlesOptions = {
  limit?: number;
  /** Filter to a single category (applied in JS — §21 joined-table gotcha). */
  category?: string;
  /** Filter to any of these categories — For You interests (applied in JS, §21). */
  categories?: string[];
  /** Filter to a single source region (applied in JS — §21 joined-table gotcha). */
  region?: string;
};

/**
 * Analyzed articles for the home feed, newest first. Only articles that have
 * an analysis row are returned (filtered in JS, not via a joined-table .eq()).
 * Optional `category` / `region` narrow the feed — also filtered in JS for the
 * same reason (never `.eq('article_analyses.category', …)` / `.eq('sources.region', …)`).
 */
export async function getAnalyzedArticles(
  options: GetAnalyzedArticlesOptions = {}
): Promise<ArticleWithAnalysis[]> {
  const { limit = 60, category, categories, region } = options;
  const supabase = createSupabaseServerClient();
  const { data, error } = await supabase
    .from("articles")
    .select(SELECT)
    .order("published_at", { ascending: false })
    .limit(limit);

  if (error) {
    throw new Error(`Failed to load articles: ${error.message}`);
  }

  let articles = ((data as unknown as JoinedRow[] | null) ?? [])
    .map(toArticleWithAnalysis)
    .filter((a): a is ArticleWithAnalysis => a !== null);

  if (category) articles = articles.filter((a) => a.analysis.category === category);
  if (categories && categories.length > 0) {
    const set = new Set(categories);
    articles = articles.filter((a) => set.has(a.analysis.category ?? ""));
  }
  if (region) articles = articles.filter((a) => a.source?.region === region);
  return articles;
}

// A source article is a Blindspot candidate when its AI framing leans strongly to
// one side. Not a cross-source coverage count (we don't collect those) — an
// AI-estimated per-article lean.
export const BLINDSPOT_LEAN_THRESHOLD = 60;

/**
 * Articles split by strong political lean for the Blindspot page. `left` holds
 * articles framed strongly left (`left_percentage >= threshold`), shown as
 * "Missed by the Right"; `right` holds strongly-right ones, shown as "Missed by
 * the Left". Each list is sorted by lean strength (desc) and capped at `perColumn`.
 * Filtering/sorting is done in JS (§21 joined-table gotcha).
 */
export async function getBlindspotArticles(
  perColumn = 12
): Promise<{ left: ArticleWithAnalysis[]; right: ArticleWithAnalysis[] }> {
  const articles = await getAnalyzedArticles({ limit: 200 });

  const left = articles
    .filter((a) => (a.analysis.left_percentage ?? 0) >= BLINDSPOT_LEAN_THRESHOLD)
    .sort((a, b) => (b.analysis.left_percentage ?? 0) - (a.analysis.left_percentage ?? 0))
    .slice(0, perColumn);

  const right = articles
    .filter((a) => (a.analysis.right_percentage ?? 0) >= BLINDSPOT_LEAN_THRESHOLD)
    .sort((a, b) => (b.analysis.right_percentage ?? 0) - (a.analysis.right_percentage ?? 0))
    .slice(0, perColumn);

  return { left, right };
}

/**
 * Distinct non-null source regions, ordered alphabetically. Powers the Local page
 * region chips — only regions actually tagged on a source appear.
 */
export async function getRegions(): Promise<string[]> {
  const supabase = createSupabaseServerClient();
  const { data, error } = await supabase
    .from("sources")
    .select("region")
    .not("region", "is", null);

  if (error) {
    throw new Error(`Failed to load regions: ${error.message}`);
  }

  const regions = new Set<string>();
  for (const row of (data as Array<{ region: string | null }> | null) ?? []) {
    if (row.region) regions.add(row.region);
  }
  return [...regions].sort((a, b) => a.localeCompare(b));
}

/**
 * Distinct analysis categories present across analyzed articles, ordered by how
 * many articles carry each (most first). Powers the home-page category chips —
 * only categories that actually have articles appear. Null categories (not yet
 * backfilled) are ignored.
 */
export async function getDistinctCategories(): Promise<string[]> {
  const supabase = createSupabaseServerClient();
  const { data, error } = await supabase
    .from("article_analyses")
    .select("category")
    .not("category", "is", null);

  if (error) {
    throw new Error(`Failed to load categories: ${error.message}`);
  }

  const counts = new Map<string, number>();
  for (const row of (data as Array<{ category: string | null }> | null) ?? []) {
    const c = row.category;
    if (!c) continue;
    counts.set(c, (counts.get(c) ?? 0) + 1);
  }

  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([category]) => category);
}

/**
 * A single analyzed article by UUID, with its analysis and source.
 * Returns null when the article does not exist or has no analysis.
 */
export async function getArticleWithAnalysis(
  id: string
): Promise<ArticleWithAnalysis | null> {
  const supabase = createSupabaseServerClient();
  const { data, error } = await supabase
    .from("articles")
    .select(DETAIL_SELECT)
    .eq("id", id)
    .maybeSingle();

  if (error) {
    throw new Error(`Failed to load article ${id}: ${error.message}`);
  }
  if (!data) return null;

  return toArticleWithAnalysis(data as unknown as JoinedRow);
}

/**
 * Related articles by cosine similarity (§20). Calls the `get_related_articles`
 * Postgres function — supabase-js cannot order by pgvector `<=>` in the query
 * builder. Uses the service-role client. `embedding` is the current article's
 * pgvector literal (as returned by the detail query). Returns up to `limit`
 * analyzed articles, excluding the current one, most similar first.
 */
export async function getRelatedArticles(
  articleId: string,
  embedding: string,
  limit = 5
): Promise<RelatedArticle[]> {
  const admin = createSupabaseAdminClient();
  const { data, error } = await admin.rpc("get_related_articles", {
    query_embedding: embedding,
    exclude_id: articleId,
    match_count: limit,
  });

  if (error) {
    throw new Error(`Failed to load related articles for ${articleId}: ${error.message}`);
  }

  return (data as RelatedArticle[] | null) ?? [];
}
