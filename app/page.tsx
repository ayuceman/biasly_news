import { ArticleLink } from "@/components/ui/article-link";
import { CategoryChips } from "@/components/ui/category-chips";
import { NewsCard } from "@/components/ui/news-card";
import { getAnalyzedArticles } from "@/lib/supabase/queries/articles";
import { toNewsCardData } from "@/lib/supabase/mappers";

const categories = [
  "World Cup",
  "IPL",
  "Social Media",
  "Business & Markets",
  "Health & Medicine",
  "Soccer",
  "Artificial Intelligence",
  "Arsenal FC",
  "Extreme Weather and Disasters",
];

async function Home() {
  const articles = await getAnalyzedArticles();
  const cards = articles.map(toNewsCardData);

  return (
    <main className="mx-auto flex w-full max-w-[1280px] flex-col gap-8 px-6 py-8">
      <CategoryChips categories={categories} />

      <section className="flex flex-col gap-4">
        <h1 className="text-h1 font-bold text-foreground">Top News</h1>

        {cards.length === 0 ? (
          <div className="flex flex-col items-center gap-2 rounded-lg border border-border py-16 text-center">
            <p className="text-h4 font-semibold text-foreground">
              No analyzed articles yet
            </p>
            <p className="text-body-sm text-text-secondary">
              Run the scraping and analysis pipeline to populate the feed.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3">
            {cards.map((card) => (
              <ArticleLink
                key={card.id}
                articleId={card.id}
                category={card.category}
              >
                <NewsCard
                  imageUrl={card.imageUrl}
                  category={card.category}
                  region={card.region}
                  title={card.title}
                  leftPercentage={card.leftPercentage}
                  centerPercentage={card.centerPercentage}
                  rightPercentage={card.rightPercentage}
                  sourcesCount={card.sourcesCount}
                />
              </ArticleLink>
            ))}
          </div>
        )}
      </section>
    </main>
  );
}

export default Home;
