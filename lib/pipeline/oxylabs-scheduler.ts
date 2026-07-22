import "server-only";

// Oxylabs Scheduler API client (AGENTS.md §18; oxylabs-web-scraper skill).
// Wraps the Push-Pull Scheduler endpoints on data.oxylabs.io. HTTP Basic Auth
// from OXY_WSA_* env vars. Server-only: credentials must never reach the browser
// (§21).
//
// LARGE-INTEGER PRECISION (§18): schedule_id and job id are 64-bit integers that
// exceed Number.MAX_SAFE_INTEGER. JSON.parse silently corrupts them. Every ID
// here is extracted from the raw response TEXT via regex before any JSON.parse,
// and is only ever handled as a string. Never convert a parsed number back to a
// string — precision is already lost at parse time.

const OXYLABS_BASE_URL = "https://data.oxylabs.io/v1";
const REQUEST_TIMEOUT_MS = 60_000;

function getEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

function authHeader(): string {
  const username = getEnv("OXY_WSA_USERNAME");
  const password = getEnv("OXY_WSA_PASSWORD");
  return `Basic ${Buffer.from(`${username}:${password}`).toString("base64")}`;
}

/**
 * Perform an authenticated Scheduler request and return the raw response text
 * (never parsed here — callers extract IDs from the text first). Throws on
 * transport failure, timeout, or non-2xx status.
 */
async function schedulerRequest(
  method: "GET" | "POST" | "PUT",
  path: string,
  body?: unknown
): Promise<string> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  let response: Response;
  try {
    response = await fetch(`${OXYLABS_BASE_URL}${path}`, {
      method,
      headers: {
        Authorization: authHeader(),
        "Content-Type": "application/json",
      },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: controller.signal,
    });
  } catch (err) {
    if (err instanceof Error && err.name === "AbortError") {
      throw new Error(`Oxylabs Scheduler request timed out after ${REQUEST_TIMEOUT_MS}ms (${method} ${path})`);
    }
    throw new Error(`Oxylabs Scheduler request failed (${method} ${path}): ${(err as Error).message}`);
  } finally {
    clearTimeout(timeout);
  }

  if (!response.ok) {
    throw new Error(`Oxylabs Scheduler returned HTTP ${response.status} (${method} ${path})`);
  }

  return response.text();
}

export type CreatedSchedule = {
  /** Exact digit string — never a parsed number (§18 precision). */
  oxylabsScheduleId: string;
  cron: string;
};

/**
 * Create one Oxylabs schedule. `items` is a single job scraping the source
 * homepage with the same request shape as the manual scraper so scheduled HTML
 * is comparable. Reads schedule_id from the raw response text (§18).
 */
export async function createSchedule(params: {
  cron: string;
  homepageUrl: string;
  endTime: string;
}): Promise<CreatedSchedule> {
  const raw = await schedulerRequest("POST", "/schedules", {
    cron: params.cron,
    items: [{ source: "universal", url: params.homepageUrl, render: "html" }],
    end_time: params.endTime,
  });

  const match = raw.match(/"schedule_id"\s*:\s*(\d+)/);
  if (!match) {
    throw new Error("Oxylabs create-schedule response had no schedule_id");
  }
  return { oxylabsScheduleId: match[1], cron: params.cron };
}

/**
 * List every Oxylabs schedule ID (exact digit strings) from GET /schedules.
 * Extracts from the raw `"schedules": [ ... ]` array text (§18) — never parses
 * the numbers.
 */
export async function listOxylabsScheduleIds(): Promise<string[]> {
  const raw = await schedulerRequest("GET", "/schedules");
  const arrayMatch = raw.match(/"schedules"\s*:\s*\[([^\]]*)\]/);
  if (!arrayMatch) return [];
  const ids = arrayMatch[1].match(/\d+/g);
  return ids ?? [];
}

export type ScheduleJob = {
  /** Exact digit string — never a parsed number (§18 precision). */
  jobId: string;
  resultStatus: string;
};

/**
 * Fetch the jobs of a schedule's most recent run, with per-job result_status,
 * from GET /schedules/{id}/runs (§18 — use /runs, not /jobs). Both the job `id`
 * and `result_status` are extracted together from each flat job block in the raw
 * text so the exact id string is never lost to JSON.parse.
 */
export async function getLatestRunJobs(oxylabsScheduleId: string): Promise<ScheduleJob[]> {
  const raw = await schedulerRequest("GET", `/schedules/${oxylabsScheduleId}/runs`);

  // Split into per-run blocks and take the last (most recent) run that has jobs.
  // Runs are returned oldest-first; the final run block is the latest.
  const runBlocks = raw.match(/"run_id"[\s\S]*?"success_rate"/g);
  const scope = runBlocks && runBlocks.length > 0 ? runBlocks[runBlocks.length - 1] : raw;

  const jobs: ScheduleJob[] = [];
  // Each job object is flat: capture the whole {...} block, then id + status
  // from within it so they stay paired and precise.
  const jobBlocks = scope.match(/\{[^{}]*"result_status"[^{}]*\}/g) ?? [];
  for (const block of jobBlocks) {
    const idMatch = block.match(/"id"\s*:\s*(\d+)/);
    const statusMatch = block.match(/"result_status"\s*:\s*"([^"]+)"/);
    if (idMatch && statusMatch) {
      jobs.push({ jobId: idMatch[1], resultStatus: statusMatch[1] });
    }
  }
  return jobs;
}

/**
 * Fetch a completed job's scraped HTML via GET /queries/{job_id}/results. The
 * response shape matches the manual scraper (`results[0].content`). Parsing the
 * result body is safe — we only read `content`/`status_code`, never an ID.
 * Throws on empty content or a non-200 target status.
 */
export async function fetchJobResultHtml(jobId: string): Promise<string> {
  const raw = await schedulerRequest("GET", `/queries/${jobId}/results`);

  let data: { results?: Array<{ content?: unknown; status_code?: number }> };
  try {
    data = JSON.parse(raw);
  } catch {
    throw new Error(`Oxylabs job ${jobId} returned unparseable results`);
  }

  const result = data.results?.[0];
  if (!result) {
    throw new Error(`Oxylabs job ${jobId} returned no results`);
  }
  if (result.status_code !== undefined && result.status_code !== 200) {
    throw new Error(`Oxylabs job ${jobId} target status ${result.status_code}`);
  }
  const content = result.content;
  if (typeof content !== "string" || content.length === 0) {
    throw new Error(`Oxylabs job ${jobId} returned empty content`);
  }
  return content;
}

/** Deactivate (or reactivate) an Oxylabs schedule via PUT /schedules/{id}/state. */
export async function setScheduleState(
  oxylabsScheduleId: string,
  active: boolean
): Promise<void> {
  await schedulerRequest("PUT", `/schedules/${oxylabsScheduleId}/state`, { active });
}
