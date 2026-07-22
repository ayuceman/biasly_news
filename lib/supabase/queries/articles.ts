import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import type {
  Article,
  ArticleAnalysis,
  ArticleWithAnalysis,
  RelatedArticle,
  Source,
} from "@/lib/supabase/types";

type SourceEmbed = Pick<Source, "id" | "name" | "logo_url">;

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
  source:sources ( id, name, logo_url ),
  article_analyses (
    id, article_id, summary, sentiment_score, sentiment_label, bias_score,
    bias_label, left_percentage, center_percentage, right_percentage,
    confidence, framing_notes, loaded_terms, disclaimer, model, created_at
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

/**
 * Analyzed articles for the home feed, newest first. Only articles that have
 * an analysis row are returned (filtered in JS, not via a joined-table .eq()).
 */
export async function getAnalyzedArticles(
  limit = 60
): Promise<ArticleWithAnalysis[]> {
  const supabase = createSupabaseServerClient();
  const { data, error } = await supabase
    .from("articles")
    .select(SELECT)
    .order("published_at", { ascending: false })
    .limit(limit);

  if (error) {
    throw new Error(`Failed to load articles: ${error.message}`);
  }

  return ((data as unknown as JoinedRow[] | null) ?? [])
    .map(toArticleWithAnalysis)
    .filter((a): a is ArticleWithAnalysis => a !== null);
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
