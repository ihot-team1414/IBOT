import { NextRequest, NextResponse } from "next/server";
import { after } from "next/server";
import { verifySlackRequest } from "@/lib/slack/verify";
import { addReaction, postMessage, removeReaction } from "@/lib/slack/actions";
import {
  getThreadContext,
  getChannelContext,
  formatMessagesForContext,
  extractImagesFromMessage,
  type ImageAttachment,
} from "@/lib/slack/context";
import { runAgent } from "@/lib/agent";

// Store processed event IDs to handle duplicate events from Slack
const processedEvents = new Set<string>();

// Clean up old event IDs periodically (keep for 5 minutes)
setInterval(() => {
  processedEvents.clear();
}, 5 * 60 * 1000);

interface SlackFile {
  mimetype?: string;
  url_private?: string;
  url_private_download?: string;
}

interface SlackEvent {
  type: string;
  event_id?: string;
  team_id?: string;  // Slack workspace/team ID for memory isolation
  challenge?: string;
  event?: {
    type: string;
    user: string;
    text: string;
    ts: string;
    thread_ts?: string;
    channel: string;
    event_ts: string;
    files?: SlackFile[];
  };
}

/**
 * Remove bot mention from message text
 * Slack formats mentions as <@USER_ID>
 */
function removeBotMention(text: string): string {
  // Remove the <@BOT_ID> mention pattern
  return text.replace(/<@[A-Z0-9]+>/g, "").trim();
}

/**
 * Process the mention event asynchronously
 */
async function processEvent(event: SlackEvent["event"], teamId: string) {
  if (!event) return;

  const { channel, ts, thread_ts, text } = event;
  const replyThreadTs = thread_ts || ts;

  try {
    // React with eyes emoji to show we're processing
    await addReaction(channel, ts, "eyes");

    // Get conversation context
    let context: string;
    if (thread_ts) {
      // If in a thread, get full thread context
      const messages = await getThreadContext(channel, thread_ts);
      context = await formatMessagesForContext(messages);
    } else {
      // Otherwise get recent channel messages
      const messages = await getChannelContext(channel, 10);
      context = await formatMessagesForContext(messages);
    }

    // Extract images from the message
    let images: ImageAttachment[] = [];
    if (event.files && event.files.length > 0) {
      // Convert event to MessageElement-like structure for extractImagesFromMessage
      images = await extractImagesFromMessage({
        files: event.files,
      } as Parameters<typeof extractImagesFromMessage>[0]);
    }

    // Extract the actual query by removing the bot mention
    const query = removeBotMention(text);

    // Run the AI agent with team ID for memory isolation and images
    const response = await runAgent(query, context, { teamId, images });

    // Post the response in the thread
    await postMessage(channel, response, replyThreadTs);

    // Remove eyes reaction and add checkmark
    await removeReaction(channel, ts, "eyes");
    await addReaction(channel, ts, "white_check_mark");
  } catch (error) {
    console.error("Error processing event:", error);

    // Try to post an error message
    try {
      await postMessage(
        channel,
        "Sorry, I encountered an error while processing your request. Please try again.",
        replyThreadTs
      );
      await removeReaction(channel, ts, "eyes");
      await addReaction(channel, ts, "x");
    } catch {
      // Ignore errors when posting error message
    }
  }
}

export async function POST(request: NextRequest) {
  // Get raw body for signature verification
  const body = await request.text();

  // Verify the request is from Slack
  const signature = request.headers.get("x-slack-signature");
  const timestamp = request.headers.get("x-slack-request-timestamp");

  if (!verifySlackRequest(signature, timestamp, body)) {
    console.error("Invalid Slack signature");
    return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
  }

  // Parse the event payload
  let payload: SlackEvent;
  try {
    payload = JSON.parse(body);
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  // Handle URL verification challenge (sent during Slack app setup)
  if (payload.type === "url_verification") {
    return NextResponse.json({ challenge: payload.challenge });
  }

  // Handle event callbacks
  if (payload.type === "event_callback" && payload.event) {
    const event = payload.event;
    const teamId = payload.team_id || "default"; // Fallback for safety

    // Only handle app_mention events
    if (event.type !== "app_mention") {
      return NextResponse.json({ ok: true });
    }

    // Check for duplicate events using event_ts as unique identifier
    const eventId = `${event.channel}-${event.event_ts}`;
    if (processedEvents.has(eventId)) {
      console.log("Duplicate event, skipping:", eventId);
      return NextResponse.json({ ok: true });
    }
    processedEvents.add(eventId);

    // Use after() to process the event after the response is sent
    // This keeps the serverless function alive until processing completes
    after(async () => {
      try {
        await processEvent(event, teamId);
      } catch (error) {
        console.error("Background event processing failed:", error);
      }
    });

    // Respond immediately to Slack
    return NextResponse.json({ ok: true });
  }

  return NextResponse.json({ ok: true });
}
