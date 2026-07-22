import { ArticleLink } from "@/components/ui/article-link";
import { NewsCard } from "@/components/ui/news-card";
import type { NewsCardData } from "@/lib/supabase/mappers";

// One clickable article card. Shared by the feed grid and the Blindspot columns
// so the card wiring lives in exactly one place.
function ArticleCardLink({ card }: { card: NewsCardData }) {
  return (
    <ArticleLink articleId={card.id} category={card.category}>
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
  );
}

// Responsive feed grid with a shared empty state. Reused by Home, Local, and any
// other single-feed page.
function ArticleGrid({
  cards,
  emptyTitle,
  emptyBody,
}: {
  cards: NewsCardData[];
  emptyTitle: string;
  emptyBody: string;
}) {
  if (cards.length === 0) {
    return (
      <div className="flex flex-col items-center gap-2 rounded-lg border border-border py-16 text-center">
        <p className="text-h4 font-semibold text-foreground">{emptyTitle}</p>
        <p className="text-body-sm text-text-secondary">{emptyBody}</p>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3">
      {cards.map((card) => (
        <ArticleCardLink key={card.id} card={card} />
      ))}
    </div>
  );
}

export { ArticleGrid, ArticleCardLink };
