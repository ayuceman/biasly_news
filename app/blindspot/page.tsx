import { ArticleCardLink } from "@/components/ui/article-grid";
import { getBlindspotArticles } from "@/lib/supabase/queries/articles";
import { toNewsCardData } from "@/lib/supabase/mappers";
import type { ArticleWithAnalysis } from "@/lib/supabase/types";

// One Blindspot column: a heading, a short caption, and a single-column list of
// strongly-leaning articles (or a per-column empty message).
function BlindspotColumn({
  title,
  caption,
  articles,
  emptyMessage,
}: {
  title: string;
  caption: string;
  articles: ArticleWithAnalysis[];
  emptyMessage: string;
}) {
  const cards = articles.map(toNewsCardData);

  return (
    <section className="flex flex-col gap-4">
      <div className="flex flex-col gap-1">
        <h2 className="text-h3 font-bold text-foreground">{title}</h2>
        <p className="text-body-sm text-text-secondary">{caption}</p>
      </div>

      {cards.length === 0 ? (
        <div className="rounded-lg border border-border py-12 text-center text-body-sm text-text-secondary">
          {emptyMessage}
        </div>
      ) : (
        <div className="flex flex-col gap-6">
          {cards.map((card) => (
            <ArticleCardLink key={card.id} card={card} />
          ))}
        </div>
      )}
    </section>
  );
}

async function Blindspot() {
  const { left, right } = await getBlindspotArticles();

  return (
    <main className="mx-auto flex w-full max-w-[1280px] flex-col gap-8 px-6 py-8">
      <div className="flex flex-col gap-2">
        <h1 className="text-h1 font-bold text-foreground">Blindspot</h1>
        <p className="max-w-3xl text-body-md text-text-secondary">
          Stories with a strong political lean, grouped by the side that may
          overlook them. Lean is an AI estimate of each article&apos;s framing,
          not a count of how many outlets covered the story.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-8 md:grid-cols-2">
        <BlindspotColumn
          title="Missed by the Right"
          caption="Strongly left-framed coverage."
          articles={left}
          emptyMessage="No strongly left-framed stories right now."
        />
        <BlindspotColumn
          title="Missed by the Left"
          caption="Strongly right-framed coverage."
          articles={right}
          emptyMessage="No strongly right-framed stories right now."
        />
      </div>
    </main>
  );
}

export default Blindspot;
