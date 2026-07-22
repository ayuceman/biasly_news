"use client";

import { Bookmark, MoreHorizontal, Share2 } from "lucide-react";
import posthog from "posthog-js";

function ArticleActions({ articleId }: { articleId: string }) {
  return (
    <div className="flex items-center gap-3 text-text-secondary">
      <button
        type="button"
        aria-label="Save article"
        onClick={() => posthog.capture("article_saved", { article_id: articleId })}
      >
        <Bookmark className="size-4" />
      </button>
      <button
        type="button"
        aria-label="Share article"
        onClick={() => posthog.capture("article_shared", { article_id: articleId })}
      >
        <Share2 className="size-4" />
      </button>
      <button type="button" aria-label="More options">
        <MoreHorizontal className="size-4" />
      </button>
    </div>
  );
}

export { ArticleActions };
