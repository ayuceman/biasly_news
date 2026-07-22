-- biasly seed data. Run AFTER schema.sql in the Supabase SQL Editor.
-- Idempotent via ON CONFLICT on the unique columns.

-- ---------------------------------------------------------------------------
-- Active sources (homepages only — DB is the source of truth for source URLs,
-- per AGENTS.md §7; do NOT hardcode these in scraping code).
-- ---------------------------------------------------------------------------
insert into public.sources (name, listing_url, active, region) values
  ('Reuters',       'https://www.reuters.com/',        true, 'International'),
  ('NPR',           'https://www.npr.org/',            true, 'United States'),
  ('BBC News',      'https://www.bbc.com/news',        true, 'United Kingdom'),
  ('Fox News',      'https://www.foxnews.com/',        true, 'United States'),
  ('The Guardian',  'https://www.theguardian.com/us',  true, 'United Kingdom')
on conflict (listing_url) do nothing;

-- Existing rows (inserted before the region column) — tag their region.
update public.sources set region = 'International'  where name = 'Reuters'      and region is null;
update public.sources set region = 'United States'  where name in ('NPR', 'Fox News') and region is null;
update public.sources set region = 'United Kingdom' where name in ('BBC News', 'The Guardian') and region is null;

-- ---------------------------------------------------------------------------
-- Nepal sources. General English-language news + share-market news portals.
-- listing_url is the homepage / news-listing entry page (story cards live here);
-- the scraper's generic extractor handles these like any other source.
-- NOTE: share-market outlets (ShareSansar, Merolagani) carry non-political
-- market news — political framing will mostly resolve to center/unclear.
-- ---------------------------------------------------------------------------
insert into public.sources (name, listing_url, active, region) values
  ('The Kathmandu Post',    'https://kathmandupost.com/',                     true, 'Nepal'),
  ('OnlineKhabar English',  'https://english.onlinekhabar.com/',              true, 'Nepal'),
  ('The Himalayan Times',   'https://thehimalayantimes.com/',                 true, 'Nepal'),
  ('myRepublica',           'https://myrepublica.nagariknetwork.com/',        true, 'Nepal'),
  ('ShareSansar',           'https://www.sharesansar.com/category/latest-news', true, 'Nepal'),
  ('Merolagani',            'https://merolagani.com/NewsList.aspx',           true, 'Nepal')
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
