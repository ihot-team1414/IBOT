import { slack } from "./client";
import type { MessageElement } from "@slack/web-api/dist/types/response/ConversationsHistoryResponse";

interface FormattedMessage {
  user: string;
  text: string;
  timestamp: string;
  threadTs?: string;
}

// Cache for user info to avoid repeated API calls
const userCache = new Map<string, string>();

/**
 * Get user display name from user ID
 */
async function getUserName(userId: string): Promise<string> {
  if (userCache.has(userId)) {
    return userCache.get(userId)!;
  }

  try {
    const result = await slack.users.info({ user: userId });
    const displayName =
      result.user?.profile?.display_name ||
      result.user?.real_name ||
      result.user?.name ||
      userId;
    userCache.set(userId, displayName);
    return displayName;
  } catch (error) {
    console.error(`Failed to fetch user info for ${userId}:`, error);
    return userId;
  }
}

/**
 * Fetches all messages in a thread
 */
export async function getThreadContext(
  channel: string,
  threadTs: string
): Promise<MessageElement[]> {
  try {
    const result = await slack.conversations.replies({
      channel,
      ts: threadTs,
      limit: 100,
    });
    return result.messages || [];
  } catch (error) {
    console.error("Failed to fetch thread context:", error);
    return [];
  }
}

/**
 * Fetches the last N messages from a channel
 */
export async function getChannelContext(
  channel: string,
  limit: number = 10
): Promise<MessageElement[]> {
  try {
    const result = await slack.conversations.history({
      channel,
      limit,
    });
    // Messages come in reverse chronological order, so reverse them
    return (result.messages || []).reverse();
  } catch (error) {
    console.error("Failed to fetch channel context:", error);
    return [];
  }
}

/**
 * Converts Slack messages to a readable format for the AI
 */
export async function formatMessagesForContext(
  messages: MessageElement[]
): Promise<string> {
  const formattedMessages: FormattedMessage[] = await Promise.all(
    messages.map(async (msg) => {
      const userName = msg.user ? await getUserName(msg.user) : "Unknown";
      return {
        user: userName,
        text: msg.text || "",
        timestamp: msg.ts || "",
        threadTs: msg.thread_ts,
      };
    })
  );

  return formattedMessages
    .map((msg) => {
      const date = new Date(parseFloat(msg.timestamp) * 1000);
      const timeStr = date.toLocaleString();
      return `[${timeStr}] ${msg.user}: ${msg.text}`;
    })
    .join("\n");
}
