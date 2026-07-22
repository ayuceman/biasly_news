-- biasly seed data. Run AFTER schema.sql in the Supabase SQL Editor.
-- Idempotent via ON CONFLICT on the unique columns.

-- ---------------------------------------------------------------------------
-- Active sources (homepages only — DB is the source of truth for source URLs,
-- per AGENTS.md §7; do NOT hardcode these in scraping code).
-- ---------------------------------------------------------------------------
insert into public.sources (name, listing_url, active) values
  ('Reuters',       'https://www.reuters.com/',        true),
  ('NPR',           'https://www.npr.org/',            true),
  ('BBC News',      'https://www.bbc.com/news',        true),
  ('Fox News',      'https://www.foxnews.com/',        true),
  ('The Guardian',  'https://www.theguardian.com/us',  true)
on conflict (listing_url) do nothing;

-- ---------------------------------------------------------------------------
-- OPTIONAL demo article + analysis so the wired UI renders end-to-end before
-- the scraping/AI pipeline exists. Safe to delete once real data flows in.
-- ---------------------------------------------------------------------------
insert into public.articles (source_id, original_url, canonical_url, title, image_url, published_at, raw_text, analyzed_at)
select
  s.id,
  'https://www.reuters.com/demo/trump-iran-peace-proposal',
  'https://www.reuters.com/demo/trump-iran-peace-proposal',
  'Trump Sends Iran Revised Peace Proposal With Tougher Terms: Report',
  'https://picsum.photos/seed/trump-iran-peace-proposal/1200/700',
  timestamptz '2026-05-31 09:00:00+00',
  E'The Trump administration has sent Iran a revised nuclear deal proposal that includes tougher terms on uranium enrichment and stronger verification measures, according to a report published Saturday.\n\nThe new proposal, delivered through intermediaries in Oman, requires Iran to halt all uranium enrichment on its soil and ship its stockpile of enriched uranium out of the country. It also demands unrestricted access for international inspectors to all Iranian nuclear facilities, including military sites.\n\nIran has not yet officially responded to the proposal. However, Iranian officials said last week that any deal must respect Iran''s right to peaceful nuclear energy and include the lifting of all U.S. sanctions.\n\nThe revised proposal comes after several rounds of indirect talks between U.S. and Iranian officials failed to produce a breakthrough. European allies have urged both sides to continue negotiations.',
  timestamptz '2026-05-31 10:00:00+00'
from public.sources s
where s.listing_url = 'https://www.reuters.com/'
on conflict (original_url) do nothing;

insert into public.article_analyses (
  article_id, summary, sentiment_score, sentiment_label, bias_score, bias_label,
  left_percentage, center_percentage, right_percentage, confidence,
  framing_notes, loaded_terms, disclaimer, model
)
select
  a.id,
  'The Trump administration sent Iran a revised nuclear proposal with tougher enrichment limits and stronger inspections. Iran has not formally responded and insists on sanctions relief. Talks follow earlier rounds that failed to reach a deal.',
  -0.2,
  'neutral',
  round(((49 - 20)::numeric / 100), 2),
  'right',
  20, 31, 49, 0.62,
  'Coverage emphasizes a firm negotiating posture and verification demands; framing leans toward a security-first reading of the proposal.',
  array['tougher terms', 'take-it-or-leave-it', 'maximum pressure'],
  'AI-estimated political framing, not objective truth. Based on article text evidence only.',
  'demo-seed'
from public.articles a
where a.original_url = 'https://www.reuters.com/demo/trump-iran-peace-proposal'
on conflict (article_id) do nothing;
