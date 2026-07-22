"use client";

import posthog from "posthog-js";

import { Button } from "@/components/ui/button";

function TrackedSubscribeButton() {
  return (
    <Button
      variant="primary"
      onClick={() =>
        posthog.capture("subscription_started", { placement: "site_header" })
      }
    >
      Subscribe
    </Button>
  );
}

export { TrackedSubscribeButton };
