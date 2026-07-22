import { Bookmark, Clock, Info } from "lucide-react";

import { BiasMeter } from "@/components/ui/bias-meter";
import { cn } from "@/lib/utils";

type NewsCardProps = {
  imageUrl?: string;
  category: string;
  region: string;
  title: string;
  excerpt?: string;
  leftPercentage: number;
  centerPercentage: number;
  rightPercentage: number;
  timeAgo?: string;
  readTime?: string;
  sourcesCount?: number;
  className?: string;
};

function NewsCard({
  imageUrl,
  category,
  region,
  title,
  excerpt,
  leftPercentage,
  centerPercentage,
  rightPercentage,
  timeAgo,
  readTime,
  sourcesCount,
  className,
}: NewsCardProps) {
  return (
    <article
      className={cn(
        "overflow-hidden rounded-lg border border-border bg-card shadow-sm",
        className
      )}
    >
      <div
        role="img"
        aria-label={title}
        className={cn(
          "relative aspect-video w-full bg-cover bg-center",
          !imageUrl && "bg-gradient-to-br from-muted to-surface"
        )}
        style={imageUrl ? { backgroundImage: `url(${imageUrl})` } : undefined}
      >
        <button
          type="button"
          aria-label="Article info"
          className="absolute top-3 right-3 flex size-6 items-center justify-center rounded-full bg-white/90 text-foreground"
        >
          <Info className="size-3.5" />
        </button>
      </div>
      <div className="flex flex-col gap-2 p-4">
        <p className="text-caption text-text-secondary">
          {category} <span aria-hidden>&middot;</span> {region}
        </p>
        <h3 className="line-clamp-2 text-h3 font-semibold text-foreground">
          {title}
        </h3>
        {excerpt && (
          <p className="line-clamp-2 text-body-sm text-text-secondary">
            {excerpt}
          </p>
        )}
        <BiasMeter
          variant="pills"
          leftPercentage={leftPercentage}
          centerPercentage={centerPercentage}
          rightPercentage={rightPercentage}
          className="mt-1"
        />
        {sourcesCount !== undefined ? (
          <p className="mt-1 text-caption text-text-secondary">
            {sourcesCount} sources
          </p>
        ) : (
          (timeAgo || readTime) && (
            <div className="mt-1 flex items-center gap-4 text-caption text-text-secondary">
              {timeAgo && (
                <span className="inline-flex items-center gap-1">
                  <Clock className="size-3.5" />
                  {timeAgo}
                </span>
              )}
              {readTime && (
                <span className="inline-flex items-center gap-1">
                  <Bookmark className="size-3.5" />
                  {readTime}
                </span>
              )}
            </div>
          )
        )}
      </div>
    </article>
  );
}

export { NewsCard };
