-- biasly database schema (AGENTS.md §7)
-- Source of truth for app data. Idempotent: safe to re-run in the Supabase SQL Editor.

-- gen_random_uuid() lives in pgcrypto (available by default on Supabase).
create extension if not exists pgcrypto;

-- pgvector powers embeddings + related-articles similarity search (§20).
create extension if not exists vector;

-- ---------------------------------------------------------------------------
-- sources: news source homepages (scraping entry points). §7, §8, §11
-- ---------------------------------------------------------------------------
create table if not exists public.sources (
  id              uuid primary key default gen_random_uuid(),
  name            text not null,
  listing_url     text not null unique,   -- homepage URL, entry page only
  parser_strategy text,                    -- optional source-specific strategy
  active          boolean not null default true,
  logo_url        text,
  created_at      timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- articles: scraped article detail pages, append-only. §7, §10, §13
-- ---------------------------------------------------------------------------
create table if not exists public.articles (
  id            uuid primary key default gen_random_uuid(),
  source_id     uuid references public.sources(id) on delete set null,
  original_url  text not null unique,      -- dedupe key
  canonical_url text,
  title         text not null,
  image_url     text not null,             -- required before saving
  published_at  timestamptz not null,      -- required before saving
  raw_text      text,
  scraped_at    timestamptz not null default now(),
  analyzed_at   timestamptz                -- null until analysis is saved
);

create index if not exists articles_source_id_idx on public.articles (source_id);
create index if not exists articles_published_at_idx on public.articles (published_at desc);

-- ---------------------------------------------------------------------------
-- article_analyses: one AI analysis per article. §7, §19, §20
-- ---------------------------------------------------------------------------
create table if not exists public.article_analyses (
  id                uuid primary key default gen_random_uuid(),
  article_id        uuid not null unique references public.articles(id) on delete cascade,
  summary           text,
  sentiment_score   numeric,               -- -1 to 1
  sentiment_label   text,                  -- positive / neutral / negative
  bias_score        numeric,               -- -1 to 1, (right% - left%) / 100
  bias_label        text,                  -- left / center / right / mixed / unclear
  left_percentage   numeric,               -- 0-100
  center_percentage numeric,               -- 0-100
  right_percentage  numeric,               -- 0-100
  confidence        numeric,               -- 0 to 1
  framing_notes     text,
  loaded_terms      text[],
  disclaimer        text,
  model             text,
  embedding         vector(1536),          -- OpenAI text-embedding-3-small (§20)
  created_at        timestamptz not null default now(),
  constraint article_analyses_left_pct_range check (left_percentage is null or (left_percentage >= 0 and left_percentage <= 100)),
  constraint article_analyses_center_pct_range check (center_percentage is null or (center_percentage >= 0 and center_percentage <= 100)),
  constraint article_analyses_right_pct_range check (right_percentage is null or (right_percentage >= 0 and right_percentage <= 100)),
  constraint article_analyses_sentiment_range check (sentiment_score is null or (sentiment_score >= -1 and sentiment_score <= 1)),
  constraint article_analyses_bias_range check (bias_score is null or (bias_score >= -1 and bias_score <= 1)),
  constraint article_analyses_confidence_range check (confidence is null or (confidence >= 0 and confidence <= 1))
);

-- Existing databases: add the embedding column if the table predates §20.
alter table public.article_analyses
  add column if not exists embedding vector(1536);

-- IVFFlat cosine index for related-articles similarity search (§20).
create index if not exists article_analyses_embedding_idx
  on public.article_analyses using ivfflat (embedding vector_cosine_ops)
  with (lists = 100);

-- ---------------------------------------------------------------------------
-- logs: pipeline run logging. §9, §16
-- ---------------------------------------------------------------------------
create table if not exists public.logs (
  id         uuid primary key default gen_random_uuid(),
  level      text,                          -- info / warn / error
  event      text,
  message    text,
  context    jsonb,
  created_at timestamptz not null default now()
);

create index if not exists logs_created_at_idx on public.logs (created_at desc);

-- ---------------------------------------------------------------------------
-- oxylabs_schedules: one schedule per active source homepage. §18
-- oxylabs_schedule_id is TEXT — 64-bit IDs exceed JS number precision.
-- ---------------------------------------------------------------------------
create table if not exists public.oxylabs_schedules (
  id                  uuid primary key default gen_random_uuid(),
  source_id           uuid references public.sources(id) on delete cascade,
  oxylabs_schedule_id text,                 -- string, never a parsed number
  cron                text,
  active              boolean not null default true,
  created_at          timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- oxylabs_schedule_runs: per-run/per-job status from /runs. §18
-- ---------------------------------------------------------------------------
create table if not exists public.oxylabs_schedule_runs (
  id             uuid primary key default gen_random_uuid(),
  schedule_id    uuid references public.oxylabs_schedules(id) on delete cascade,
  oxylabs_job_id text,                       -- string, precision-safe
  result_status  text,                       -- done / pending / faulted
  ran_at         timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Row Level Security (Supabase skill: RLS on every table in exposed schema).
-- Public content tables get anon/authenticated SELECT. Operational tables get
-- RLS enabled with NO public policy (deny to anon/authenticated); the
-- service-role client bypasses RLS for the pipeline.
-- ---------------------------------------------------------------------------
alter table public.sources               enable row level security;
alter table public.articles              enable row level security;
alter table public.article_analyses      enable row level security;
alter table public.logs                  enable row level security;
alter table public.oxylabs_schedules     enable row level security;
alter table public.oxylabs_schedule_runs enable row level security;

drop policy if exists "public read sources" on public.sources;
create policy "public read sources" on public.sources
  for select to anon, authenticated using (true);

drop policy if exists "public read articles" on public.articles;
create policy "public read articles" on public.articles
  for select to anon, authenticated using (true);

drop policy if exists "public read article_analyses" on public.article_analyses;
create policy "public read article_analyses" on public.article_analyses
  for select to anon, authenticated using (true);

-- logs, oxylabs_schedules, oxylabs_schedule_runs: intentionally no policy.

-- ---------------------------------------------------------------------------
-- get_related_articles: cosine-similarity related articles for the details
-- page (§20). SECURITY INVOKER (default) — reads only already-public tables.
-- Orders by pgvector cosine distance (<=>); supabase-js cannot express this in
-- the query builder, so the details page calls this via .rpc().
-- ---------------------------------------------------------------------------
create or replace function public.get_related_articles(
  query_embedding vector(1536),
  exclude_id uuid,
  match_count int default 5
)
returns table (
  id                uuid,
  title             text,
  image_url         text,
  published_at      timestamptz,
  source_name       text,
  bias_label        text,
  left_percentage   numeric,
  center_percentage numeric,
  right_percentage  numeric,
  similarity        float
)
language sql
stable
as $$
  select
    a.id,
    a.title,
    a.image_url,
    a.published_at,
    s.name as source_name,
    an.bias_label,
    an.left_percentage,
    an.center_percentage,
    an.right_percentage,
    1 - (an.embedding <=> query_embedding) as similarity
  from public.article_analyses an
  join public.articles a on a.id = an.article_id
  left join public.sources s on s.id = a.source_id
  where an.embedding is not null
    and a.analyzed_at is not null
    and a.id <> exclude_id
  order by an.embedding <=> query_embedding
  limit match_count;
$$;
