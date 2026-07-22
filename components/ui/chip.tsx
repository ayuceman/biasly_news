import * as React from "react";
import { Plus } from "lucide-react";

import { cn } from "@/lib/utils";

function Chip({
  className,
  withPlus = false,
  ...props
}: React.ComponentProps<"button"> & { withPlus?: boolean }) {
  return (
    <button
      type="button"
      data-slot="chip"
      className={cn(
        "inline-flex items-center gap-1 rounded-full bg-muted px-3 py-1.5 text-body-sm font-medium text-foreground transition-colors hover:bg-surface",
        className
      )}
      {...props}
    >
      {props.children}
      {withPlus && <Plus className="size-3.5" />}
    </button>
  );
}

export { Chip };
