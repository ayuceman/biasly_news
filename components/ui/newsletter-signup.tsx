"use client";

import { useState } from "react";
import posthog from "posthog-js";

import { Button } from "@/components/ui/button";

function NewsletterSignup({ articleId }: { articleId: string }) {
  const [email, setEmail] = useState("");

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    posthog.capture("newsletter_subscription_submitted", {
      article_id: articleId,
      placement: "article_detail",
    });
    setEmail("");
  }

  return (
    <form className="flex w-full gap-2 sm:w-auto" onSubmit={handleSubmit}>
      <input
        type="email"
        value={email}
        onChange={(event) => setEmail(event.target.value)}
        placeholder="Enter your email"
        aria-label="Email address"
        required
        className="h-9 w-full rounded-lg border border-border bg-background px-3 text-body-sm text-foreground outline-none placeholder:text-text-secondary sm:w-64"
      />
      <Button type="submit" variant="primary">
        Subscribe
      </Button>
    </form>
  );
}

export { NewsletterSignup };
