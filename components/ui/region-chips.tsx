"use client";

import { useRef } from "react";
import Link from "next/link";
import { ChevronRight } from "lucide-react";
import posthog from "posthog-js";

import { cn } from "@/lib/utils";

type RegionChipsProps = {
  regions: string[];
  /** Currently selected region (from ?region=), if any. */
  active?: string;
};

// Base chip styling shared by the link chips below (mirrors components/ui/category-chips.tsx).
const CHIP_BASE =
  "inline-flex shrink-0 items-center gap-1 whitespace-nowrap rounded-full px-3 py-1.5 text-body-sm font-medium transition-colors";

// Region picker for the Local page. Mirrors CategoryChips but links to /local.
function RegionChips({ regions, active }: RegionChipsProps) {
  const scrollRef = useRef<HTMLDivElement>(null);

  function scrollNext() {
    scrollRef.current?.scrollBy({ left: 240, behavior: "smooth" });
  }

  return (
    <div className="relative flex items-center">
      <div
        ref={scrollRef}
        className="flex flex-1 items-center gap-2 overflow-x-auto scroll-smooth pr-10 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      >
        <Link
          href="/local"
          aria-label="Show all regions"
          className={cn(
            CHIP_BASE,
            !active
              ? "bg-foreground text-background"
              : "bg-muted text-foreground hover:bg-surface"
          )}
        >
          All
        </Link>
        {regions.map((region) => {
          const isActive = active === region;
          return (
            <Link
              key={region}
              href={`/local?region=${encodeURIComponent(region)}`}
              aria-current={isActive ? "true" : undefined}
              className={cn(
                CHIP_BASE,
                isActive
                  ? "bg-foreground text-background"
                  : "bg-muted text-foreground hover:bg-surface"
              )}
              onClick={() => posthog.capture("region_selected", { region })}
            >
              {region}
            </Link>
          );
        })}
      </div>
      <button
        type="button"
        aria-label="Scroll regions"
        onClick={scrollNext}
        className="absolute right-0 flex size-8 shrink-0 items-center justify-center rounded-full border border-border bg-background text-text-secondary shadow-sm hover:text-foreground"
      >
        <ChevronRight className="size-4" />
      </button>
    </div>
  );
}

export { RegionChips };
