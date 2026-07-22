"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { cn } from "@/lib/utils";

const navLinks = [
  { label: "Home", href: "/" },
  { label: "For You", href: "/for-you", withDot: true },
  { label: "Local", href: "/local" },
  { label: "Blindspot", href: "/blindspot" },
];

function isActive(pathname: string, href: string): boolean {
  if (href === "/") return pathname === "/";
  return pathname === href || pathname.startsWith(`${href}/`);
}

// Primary nav. Client component so the active link can be derived from the
// current path; the surrounding header stays a server component.
function SiteNav() {
  const pathname = usePathname();

  return (
    <nav className="hidden items-center gap-6 md:flex">
      {navLinks.map((link) => {
        const active = isActive(pathname, link.href);
        return (
          <Link
            key={link.label}
            href={link.href}
            aria-current={active ? "page" : undefined}
            className={cn(
              "relative text-body-md font-medium text-text-secondary hover:text-foreground",
              active && "text-foreground underline underline-offset-8"
            )}
          >
            {link.label}
            {link.withDot && (
              <span
                aria-hidden
                className="absolute -right-2 top-0 size-1.5 rounded-full bg-destructive"
              />
            )}
          </Link>
        );
      })}
    </nav>
  );
}

export { SiteNav };
