import "server-only";

// Oxylabs Web Scraper API client (oxylabs-web-scraper skill).
// Uses the Realtime endpoint with source "universal" + render "html" for
// arbitrary JS-heavy news pages. HTTP Basic Auth from OXY_WSA_* env vars.
// Server-only: credentials must never reach the browser (AGENTS.md §21).

const OXYLABS_REALTIME_URL = "https://realtime.oxylabs.io/v1/queries";
// Rendered Realtime requests can take a while; the skill suggests ~180s.
const REQUEST_TIMEOUT_MS = 180_000;

function getEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

export type FetchHtmlResult = {
  html: string;
  statusCode: number;
  finalUrl: string;
};

type OxylabsResponse = {
  results?: Array<{
    content?: unknown;
    status_code?: number;
    url?: string;
  }>;
};

/**
 * Fetch a fully rendered page's HTML through Oxylabs. Throws on transport
 * failure, non-200 Oxylabs responses, or a non-200 target status_code.
 */
export async function fetchHtml(url: string): Promise<FetchHtmlResult> {
  const username = getEnv("OXY_WSA_USERNAME");
  const password = getEnv("OXY_WSA_PASSWORD");
  const auth = Buffer.from(`${username}:${password}`).toString("base64");

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  let response: Response;
  try {
    response = await fetch(OXYLABS_REALTIME_URL, {
      method: "POST",
      headers: {
        Authorization: `Basic ${auth}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        source: "universal",
        url,
        render: "html",
      }),
      signal: controller.signal,
    });
  } catch (err) {
    if (err instanceof Error && err.name === "AbortError") {
      throw new Error(`Oxylabs request timed out after ${REQUEST_TIMEOUT_MS}ms for ${url}`);
    }
    throw new Error(`Oxylabs request failed for ${url}: ${(err as Error).message}`);
  } finally {
    clearTimeout(timeout);
  }

  if (!response.ok) {
    throw new Error(`Oxylabs returned HTTP ${response.status} for ${url}`);
  }

  const data = (await response.json()) as OxylabsResponse;
  const result = data.results?.[0];
  if (!result) {
    throw new Error(`Oxylabs returned no results for ${url}`);
  }

  const statusCode = result.status_code ?? 0;
  if (statusCode !== 200) {
    throw new Error(`Target returned status ${statusCode} for ${url}`);
  }

  const content = result.content;
  if (typeof content !== "string" || content.length === 0) {
    throw new Error(`Oxylabs returned empty content for ${url}`);
  }

  return {
    html: content,
    statusCode,
    finalUrl: result.url ?? url,
  };
}
