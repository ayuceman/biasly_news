"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Check, Pencil } from "lucide-react";
import posthog from "posthog-js";

import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { saveInterests } from "@/app/for-you/actions";

const CHIP_BASE =
  "inline-flex items-center gap-1 rounded-full px-3 py-1.5 text-body-sm font-medium transition-colors";

type InterestsBarProps = {
  initial: string[];
  allCategories: readonly string[];
};

// Interest picker/editor for the For You page. Collapses to a summary with an
// "Edit interests" button once interests exist; expands to toggle chips + Save.
function InterestsBar({ initial, allCategories }: InterestsBarProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  // Start in edit mode when the user has no interests yet.
  const [editing, setEditing] = useState(initial.length === 0);
  const [selected, setSelected] = useState<Set<string>>(new Set(initial));

  function toggle(category: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(category)) next.delete(category);
      else next.add(category);
      return next;
    });
  }

  function save() {
    const interests = allCategories.filter((c) => selected.has(c));
    startTransition(async () => {
      await saveInterests(interests);
      posthog.capture("interests_saved", { interests });
      setEditing(false);
      router.refresh();
    });
  }

  function cancel() {
    setSelected(new Set(initial));
    setEditing(false);
  }

  if (!editing) {
    return (
      <div className="flex flex-wrap items-center gap-2">
        {initial.map((category) => (
          <span key={category} className={cn(CHIP_BASE, "bg-muted text-foreground")}>
            {category}
          </span>
        ))}
        <button
          type="button"
          onClick={() => setEditing(true)}
          className="inline-flex items-center gap-1 text-body-sm font-medium text-text-secondary hover:text-foreground"
        >
          <Pencil className="size-3.5" />
          Edit interests
        </button>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4 rounded-lg border border-border p-4">
      <p className="text-body-sm text-text-secondary">
        Pick the topics you want in your feed.
      </p>
      <div className="flex flex-wrap gap-2">
        {allCategories.map((category) => {
          const isSelected = selected.has(category);
          return (
            <button
              key={category}
              type="button"
              aria-pressed={isSelected}
              onClick={() => toggle(category)}
              className={cn(
                CHIP_BASE,
                isSelected
                  ? "bg-foreground text-background"
                  : "bg-muted text-foreground hover:bg-surface"
              )}
            >
              {isSelected && <Check className="size-3.5" />}
              {category}
            </button>
          );
        })}
      </div>
      <div className="flex items-center gap-2">
        <Button onClick={save} disabled={isPending}>
          {isPending ? "Saving…" : "Save"}
        </Button>
        {initial.length > 0 && (
          <Button variant="secondary" onClick={cancel} disabled={isPending}>
            Cancel
          </Button>
        )}
      </div>
    </div>
  );
}

export { InterestsBar };
