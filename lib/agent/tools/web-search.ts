import { z } from "zod";
import { tool } from "ai";
import Exa from "exa-js";

const exa = new Exa(process.env.EXA_API_KEY);

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
    try {
      const result = await exa.searchAndContents(query, {
        type: "auto",
        numResults: 5,
        highlights: true,
      });

      if (!result.results || result.results.length === 0) {
        return "No web results found for your query.";
      }

      const formatted = result.results
        .map((item, index) => {
          const highlights =
            item.highlights?.join("\n   ...") || (item as { text?: string }).text?.slice(0, 300) || "";
          return `${index + 1}. ${item.title}
   URL: ${item.url}
   ${highlights}`;
        })
        .join("\n\n");

      return `Found ${result.results.length} web results:\n\n${formatted}`;
    } catch (error) {
      console.error("Web search failed:", error);
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
    try {
      const result = await exa.getContents(url, {
        text: { maxCharacters: 10000 },
      });

      if (!result.results || result.results.length === 0) {
        return "Could not retrieve content from this URL.";
      }

      const page = result.results[0];
      const text = (page as { text?: string }).text || "";
      
      if (!text) {
        return "No text content found on this page.";
      }

      return `Title: ${page.title || "Unknown"}
URL: ${page.url}

Content:
${text}`;
    } catch (error) {
      console.error("Web scrape failed:", error);
      return "Failed to scrape webpage. The page may be inaccessible or blocked.";
    }
  },
});
