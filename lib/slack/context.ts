import { slack } from "./client";
import type { MessageElement } from "@slack/web-api/dist/types/response/ConversationsHistoryResponse";

interface FormattedMessage {
  user: string;
  text: string;
  timestamp: string;
  threadTs?: string;
}

export interface ImageAttachment {
  url: string;
  mimeType: string;
  base64?: string;
}

// Cache for user info to avoid repeated API calls
const userCache = new Map<string, string>();

/**
 * Download an image from Slack and convert to base64
 */
async function downloadSlackImage(url: string): Promise<string | null> {
  try {
    const response = await fetch(url, {
      headers: {
        Authorization: `Bearer ${process.env.SLACK_BOT_TOKEN}`,
      },
    });

    if (!response.ok) {
      console.error(`Failed to download image: ${response.status}`);
      return null;
    }

    const arrayBuffer = await response.arrayBuffer();
    const base64 = Buffer.from(arrayBuffer).toString("base64");
    return base64;
  } catch (error) {
    console.error("Error downloading Slack image:", error);
    return null;
  }
}

/**
 * Extract images from a Slack message
 */
export async function extractImagesFromMessage(
  message: MessageElement
): Promise<ImageAttachment[]> {
  const images: ImageAttachment[] = [];

  // Check for files attached to the message
  if (message.files && Array.isArray(message.files)) {
    for (const file of message.files) {
      // Only process image files
      if (file.mimetype?.startsWith("image/")) {
        const url = file.url_private || file.url_private_download;
        if (url) {
          const base64 = await downloadSlackImage(url);
          if (base64) {
            images.push({
              url,
              mimeType: file.mimetype,
              base64,
            });
          }
        }
      }
    }
  }

  return images;
}

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

/**
 * Extract images from all messages in a conversation
 */
export async function extractImagesFromMessages(
  messages: MessageElement[]
): Promise<ImageAttachment[]> {
  const allImages: ImageAttachment[] = [];

  for (const message of messages) {
    const images = await extractImagesFromMessage(message);
    allImages.push(...images);
  }

  return allImages;
}
