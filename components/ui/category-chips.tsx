"use client";

import { useRef } from "react";
import { ChevronRight, Plus } from "lucide-react";
import posthog from "posthog-js";

import { Chip } from "@/components/ui/chip";

type CategoryChipsProps = {
  categories: string[];
};

function CategoryChips({ categories }: CategoryChipsProps) {
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
        <Chip aria-label="Browse all categories" className="shrink-0">
          <Plus className="size-3.5" />
        </Chip>
        {categories.map((category) => (
          <Chip
            key={category}
            withPlus
            className="shrink-0 whitespace-nowrap"
            onClick={() => posthog.capture("category_selected", { category })}
          >
            {category}
          </Chip>
        ))}
      </div>
      <button
        type="button"
        aria-label="Scroll categories"
        onClick={scrollNext}
        className="absolute right-0 flex size-8 shrink-0 items-center justify-center rounded-full border border-border bg-background text-text-secondary shadow-sm hover:text-foreground"
      >
        <ChevronRight className="size-4" />
      </button>
    </div>
  );
}

export { CategoryChips };
