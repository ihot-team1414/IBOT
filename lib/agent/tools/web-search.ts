import { z } from "zod";
import { tool } from "ai";
import Exa from "exa-js";

const exa = new Exa(process.env.EXA_API_KEY);

export const webSearchTool = tool({
  description:
    "Search the web for information. Use this for general knowledge, current events, technical documentation, FRC-related questions, or any information not available in Slack.",
  inputSchema: z.object({
    query: z
      .string()
      .describe(
        "The search query. Be specific and include relevant context for better results."
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
