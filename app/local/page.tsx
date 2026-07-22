import { ArticleGrid } from "@/components/ui/article-grid";
import { RegionChips } from "@/components/ui/region-chips";
import {
  getAnalyzedArticles,
  getRegions,
} from "@/lib/supabase/queries/articles";
import { toNewsCardData } from "@/lib/supabase/mappers";

async function Local({
  searchParams,
}: {
  searchParams: Promise<{ region?: string }>;
}) {
  const { region } = await searchParams;
  const [articles, regions] = await Promise.all([
    getAnalyzedArticles({ region }),
    getRegions(),
  ]);
  const cards = articles.map(toNewsCardData);

  // No source has a region tagged yet — guide the operator rather than showing
  // an empty picker.
  if (regions.length === 0) {
    return (
      <main className="mx-auto flex w-full max-w-[1280px] flex-col gap-8 px-6 py-8">
        <h1 className="text-h1 font-bold text-foreground">Local</h1>
        <div className="flex flex-col items-center gap-2 rounded-lg border border-border py-16 text-center">
          <p className="text-h4 font-semibold text-foreground">
            No regions configured yet
          </p>
          <p className="max-w-md text-body-sm text-text-secondary">
            Set a <code>region</code> on your sources in Supabase to group the
            feed by location.
          </p>
        </div>
      </main>
    );
  }

  return (
    <main className="mx-auto flex w-full max-w-[1280px] flex-col gap-8 px-6 py-8">
      <RegionChips regions={regions} active={region} />

      <section className="flex flex-col gap-4">
        <h1 className="text-h1 font-bold text-foreground">
          {region ? region : "Local"}
        </h1>

        <ArticleGrid
          cards={cards}
          emptyTitle={
            region ? `No articles from ${region}` : "No analyzed articles yet"
          }
          emptyBody={
            region
              ? "Try another region or clear the filter."
              : "Run the scraping and analysis pipeline to populate the feed."
          }
        />
      </section>
    </main>
  );
}

export default Local;
