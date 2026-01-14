import { z } from "zod";
import { tool } from "ai";
import { searchMessages } from "@/lib/slack/actions";

export const slackSearchTool = tool({
  description:
    "Search for messages in the Slack workspace. Use this to find past discussions, decisions, or information shared in Slack channels.",
  inputSchema: z.object({
    query: z
      .string()
      .describe(
        "The search query. Can include Slack search modifiers like 'from:@user', 'in:#channel', 'before:date', 'after:date'"
      ),
  }),
  execute: async ({ query }) => {
    const results = await searchMessages(query);

    if (results.length === 0) {
      return "No messages found matching your search query.";
    }

    const formatted = results
      .map((result, index) => {
        const date = new Date(parseFloat(result.timestamp) * 1000);
        return `${index + 1}. [#${result.channelName}] ${result.user} (${date.toLocaleDateString()}):
   "${result.text}"
   Link: ${result.permalink}`;
      })
      .join("\n\n");

    return `Found ${results.length} messages:\n\n${formatted}`;
  },
});
