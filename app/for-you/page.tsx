import { auth, currentUser } from "@clerk/nextjs/server";
import { SignInButton } from "@clerk/nextjs";

import { ArticleGrid } from "@/components/ui/article-grid";
import { Button } from "@/components/ui/button";
import { InterestsBar } from "@/components/for-you/interests-bar";
import { ARTICLE_CATEGORIES } from "@/lib/ai/analysis-schema";
import { getAnalyzedArticles } from "@/lib/supabase/queries/articles";
import { toNewsCardData } from "@/lib/supabase/mappers";

function readInterests(metadata: UserPublicMetadata | undefined): string[] {
  const raw = metadata?.interests;
  return Array.isArray(raw) ? (raw as string[]) : [];
}

async function ForYou() {
  const { isAuthenticated } = await auth();

  if (!isAuthenticated) {
    return (
      <main className="mx-auto flex w-full max-w-[1280px] flex-col gap-8 px-6 py-8">
        <h1 className="text-h1 font-bold text-foreground">For You</h1>
        <div className="flex flex-col items-center gap-4 rounded-lg border border-border py-16 text-center">
          <div className="flex flex-col gap-1">
            <p className="text-h4 font-semibold text-foreground">
              Sign in to build your feed
            </p>
            <p className="max-w-md text-body-sm text-text-secondary">
              Pick the topics you care about and see only those stories here.
            </p>
          </div>
          <SignInButton mode="modal">
            <Button>Sign in</Button>
          </SignInButton>
        </div>
      </main>
    );
  }

  const user = await currentUser();
  const interests = readInterests(user?.publicMetadata);
  const articles =
    interests.length > 0
      ? await getAnalyzedArticles({ categories: interests })
      : [];
  const cards = articles.map(toNewsCardData);

  return (
    <main className="mx-auto flex w-full max-w-[1280px] flex-col gap-8 px-6 py-8">
      <div className="flex flex-col gap-4">
        <h1 className="text-h1 font-bold text-foreground">For You</h1>
        <InterestsBar initial={interests} allCategories={ARTICLE_CATEGORIES} />
      </div>

      <ArticleGrid
        cards={cards}
        emptyTitle={
          interests.length === 0
            ? "Pick your interests"
            : "No articles in your interests yet"
        }
        emptyBody={
          interests.length === 0
            ? "Choose a few topics above to personalize your feed."
            : "Try adding more topics, or check back once more articles are analyzed."
        }
      />
    </main>
  );
}

export default ForYou;
