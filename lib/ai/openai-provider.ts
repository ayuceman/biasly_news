import "server-only";

import { openai, createOpenAI } from "@ai-sdk/openai";
import { ProxyAgent } from "undici";

// Shared OpenAI provider for the AI layer (AGENTS.md §5, §21). Built once at
// module load so both the analysis call (analyze-article.ts) and the embedding
// call (embed-article.ts) route through the same provider — and honor the same
// region proxy. Server-only: OPENAI_API_KEY must never reach the browser.

// The OpenAI API is region-blocked for some networks (HTTP 403
// unsupported_country_region_territory). When OPENAI_PROXY_URL is set, route the
// SDK's HTTPS requests through that proxy (a supported region) via an undici
// ProxyAgent. Format: http://user:pass@host:port. Unset = direct requests.
function makeProxiedFetch(proxyUrl: string): typeof globalThis.fetch {
  const dispatcher = new ProxyAgent(proxyUrl);
  return (input, init) =>
    globalThis.fetch(input, { ...init, dispatcher } as RequestInit & {
      dispatcher: ProxyAgent;
    });
}

// Proxied when OPENAI_PROXY_URL is configured, otherwise the default provider
// (both read OPENAI_API_KEY).
export const provider = process.env.OPENAI_PROXY_URL
  ? createOpenAI({ fetch: makeProxiedFetch(process.env.OPENAI_PROXY_URL) })
  : openai;
