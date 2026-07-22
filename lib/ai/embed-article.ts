import "server-only";

import { embed } from "ai";
import { provider } from "@/lib/ai/openai-provider";

// Embedding layer (AGENTS.md §20): turns one article into a 1536-dim vector for
// pgvector similarity search. Uses the Vercel AI SDK `embed` with OpenAI
// text-embedding-3-small (fixed at 1536 dims to match the `embedding vector(1536)`
// column). Server-only: OPENAI_API_KEY must never reach the browser (§21).

// Fixed model — its 1536 output dimensions must match the DB column.
export const EMBEDDING_MODEL = "text-embedding-3-small";

// Cap the text sent to the embedding endpoint to keep tokens/cost bounded.
const MAX_TEXT_CHARS = 12_000;

// Hard timeout per embedding call so a slow/blocked endpoint fails fast instead
// of freezing the batch. Overridable via env.
const EMBEDDING_TIMEOUT_MS = Number(process.env.EMBEDDING_TIMEOUT_MS) || 30_000;

/**
 * Generate a 1536-dim embedding for one article (title + body). Throws on
 * transport failure or timeout — callers decide whether to retry or skip.
 */
export async function embedArticle(
  title: string,
  body: string
): Promise<number[]> {
  const combined = `${title}\n\n${body}`;
  const value =
    combined.length > MAX_TEXT_CHARS ? combined.slice(0, MAX_TEXT_CHARS) : combined;

  const { embedding } = await embed({
    model: provider.embeddingModel(EMBEDDING_MODEL),
    value,
    abortSignal: AbortSignal.timeout(EMBEDDING_TIMEOUT_MS),
    maxRetries: 1,
  });
  return embedding;
}

/**
 * Format a number[] as a pgvector literal (e.g. "[0.1,0.2]"). PostgREST expects
 * a bracketed string, not a raw JSON array, when writing a `vector` column.
 */
export function toVectorLiteral(v: number[]): string {
  return `[${v.join(",")}]`;
}
