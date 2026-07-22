import Link from "next/link";
import { notFound } from "next/navigation";
import { Info } from "lucide-react";

import { ArticleActions } from "@/components/ui/article-actions";
import { Button } from "@/components/ui/button";
import { BiasMeter } from "@/components/ui/bias-meter";
import { NewsletterSignup } from "@/components/ui/newsletter-signup";
import { cn } from "@/lib/utils";
import {
  getArticleWithAnalysis,
  getRelatedArticles,
} from "@/lib/supabase/queries/articles";
import {
  bodyParagraphs,
  dominantBias,
  formatDate,
} from "@/lib/supabase/mappers";
import type { RelatedArticle } from "@/lib/supabase/types";

type BiasRowProps = {
  label: string;
  value: string;
  percentage: number;
  color: "left" | "center" | "right";
};

function BiasRow({ label, value, percentage, color }: BiasRowProps) {
  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-center justify-between text-body-sm font-medium text-foreground">
        <span>{label}</span>
        <span>{value}</span>
      </div>
      <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
        <div
          className={cn(
            "h-full rounded-full",
            color === "left" && "bg-left-bias",
            color === "center" && "bg-center-bias",
            color === "right" && "bg-right-bias"
          )}
          style={{ width: `${percentage}%` }}
        />
      </div>
    </div>
  );
}

function PanelHeading({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between">
      <h2 className="text-h4 font-semibold text-foreground">{children}</h2>
      <Info className="size-4 text-text-secondary" />
    </div>
  );
}

const biasColorClass: Record<string, string> = {
  Left: "text-left-bias",
  Center: "text-foreground",
  Right: "text-right-bias",
};

function RelatedArticleCard({ article }: { article: RelatedArticle }) {
  const left = Math.round(article.left_percentage ?? 0);
  const center = Math.round(article.center_percentage ?? 0);
  const right = Math.round(article.right_percentage ?? 0);

  return (
    <Link
      href={`/article/${article.id}`}
      className="flex flex-col gap-3 rounded-lg border border-border p-3 transition-colors hover:bg-surface"
    >
      <div
        role="img"
        aria-label={article.title}
        className="aspect-[16/9] w-full rounded-md bg-cover bg-center"
        style={{ backgroundImage: `url(${article.image_url})` }}
      />
      <div className="flex flex-col gap-1">
        <p className="text-caption text-text-secondary">
          {article.source_name ?? "Unknown source"}
          {article.bias_label ? (
            <>
              {" "}
              <span aria-hidden>&middot;</span>{" "}
              <span className="capitalize">{article.bias_label}</span>
            </>
          ) : null}
        </p>
        <h3 className="text-body-sm font-semibold text-foreground line-clamp-2">
          {article.title}
        </h3>
      </div>
      <BiasMeter
        variant="pills"
        leftPercentage={left}
        centerPercentage={center}
        rightPercentage={right}
      />
    </Link>
  );
}

export default async function ArticleDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const article = await getArticleWithAnalysis(id);

  if (!article) {
    notFound();
  }

  const { analysis } = article;
  const left = Math.round(analysis.left_percentage ?? 0);
  const center = Math.round(analysis.center_percentage ?? 0);
  const right = Math.round(analysis.right_percentage ?? 0);
  const dominant = dominantBias(article);
  const paragraphs = bodyParagraphs(article.raw_text);
  const sourceName = article.source?.name ?? "Unknown source";

  // Related articles by cosine similarity (§20). Only when this article has an
  // embedding; the section is hidden otherwise.
  const relatedArticles: RelatedArticle[] = analysis.embedding
    ? await getRelatedArticles(article.id, analysis.embedding)
    : [];

  return (
    <main className="mx-auto grid w-full max-w-[1280px] grid-cols-1 gap-8 px-6 py-8 lg:grid-cols-[1fr_360px]">
      <div className="flex flex-col gap-6">
        <div className="flex flex-col gap-3">
          <p className="text-caption text-text-secondary">
            {sourceName}
            {analysis.bias_label ? (
              <>
                {" "}
                <span aria-hidden>&middot;</span>{" "}
                <span className="capitalize">{analysis.bias_label}</span>
              </>
            ) : null}
          </p>
          <h1 className="text-h1 font-bold text-foreground">{article.title}</h1>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-body-sm text-text-secondary">
              {sourceName} <span aria-hidden>&middot;</span>{" "}
              {formatDate(article.published_at)}
            </p>
            <ArticleActions articleId={article.id} />
          </div>
        </div>

        <div
          role="img"
          aria-label={article.title}
          className="aspect-[16/9] w-full rounded-lg bg-cover bg-center"
          style={{ backgroundImage: `url(${article.image_url})` }}
        />

        <div className="flex flex-col gap-3 rounded-lg border border-border p-4">
          <PanelHeading>Bias Distribution</PanelHeading>
          <BiasMeter
            variant="pills"
            leftPercentage={left}
            centerPercentage={center}
            rightPercentage={right}
          />
          <p className="text-caption text-text-secondary">
            AI-estimated framing from this article&apos;s text.
          </p>
        </div>

        {paragraphs.length > 0 ? (
          <div className="flex flex-col gap-4">
            {paragraphs.map((paragraph, index) => (
              <p key={index} className="text-body-lg text-foreground">
                {paragraph}
              </p>
            ))}
          </div>
        ) : null}

        {relatedArticles.length > 0 ? (
          <section className="flex flex-col gap-4 border-t border-border pt-6">
            <PanelHeading>Related Articles</PanelHeading>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              {relatedArticles.map((related) => (
                <RelatedArticleCard key={related.id} article={related} />
              ))}
            </div>
          </section>
        ) : null}

        <div className="flex flex-col items-start gap-4 rounded-lg bg-surface p-6 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex flex-col gap-1">
            <h3 className="text-h3 font-bold text-foreground">
              Stay Informed. Stay Balanced.
            </h3>
            <p className="text-body-sm text-text-secondary">
              Get the top stories and bias analysis delivered to your inbox.
            </p>
          </div>
          <NewsletterSignup articleId={article.id} />
        </div>
      </div>

      <aside className="flex flex-col gap-6 lg:sticky lg:top-8 lg:self-start">
        <div className="flex flex-col gap-4 rounded-lg border border-border p-5">
          <PanelHeading>Bias Analysis</PanelHeading>
          <div className="flex flex-col gap-1">
            <p className="text-body-sm text-text-secondary">Overall Bias</p>
            <p
              className={cn(
                "text-h1 font-bold",
                biasColorClass[dominant.label] ?? "text-foreground"
              )}
            >
              {dominant.label} {dominant.percentage}%
            </p>
            <p className="text-caption text-text-secondary">
              AI-estimated, not objective truth.
            </p>
          </div>
          <div className="flex flex-col gap-3 border-t border-border pt-4">
            <BiasRow label="Left" value={`${left}%`} percentage={left} color="left" />
            <BiasRow
              label="Center"
              value={`${center}%`}
              percentage={center}
              color="center"
            />
            <BiasRow
              label="Right"
              value={`${right}%`}
              percentage={right}
              color="right"
            />
          </div>
          {typeof analysis.confidence === "number" ? (
            <p className="border-t border-border pt-4 text-caption text-text-secondary">
              Confidence: {Math.round(analysis.confidence * 100)}%
            </p>
          ) : null}
          {analysis.framing_notes ? (
            <p className="border-t border-border pt-4 text-caption text-text-secondary">
              {analysis.framing_notes}
            </p>
          ) : null}
          <Button type="button" variant="secondary" className="w-full">
            How We Analyze Bias
          </Button>
        </div>

        {analysis.summary ? (
          <div className="flex flex-col gap-4 rounded-lg border border-border p-5">
            <PanelHeading>AI Summary</PanelHeading>
            <p className="text-caption text-text-secondary">
              Generated {formatDate(analysis.created_at)}
              {analysis.sentiment_label ? (
                <>
                  {" "}
                  <span aria-hidden>&middot;</span>{" "}
                  <span className="capitalize">
                    {analysis.sentiment_label} sentiment
                  </span>
                </>
              ) : null}
            </p>
            <p className="text-body-sm text-foreground">{analysis.summary}</p>
            {analysis.loaded_terms && analysis.loaded_terms.length > 0 ? (
              <div className="flex flex-col gap-2 border-t border-border pt-4">
                <p className="text-caption text-text-secondary">Loaded terms</p>
                <div className="flex flex-wrap gap-2">
                  {analysis.loaded_terms.map((term) => (
                    <span
                      key={term}
                      className="rounded-full border border-border px-2 py-0.5 text-caption text-foreground"
                    >
                      {term}
                    </span>
                  ))}
                </div>
              </div>
            ) : null}
            <p className="text-caption text-text-secondary">
              {analysis.disclaimer ?? "AI summaries can make mistakes."}
            </p>
          </div>
        ) : null}
      </aside>
    </main>
  );
}
