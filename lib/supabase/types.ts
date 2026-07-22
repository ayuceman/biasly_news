// Hand-written database types matching supabase/schema.sql.
// Keep in sync with the schema (AGENTS.md §7, §20).

export type SentimentLabel = "positive" | "neutral" | "negative";
export type BiasLabel = "left" | "center" | "right" | "mixed" | "unclear";

export type Source = {
  id: string;
  name: string;
  listing_url: string;
  parser_strategy: string | null;
  active: boolean;
  logo_url: string | null;
  created_at: string;
};

export type Article = {
  id: string;
  source_id: string | null;
  original_url: string;
  canonical_url: string | null;
  title: string;
  image_url: string;
  published_at: string;
  raw_text: string | null;
  scraped_at: string;
  analyzed_at: string | null;
};

export type ArticleAnalysis = {
  id: string;
  article_id: string;
  summary: string | null;
  sentiment_score: number | null;
  sentiment_label: SentimentLabel | string | null;
  bias_score: number | null;
  bias_label: BiasLabel | string | null;
  left_percentage: number | null;
  center_percentage: number | null;
  right_percentage: number | null;
  confidence: number | null;
  framing_notes: string | null;
  loaded_terms: string[] | null;
  disclaimer: string | null;
  model: string | null;
  // pgvector column (§20). PostgREST returns it as a bracketed string literal
  // (e.g. "[0.1,0.2,...]"); only the details query selects it (never the feed).
  embedding?: string | null;
  created_at: string;
};

export type LogRow = {
  id: string;
  level: string | null;
  event: string | null;
  message: string | null;
  context: Record<string, unknown> | null;
  created_at: string;
};

export type OxylabsSchedule = {
  id: string;
  source_id: string | null;
  oxylabs_schedule_id: string | null;
  cron: string | null;
  active: boolean;
  created_at: string;
};

export type OxylabsScheduleRun = {
  id: string;
  schedule_id: string | null;
  oxylabs_job_id: string | null;
  result_status: string | null;
  ran_at: string;
};

// Shapes returned by the data-access queries (joined rows).
export type ArticleWithAnalysis = Article & {
  source: Pick<Source, "id" | "name" | "logo_url"> | null;
  analysis: ArticleAnalysis;
};

// One related article returned by the get_related_articles RPC (§20).
export type RelatedArticle = {
  id: string;
  title: string;
  image_url: string;
  published_at: string;
  source_name: string | null;
  bias_label: BiasLabel | string | null;
  left_percentage: number | null;
  center_percentage: number | null;
  right_percentage: number | null;
  similarity: number;
};
