import { slack } from "./client";

/**
 * Add an emoji reaction to a message
 */
export async function addReaction(
  channel: string,
  timestamp: string,
  emoji: string
): Promise<boolean> {
  try {
    await slack.reactions.add({
      channel,
      timestamp,
      name: emoji,
    });
    return true;
  } catch (error) {
    // Ignore "already_reacted" errors
    if ((error as { data?: { error?: string } })?.data?.error === "already_reacted") {
      return true;
    }
    console.error("Failed to add reaction:", error);
    return false;
  }
}

/**
 * Remove an emoji reaction from a message
 */
export async function removeReaction(
  channel: string,
  timestamp: string,
  emoji: string
): Promise<boolean> {
  try {
    await slack.reactions.remove({
      channel,
      timestamp,
      name: emoji,
    });
    return true;
  } catch (error) {
    console.error("Failed to remove reaction:", error);
    return false;
  }
}

/**
 * Post a message to a channel or thread
 */
export async function postMessage(
  channel: string,
  text: string,
  threadTs?: string
): Promise<string | undefined> {
  try {
    const result = await slack.chat.postMessage({
      channel,
      text,
      thread_ts: threadTs,
      // Use mrkdwn format for better readability
      mrkdwn: true,
    });
    return result.ts;
  } catch (error) {
    console.error("Failed to post message:", error);
    return undefined;
  }
}

export interface SlackSearchResult {
  channel: string;
  channelName: string;
  user: string;
  text: string;
  timestamp: string;
  permalink: string;
}

/**
 * Search messages in the Slack workspace
 */
export async function searchMessages(
  query: string
): Promise<SlackSearchResult[]> {
  try {
    const result = await slack.search.messages({
      query,
      count: 10,
      sort: "timestamp",
      sort_dir: "desc",
    });

    const matches = result.messages?.matches || [];
    return matches.map((match) => ({
      channel: match.channel?.id || "",
      channelName: match.channel?.name || "",
      user: match.user || match.username || "Unknown",
      text: match.text || "",
      timestamp: match.ts || "",
      permalink: match.permalink || "",
    }));
  } catch (error) {
    console.error("Failed to search messages:", error);
    return [];
  }
}
