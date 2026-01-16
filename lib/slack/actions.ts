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

export interface ChannelMessage {
  user: string;
  text: string;
  timestamp: string;
  threadTs?: string;
  replyCount?: number;
}

/**
 * Get the last k messages from a channel
 * Auto-joins public channels if not already a member
 */
export async function getChannelHistory(
  channel: string,
  limit: number = 10
): Promise<ChannelMessage[]> {
  try {
    // Try to get history, auto-join if we get "not_in_channel" error
    let result;
    try {
      result = await slack.conversations.history({
        channel,
        limit: Math.min(limit, 100),
      });
    } catch (error) {
      const slackError = error as { data?: { error?: string } };
      if (slackError?.data?.error === "not_in_channel") {
        // Try to join the channel first
        const joined = await joinChannel(channel);
        if (joined) {
          result = await slack.conversations.history({
            channel,
            limit: Math.min(limit, 100),
          });
        } else {
          throw error;
        }
      } else {
        throw error;
      }
    }

    const messages = result?.messages || [];
    
    // Get user info for each unique user ID
    const userIds = [...new Set(messages.map((m) => m.user).filter(Boolean))];
    const userMap = new Map<string, string>();
    
    await Promise.all(
      userIds.map(async (userId) => {
        try {
          const userInfo = await slack.users.info({ user: userId! });
          userMap.set(
            userId!,
            userInfo.user?.real_name || userInfo.user?.name || userId!
          );
        } catch {
          userMap.set(userId!, userId!);
        }
      })
    );

    return messages.map((msg) => ({
      user: userMap.get(msg.user || "") || msg.user || "Unknown",
      text: msg.text || "",
      timestamp: msg.ts || "",
      threadTs: msg.thread_ts,
      replyCount: msg.reply_count,
    }));
  } catch (error) {
    console.error("Failed to get channel history:", error);
    return [];
  }
}

/**
 * List all channels the bot has access to
 */
export async function listChannels(): Promise<
  { id: string; name: string; isMember: boolean }[]
> {
  try {
    const result = await slack.conversations.list({
      types: "public_channel,private_channel",
      exclude_archived: true,
      limit: 200,
    });

    return (result.channels || []).map((ch) => ({
      id: ch.id || "",
      name: ch.name || "",
      isMember: ch.is_member || false,
    }));
  } catch (error) {
    console.error("Failed to list channels:", error);
    return [];
  }
}

/**
 * Join a public channel
 */
export async function joinChannel(channel: string): Promise<boolean> {
  try {
    await slack.conversations.join({ channel });
    return true;
  } catch (error) {
    // Ignore "already_in_channel" errors
    if ((error as { data?: { error?: string } })?.data?.error === "already_in_channel") {
      return true;
    }
    console.error("Failed to join channel:", error);
    return false;
  }
}

/**
 * Get channel info by ID
 */
export async function getChannelInfo(
  channelId: string
): Promise<{ id: string; name: string } | null> {
  try {
    const result = await slack.conversations.info({ channel: channelId });
    return {
      id: result.channel?.id || channelId,
      name: result.channel?.name || "unknown",
    };
  } catch (error) {
    console.error("Failed to get channel info:", error);
    return null;
  }
}

/**
 * Get user info by ID
 */
export async function getUserInfo(
  userId: string
): Promise<{ id: string; name: string; realName: string } | null> {
  try {
    const result = await slack.users.info({ user: userId });
    return {
      id: result.user?.id || userId,
      name: result.user?.name || "unknown",
      realName: result.user?.real_name || result.user?.name || "Unknown User",
    };
  } catch (error) {
    console.error("Failed to get user info:", error);
    return null;
  }
}
