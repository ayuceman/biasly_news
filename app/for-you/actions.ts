"use server";

import { auth, clerkClient } from "@clerk/nextjs/server";
import { revalidatePath } from "next/cache";

import { ARTICLE_CATEGORIES } from "@/lib/ai/analysis-schema";

// Server action for the For You page. Persists a user's followed categories to
// Clerk publicMetadata. Server actions are public endpoints, so auth is verified
// and input is validated against the fixed category enum before writing (§21).

const VALID = new Set<string>(ARTICLE_CATEGORIES);

export async function saveInterests(interests: string[]): Promise<void> {
  const { isAuthenticated, userId } = await auth();
  if (!isAuthenticated || !userId) throw new Error("Unauthorized");

  // Keep only known categories, de-duped and order-stable.
  const cleaned = [...new Set(interests.filter((c) => VALID.has(c)))];

  const client = await clerkClient();
  await client.users.updateUserMetadata(userId, {
    publicMetadata: { interests: cleaned },
  });

  revalidatePath("/for-you");
}
