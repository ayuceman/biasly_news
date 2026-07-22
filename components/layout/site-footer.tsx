import { AtSign, Camera, Link2, Video } from "lucide-react";

const companyLinks = ["About", "Careers", "Press", "Contact"];
const helpLinks = ["Help Center", "Guides", "Privacy Policy", "Terms of Service"];
const socialLinks = [
  { label: "X (Twitter)", icon: AtSign },
  { label: "LinkedIn", icon: Link2 },
  { label: "Instagram", icon: Camera },
  { label: "YouTube", icon: Video },
];

function SiteFooter() {
  return (
    <footer className="border-t border-border bg-foreground text-background">
      <div className="mx-auto grid w-full max-w-[1280px] grid-cols-1 gap-8 px-6 py-10 sm:grid-cols-4">
        <div className="flex flex-col gap-2">
          <span className="text-h3 font-bold">biasly</span>
          <p className="text-body-sm text-background/70">
            Balanced news coverage, powered by AI.
          </p>
        </div>

        <div className="flex flex-col gap-3">
          <h4 className="text-h4 font-medium">Company</h4>
          <ul className="flex flex-col gap-2">
            {companyLinks.map((label) => (
              <li key={label}>
                <a
                  href="#"
                  className="text-body-sm text-background/70 hover:text-background"
                >
                  {label}
                </a>
              </li>
            ))}
          </ul>
        </div>

        <div className="flex flex-col gap-3">
          <h4 className="text-h4 font-medium">Help</h4>
          <ul className="flex flex-col gap-2">
            {helpLinks.map((label) => (
              <li key={label}>
                <a
                  href="#"
                  className="text-body-sm text-background/70 hover:text-background"
                >
                  {label}
                </a>
              </li>
            ))}
          </ul>
        </div>

        <div className="flex flex-col gap-3">
          <h4 className="text-h4 font-medium">Connect</h4>
          <div className="flex items-center gap-3">
            {socialLinks.map(({ label, icon: Icon }) => (
              <a
                key={label}
                href="#"
                aria-label={label}
                className="text-background/70 hover:text-background"
              >
                <Icon className="size-4" />
              </a>
            ))}
          </div>
        </div>
      </div>

      <div className="border-t border-background/10">
        <div className="mx-auto w-full max-w-[1280px] px-6 py-4 text-caption text-background/60">
          &copy; 2026 Biasly News. All rights reserved.
        </div>
      </div>
    </footer>
  );
}

export { SiteFooter };
