import { z } from "zod";
import { tool } from "ai";
import {
  searchMessages,
  getChannelHistory,
  listChannels,
} from "@/lib/slack/actions";

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

export const slackChannelHistoryTool = tool({
  description:
    "Get the most recent messages from a Slack channel. Use this to understand ongoing conversations, get context about what the team is discussing, or catch up on recent activity in a channel.",
  inputSchema: z.object({
    channel: z
      .string()
      .describe(
        "The channel ID (e.g., 'C01234567') or channel name without # (e.g., 'general'). Use listChannels first if you need to find the channel ID."
      ),
    limit: z
      .number()
      .min(1)
      .max(50)
      .default(10)
      .describe("Number of recent messages to retrieve (1-50, default 10)"),
  }),
  execute: async ({ channel, limit }) => {
    // If a channel name is provided instead of ID, try to find the ID
    let channelId = channel;
    if (!channel.startsWith("C") && !channel.startsWith("G")) {
      const channels = await listChannels();
      const found = channels.find(
        (ch) => ch.name.toLowerCase() === channel.toLowerCase()
      );
      if (found) {
        channelId = found.id;
      } else {
        return `Could not find channel "${channel}". Use slackListChannels to see available channels.`;
      }
    }

    const messages = await getChannelHistory(channelId, limit);

    if (messages.length === 0) {
      return "No messages found in this channel (or the bot doesn't have access).";
    }

    const formatted = messages
      .reverse() // Show oldest first for conversation flow
      .map((msg) => {
        const date = new Date(parseFloat(msg.timestamp) * 1000);
        const threadInfo = msg.replyCount ? ` [${msg.replyCount} replies]` : "";
        return `[${date.toLocaleString()}] ${msg.user}: ${msg.text}${threadInfo}`;
      })
      .join("\n\n");

    return `Last ${messages.length} messages:\n\n${formatted}`;
  },
});

export const slackListChannelsTool = tool({
  description:
    "List all Slack channels the bot has access to. Use this to discover channel names and IDs before using slackChannelHistory.",
  inputSchema: z.object({}),
  execute: async () => {
    const channels = await listChannels();

    if (channels.length === 0) {
      return "No channels found or bot doesn't have access to any channels.";
    }

    const memberChannels = channels.filter((ch) => ch.isMember);
    const formatted = memberChannels
      .map((ch) => `• #${ch.name} (${ch.id})`)
      .join("\n");

    return `Bot has access to ${memberChannels.length} channels:\n\n${formatted}`;
  },
});
