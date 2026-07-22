"use client";

import Link from "next/link";
import posthog from "posthog-js";

function ArticleLink({
  articleId,
  category,
  children,
}: {
  articleId: string;
  category: string;
  children: React.ReactNode;
}) {
  return (
    <Link
      href={`/article/${articleId}`}
      onClick={() =>
        posthog.capture("article_opened", {
          article_id: articleId,
          category,
          source: "home_feed",
        })
      }
    >
      {children}
    </Link>
  );
}

export { ArticleLink };
