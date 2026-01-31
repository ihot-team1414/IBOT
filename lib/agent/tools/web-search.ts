import { z } from "zod";
import { tool } from "ai";
import Exa from "exa-js";

type ExaResultItem = {
  title?: string;
  url?: string;
  highlights?: string[];
  text?: string;
  summary?: string;
};

type ExaResultsResponse = {
  results?: ExaResultItem[];
};

const exaApiKey = process.env.EXA_API_KEY;
const exa = exaApiKey ? new Exa(exaApiKey) : null;

const SEARCH_TIMEOUT_MS = 12_000;
const SCRAPE_TIMEOUT_MS = 15_000;
const MAX_RETRIES = 2;
const RETRY_BASE_DELAY_MS = 400;
const MAX_QUERY_LENGTH = 500;
const MAX_SNIPPET_LENGTH = 300;

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const getErrorMessage = (error: unknown): string => {
  if (error instanceof Error) return error.message;
  if (typeof error === "string") return error;
  if (error && typeof error === "object") {
    const message = (error as { message?: unknown }).message;
    if (typeof message === "string") return message;
  }
  return "";
};

const getErrorCode = (error: unknown): string | undefined => {
  if (!error || typeof error !== "object") return undefined;
  const code = (error as { code?: unknown }).code;
  return typeof code === "string" ? code : undefined;
};

const getErrorStatus = (error: unknown): number | undefined => {
  if (!error || typeof error !== "object") return undefined;
  const status = (error as { status?: unknown }).status;
  if (typeof status === "number") return status;
  const statusCode = (error as { statusCode?: unknown }).statusCode;
  return typeof statusCode === "number" ? statusCode : undefined;
};

const isRetryableError = (error: unknown): boolean => {
  const status = getErrorStatus(error);
  if (status === 408 || status === 429 || (status !== undefined && status >= 500)) {
    return true;
  }

  const code = getErrorCode(error);
  const retryableCodes = new Set([
    "ECONNRESET",
    "ETIMEDOUT",
    "ENOTFOUND",
    "EAI_AGAIN",
    "ECONNREFUSED",
    "EPIPE",
    "UND_ERR_CONNECT_TIMEOUT",
  ]);
  if (code && retryableCodes.has(code)) return true;

  const message = getErrorMessage(error).toLowerCase();
  return (
    message.includes("timeout") ||
    message.includes("timed out") ||
    message.includes("rate limit") ||
    message.includes("temporarily") ||
    message.includes("network") ||
    message.includes("fetch failed") ||
    message.includes("socket hang up")
  );
};

type TimeoutResult<T> = { ok: true; value: T } | { ok: false; error: unknown };

const withTimeout = async <T>(
  promise: Promise<T>,
  timeoutMs: number
): Promise<T> => {
  let timeoutId: ReturnType<typeof setTimeout> | undefined;
  const timeoutPromise = new Promise<TimeoutResult<T>>((resolve) => {
    timeoutId = setTimeout(() => {
      resolve({ ok: false, error: new Error(`Timed out after ${timeoutMs}ms`) });
    }, timeoutMs);
  });

  const wrappedPromise = promise.then<TimeoutResult<T>>(
    (value) => ({ ok: true, value }),
    (error) => ({ ok: false, error })
  );

  const result = await Promise.race([wrappedPromise, timeoutPromise]);
  if (timeoutId) clearTimeout(timeoutId);

  if (result.ok) return result.value;
  throw result.error;
};

const getRetryDelay = (attempt: number): number => {
  const jitter = Math.floor(Math.random() * 120);
  return RETRY_BASE_DELAY_MS * Math.pow(2, attempt) + jitter;
};

const withRetries = async <T>(
  operation: () => Promise<T>,
  options: { retries: number; timeoutMs: number; label: string }
): Promise<T> => {
  let attempt = 0;
  let lastError: unknown;

  while (attempt <= options.retries) {
    try {
      return await withTimeout(operation(), options.timeoutMs);
    } catch (error) {
      lastError = error;
      if (!isRetryableError(error) || attempt === options.retries) {
        throw error;
      }
      const delay = getRetryDelay(attempt);
      console.warn(
        `[WebSearch] ${options.label} attempt ${attempt + 1} failed, retrying in ${delay}ms`,
        error
      );
      await sleep(delay);
      attempt += 1;
    }
  }

  throw lastError;
};

const formatHighlights = (item: ExaResultItem): string => {
  if (item.highlights && item.highlights.length > 0) {
    return item.highlights.join("\n   ...");
  }
  if (item.summary) return item.summary;
  if (item.text) return item.text.slice(0, MAX_SNIPPET_LENGTH);
  return "";
};

const normalizeQuery = (query: string): string => {
  const trimmed = query.trim();
  if (trimmed.length <= MAX_QUERY_LENGTH) return trimmed;
  return trimmed.slice(0, MAX_QUERY_LENGTH);
};

const normalizeUrl = (
  url: string
): { ok: true; url: string } | { ok: false; error: string } => {
  const trimmed = url.trim();
  if (!trimmed) {
    return { ok: false, error: "Please provide a URL to scrape." };
  }

  const normalized = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
  try {
    new URL(normalized);
  } catch {
    return { ok: false, error: "Please provide a valid URL (http or https)." };
  }

  return { ok: true, url: normalized };
};

export const webSearchTool = tool({
  description:
    "Search the web for information. Use this for general knowledge, current events, technical documentation, FRC-related questions, or any information not available in Slack. For FRC questions, prefer searching Chief Delphi (site:chiefdelphi.com).",
  inputSchema: z.object({
    query: z
      .string()
      .describe(
        "The search query. Be specific and include relevant context for better results. For FRC questions, include 'site:chiefdelphi.com' to search Chief Delphi."
      ),
  }),
  execute: async ({ query }) => {
    if (!exa) {
      return "Web search is temporarily unavailable.";
    }

    const trimmedQuery = normalizeQuery(query);
    if (!trimmedQuery) {
      return "Please provide a search query.";
    }

    try {
      const result = await withRetries<ExaResultsResponse>(
        () =>
          exa.searchAndContents(trimmedQuery, {
            type: "auto",
            numResults: 5,
            highlights: true,
          }),
        { retries: MAX_RETRIES, timeoutMs: SEARCH_TIMEOUT_MS, label: "search" }
      );

      const results = result.results ?? [];
      if (results.length === 0) {
        return "No web results found for your query.";
      }

      const formatted = results
        .map((item, index) => {
          const highlights = formatHighlights(item);
          const title = item.title || "Untitled result";
          const url = item.url || "Unknown URL";
          return `${index + 1}. ${title}
   URL: ${url}${highlights ? `\n   ${highlights}` : ""}`;
        })
        .join("\n\n");

      return `Found ${results.length} web results:\n\n${formatted}`;
    } catch (error) {
      console.error("Web search failed:", error);
      if (isRetryableError(error)) {
        return "Web search is temporarily unavailable. Please try again shortly.";
      }
      return "Web search failed. Please try again or rephrase your query.";
    }
  },
});

export const webScrapeTool = tool({
  description:
    "Scrape and read the full content of a webpage. Use this when you have a URL and need to read its contents in detail - for example, after finding a relevant Chief Delphi thread or documentation page from a web search.",
  inputSchema: z.object({
    url: z
      .string()
      .describe("The URL of the webpage to scrape and read."),
  }),
  execute: async ({ url }) => {
    if (!exa) {
      return "Web scraping is temporarily unavailable.";
    }

    const normalized = normalizeUrl(url);
    if (!normalized.ok) {
      return normalized.error;
    }

    try {
      const result = await withRetries<ExaResultsResponse>(
        () =>
          exa.getContents(normalized.url, {
            text: { maxCharacters: 10_000 },
          }),
        { retries: MAX_RETRIES, timeoutMs: SCRAPE_TIMEOUT_MS, label: "scrape" }
      );

      const results = result.results ?? [];
      if (results.length === 0) {
        return "Could not retrieve content from this URL.";
      }

      const page = results[0];
      const text = page.text || "";

      if (!text) {
        return "No text content found on this page.";
      }

      return `Title: ${page.title || "Unknown"}
URL: ${page.url || normalized.url}

Content:
${text}`;
    } catch (error) {
      console.error("Web scrape failed:", error);
      if (isRetryableError(error)) {
        return "Web scraping is temporarily unavailable. Please try again shortly.";
      }
      return "Failed to scrape webpage. The page may be inaccessible or blocked.";
    }
  },
});
