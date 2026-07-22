import Link from "next/link";
import { ChevronDown, Globe, MapPin, Menu } from "lucide-react";
import { Show, SignInButton, UserButton } from "@clerk/nextjs";

import { Button } from "@/components/ui/button";
import { SiteNav } from "@/components/layout/site-nav";
import { TrackedSubscribeButton } from "@/components/ui/tracked-subscribe-button";
import { cn } from "@/lib/utils";

const themeOptions = ["Light", "Dark", "Auto"];

function todayLabel() {
  return "Monday, June 1, 2026";
}

function SiteHeader() {
  return (
    <div className="border-b border-border bg-background">
      <div className="mx-auto flex w-full max-w-[1280px] flex-wrap items-center justify-between gap-2 px-6 py-2 text-caption text-text-secondary">
        <a href="#" className="hover:text-foreground">
          Browser Extension
        </a>
        <div className="flex items-center gap-1.5">
          <span>Theme:</span>
          {themeOptions.map((option, index) => (
            <span
              key={option}
              className={cn(
                "cursor-pointer",
                index === 0
                  ? "font-semibold text-foreground"
                  : "hover:text-foreground"
              )}
            >
              {option}
            </span>
          ))}
        </div>
        <div className="flex items-center gap-4">
          <span>{todayLabel()}</span>
          <span className="inline-flex items-center gap-1 hover:text-foreground">
            <MapPin className="size-3.5" />
            Set Location
          </span>
          <span className="inline-flex items-center gap-1 hover:text-foreground">
            <Globe className="size-3.5" />
            International Edition
            <ChevronDown className="size-3.5" />
          </span>
        </div>
      </div>

      <div className="mx-auto flex w-full max-w-[1280px] items-center justify-between gap-4 border-t border-border px-6 py-4">
        <div className="flex items-center gap-4">
          <button
            type="button"
            aria-label="Open menu"
            className="text-foreground"
          >
            <Menu className="size-6" />
          </button>
          <Link href="/" className="flex items-baseline gap-1">
            <span className="text-h2 font-bold text-foreground">biasly</span>
            <span className="relative text-body-sm text-text-secondary">
              News
              <span
                aria-hidden
                className="absolute -right-2 top-0 size-1.5 rounded-full bg-destructive"
              />
            </span>
          </Link>
        </div>

        <SiteNav />

        <div className="flex items-center gap-3">
          <TrackedSubscribeButton />
          <Show when="signed-out">
            <SignInButton mode="modal">
              <Button variant="secondary">Login</Button>
            </SignInButton>
          </Show>
          <Show when="signed-in">
            <UserButton />
          </Show>
        </div>
      </div>
    </div>
  );
}

export { SiteHeader };
