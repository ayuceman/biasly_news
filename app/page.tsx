import { ArticleGrid } from "@/components/ui/article-grid";
import { CategoryChips } from "@/components/ui/category-chips";
import {
  getAnalyzedArticles,
  getDistinctCategories,
} from "@/lib/supabase/queries/articles";
import { toNewsCardData } from "@/lib/supabase/mappers";

async function Home({
  searchParams,
}: {
  searchParams: Promise<{ category?: string }>;
}) {
  const { category } = await searchParams;
  const [articles, categories] = await Promise.all([
    getAnalyzedArticles({ category }),
    getDistinctCategories(),
  ]);
  const cards = articles.map(toNewsCardData);

  return (
    <main className="mx-auto flex w-full max-w-[1280px] flex-col gap-8 px-6 py-8">
      <CategoryChips categories={categories} active={category} />

      <section className="flex flex-col gap-4">
        <h1 className="text-h1 font-bold text-foreground">
          {category ? category : "Top News"}
        </h1>

        <ArticleGrid
          cards={cards}
          emptyTitle={
            category ? `No articles in ${category}` : "No analyzed articles yet"
          }
          emptyBody={
            category
              ? "Try another category or clear the filter."
              : "Run the scraping and analysis pipeline to populate the feed."
          }
        />
      </section>
    </main>
  );
}

export default Home;
