/**
 * Slack Knowledge Base Backfill Script
 *
 * Fetches historical messages from target Slack channels since Jan 9, 2026
 * and extracts knowledge using Claude to populate the team's notes.
 *
 * Usage: pnpm tsx scripts/backfill-knowledge.ts
 */

import { generateText } from "ai";
import { anthropic } from "@ai-sdk/anthropic";
import {
  listChannels,
  getChannelHistorySince,
  resolveUserNames,
  type HistoricalMessage,
} from "@/lib/slack/actions";
import {
  loadFilesystemState,
  saveFilesystemState,
} from "@/lib/memory";

// Configuration
const TEAM_ID = "TCFK1FD5K";
const TARGET_CHANNELS = ["build", "cad", "general", "strats", "programming"];
// Jan 9, 2026 00:00:00 UTC as Unix timestamp
const OLDEST_TIMESTAMP = "1736380800";
const MESSAGES_PER_BATCH = 75; // Target messages per LLM call

interface MessageBatch {
  channelName: string;
  channelId: string;
  messages: FormattedMessage[];
  dateRange: { start: Date; end: Date };
}

interface FormattedMessage {
  user: string;
  text: string;
  timestamp: Date;
  isThread: boolean;
  threadReplies?: FormattedMessage[];
}

interface ExtractedKnowledge {
  file: string;
  content: string;
  append: boolean;
}

/**
 * Format a message for the LLM, including thread replies
 */
function formatMessage(
  msg: HistoricalMessage,
  userMap: Map<string, string>
): FormattedMessage {
  const formatted: FormattedMessage = {
    user: userMap.get(msg.userId) || msg.user,
    text: msg.text,
    timestamp: new Date(parseFloat(msg.timestamp) * 1000),
    isThread: !!msg.threadTs && msg.threadTs !== msg.timestamp,
  };

  if (msg.replies && msg.replies.length > 0) {
    formatted.threadReplies = msg.replies.map((reply) => ({
      user: userMap.get(reply.userId) || reply.user,
      text: reply.text,
      timestamp: new Date(parseFloat(reply.timestamp) * 1000),
      isThread: true,
    }));
  }

  return formatted;
}

/**
 * Format messages as human-readable conversation for the LLM
 */
function formatMessagesForLLM(batch: MessageBatch): string {
  const lines: string[] = [];
  lines.push(`# Channel: #${batch.channelName}`);
  lines.push(
    `# Date Range: ${batch.dateRange.start.toLocaleDateString()} - ${batch.dateRange.end.toLocaleDateString()}`
  );
  lines.push("");

  for (const msg of batch.messages) {
    const dateStr = msg.timestamp.toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
    });
    const timeStr = msg.timestamp.toLocaleTimeString("en-US", {
      hour: "numeric",
      minute: "2-digit",
    });

    lines.push(`[${dateStr} ${timeStr}] ${msg.user}: ${msg.text}`);

    // Add thread replies indented
    if (msg.threadReplies && msg.threadReplies.length > 0) {
      for (const reply of msg.threadReplies) {
        const replyTimeStr = reply.timestamp.toLocaleTimeString("en-US", {
          hour: "numeric",
          minute: "2-digit",
        });
        lines.push(`  ↳ [${replyTimeStr}] ${reply.user}: ${reply.text}`);
      }
    }
  }

  return lines.join("\n");
}

/**
 * Batch messages by channel, keeping threads together
 * Splits into day-based batches if a channel has too many messages
 */
function batchMessages(
  channelName: string,
  channelId: string,
  messages: FormattedMessage[]
): MessageBatch[] {
  if (messages.length === 0) return [];

  // Sort messages by timestamp
  const sorted = [...messages].sort(
    (a, b) => a.timestamp.getTime() - b.timestamp.getTime()
  );

  // If the total is small enough, return as single batch
  const totalMessages = sorted.reduce(
    (sum, msg) => sum + 1 + (msg.threadReplies?.length || 0),
    0
  );

  if (totalMessages <= MESSAGES_PER_BATCH) {
    return [
      {
        channelName,
        channelId,
        messages: sorted,
        dateRange: {
          start: sorted[0].timestamp,
          end: sorted[sorted.length - 1].timestamp,
        },
      },
    ];
  }

  // Split by day
  const batches: MessageBatch[] = [];
  let currentBatch: FormattedMessage[] = [];
  let currentDate: string | null = null;
  let batchStart: Date | null = null;

  for (const msg of sorted) {
    const msgDate = msg.timestamp.toISOString().split("T")[0];

    // Check if we need to start a new batch (new day or batch too large)
    const currentBatchSize = currentBatch.reduce(
      (sum, m) => sum + 1 + (m.threadReplies?.length || 0),
      0
    );
    const msgSize = 1 + (msg.threadReplies?.length || 0);

    if (
      (currentDate && msgDate !== currentDate) ||
      currentBatchSize + msgSize > MESSAGES_PER_BATCH
    ) {
      if (currentBatch.length > 0) {
        batches.push({
          channelName,
          channelId,
          messages: currentBatch,
          dateRange: {
            start: batchStart!,
            end: currentBatch[currentBatch.length - 1].timestamp,
          },
        });
      }
      currentBatch = [];
      batchStart = null;
    }

    if (!batchStart) {
      batchStart = msg.timestamp;
    }
    currentDate = msgDate;
    currentBatch.push(msg);
  }

  // Don't forget the last batch
  if (currentBatch.length > 0) {
    batches.push({
      channelName,
      channelId,
      messages: currentBatch,
      dateRange: {
        start: batchStart!,
        end: currentBatch[currentBatch.length - 1].timestamp,
      },
    });
  }

  return batches;
}

/**
 * Extract knowledge from a message batch using Claude
 */
async function extractKnowledge(batch: MessageBatch): Promise<ExtractedKnowledge[]> {
  const conversationText = formatMessagesForLLM(batch);

  const systemPrompt = `You are a knowledge extraction assistant for an FRC (FIRST Robotics Competition) team. 
Your job is to read Slack conversations and extract important information that the team should remember.

Extract the following types of information:
1. **Team Decisions**: Choices made about robot design, strategy, or team operations
2. **Robot Specifications**: Measurements, gear ratios, motor choices, mechanism details
3. **Action Items**: Tasks assigned to specific people or deadlines mentioned
4. **Strategy Notes**: Game strategy discussions, match analysis, scouting data
5. **Meeting Notes**: Summaries of team meetings or key discussions

For each piece of knowledge, output a JSON object in this format:
{
  "file": "team-files/notes/<filename>.md",
  "content": "<the content to write>",
  "append": true/false
}

Guidelines for file organization:
- Use "decisions.md" for major team decisions
- Use "robot-specs.md" for robot specifications and measurements
- Use "todo.md" for action items and assignments
- Use "strategy.md" for game strategy and match analysis
- Use "meetings/YYYY-MM-DD.md" for meeting summaries

Content guidelines:
- Be concise but include all relevant details
- Include dates when relevant
- For specs, include exact numbers/measurements
- For decisions, include the rationale if discussed
- For action items, include who is responsible and any deadlines
- Use markdown formatting appropriately

If the conversation doesn't contain any extractable knowledge (e.g., casual chat, jokes, off-topic), return an empty array.

Respond with ONLY a JSON array of extraction objects, no other text.`;

  const userPrompt = `Extract knowledge from this Slack conversation:

${conversationText}

Return a JSON array of knowledge extractions. If nothing worth saving, return [].`;

  try {
    const result = await generateText({
      model: anthropic("claude-sonnet-4-20250514"),
      system: systemPrompt,
      messages: [{ role: "user", content: userPrompt }],
    });

    // Parse the JSON response
    const responseText = result.text.trim();
    
    // Handle empty or no-op responses
    if (!responseText || responseText === "[]") {
      return [];
    }

    // Try to extract JSON from the response (Claude sometimes adds markdown code blocks)
    let jsonStr = responseText;
    const jsonMatch = responseText.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
    if (jsonMatch) {
      jsonStr = jsonMatch[1];
    }

    const extractions = JSON.parse(jsonStr) as ExtractedKnowledge[];
    return extractions.filter(
      (e) => e.file && e.content && typeof e.append === "boolean"
    );
  } catch (error) {
    console.error(
      `Failed to extract knowledge from #${batch.channelName}:`,
      error
    );
    return [];
  }
}

/**
 * Merge extracted knowledge with existing files
 */
async function writeKnowledge(
  extractions: ExtractedKnowledge[],
  existingFiles: Record<string, string>
): Promise<Record<string, string>> {
  const updatedFiles = { ...existingFiles };

  for (const extraction of extractions) {
    const { file, content, append } = extraction;

    // Ensure the file path is valid
    if (!file.startsWith("team-files/notes/")) {
      console.warn(`Skipping invalid file path: ${file}`);
      continue;
    }

    if (append && updatedFiles[file]) {
      // Append to existing content with a separator
      updatedFiles[file] = `${updatedFiles[file]}\n\n---\n\n${content}`;
    } else {
      // Overwrite or create new file
      updatedFiles[file] = content;
    }

    console.log(`  ${append ? "Appended to" : "Wrote"}: ${file}`);
  }

  return updatedFiles;
}

/**
 * Main backfill function
 */
async function main() {
  console.log("🚀 Starting Slack Knowledge Base Backfill");
  console.log(`📅 Fetching messages since Jan 9, 2026`);
  console.log(`📂 Target channels: ${TARGET_CHANNELS.join(", ")}`);
  console.log("");

  // 1. Get all channels and filter to targets
  console.log("📋 Fetching channel list...");
  const channels = await listChannels();
  const targetChannelMap = new Map<string, string>();

  for (const ch of channels) {
    if (TARGET_CHANNELS.includes(ch.name.toLowerCase())) {
      targetChannelMap.set(ch.name.toLowerCase(), ch.id);
      console.log(`  Found #${ch.name} (${ch.id})`);
    }
  }

  const missingChannels = TARGET_CHANNELS.filter(
    (name) => !targetChannelMap.has(name.toLowerCase())
  );
  if (missingChannels.length > 0) {
    console.warn(`⚠️  Missing channels: ${missingChannels.join(", ")}`);
  }
  console.log("");

  // 2. Load existing files from Convex
  console.log("💾 Loading existing knowledge base...");
  let files = await loadFilesystemState(TEAM_ID);
  console.log(`  Found ${Object.keys(files).length} existing files`);
  console.log("");

  // 3. Fetch messages from each channel
  const allBatches: MessageBatch[] = [];

  for (const [channelName, channelId] of targetChannelMap) {
    console.log(`📥 Fetching #${channelName}...`);

    const messages = await getChannelHistorySince(channelId, OLDEST_TIMESTAMP, {
      includeThreads: true,
      onProgress: (fetched, hasMore) => {
        process.stdout.write(`\r  Fetched ${fetched} messages${hasMore ? "..." : " ✓"}`);
      },
    });
    console.log("");

    if (messages.length === 0) {
      console.log(`  No messages found in #${channelName}`);
      continue;
    }

    // Resolve user names
    const userIds = new Set<string>();
    for (const msg of messages) {
      if (msg.userId) userIds.add(msg.userId);
      if (msg.replies) {
        for (const reply of msg.replies) {
          if (reply.userId) userIds.add(reply.userId);
        }
      }
    }

    console.log(`  Resolving ${userIds.size} user names...`);
    const userMap = await resolveUserNames([...userIds]);

    // Format and batch messages
    const formattedMessages = messages.map((msg) => formatMessage(msg, userMap));
    const batches = batchMessages(channelName, channelId, formattedMessages);
    console.log(`  Created ${batches.length} batch(es)`);

    allBatches.push(...batches);
  }

  console.log("");
  console.log(`📦 Total batches to process: ${allBatches.length}`);
  console.log("");

  // 4. Process each batch through LLM
  let totalExtractions = 0;

  for (let i = 0; i < allBatches.length; i++) {
    const batch = allBatches[i];
    const messageCount = batch.messages.reduce(
      (sum, m) => sum + 1 + (m.threadReplies?.length || 0),
      0
    );

    console.log(
      `🔍 Processing batch ${i + 1}/${allBatches.length}: #${batch.channelName} (${messageCount} messages)`
    );

    const extractions = await extractKnowledge(batch);

    if (extractions.length > 0) {
      console.log(`  📝 Extracted ${extractions.length} knowledge items`);
      files = await writeKnowledge(extractions, files);
      totalExtractions += extractions.length;
    } else {
      console.log(`  ⏭️  No extractable knowledge in this batch`);
    }

    // Add a small delay between batches to avoid rate limits
    if (i < allBatches.length - 1) {
      await new Promise((resolve) => setTimeout(resolve, 500));
    }
  }

  console.log("");

  // 5. Save updated files to Convex
  if (totalExtractions > 0) {
    console.log("💾 Saving knowledge base to Convex...");
    await saveFilesystemState(TEAM_ID, files);
    console.log("  ✓ Saved successfully");
  } else {
    console.log("ℹ️  No new knowledge extracted, skipping save");
  }

  console.log("");
  console.log("✅ Backfill complete!");
  console.log(`   Channels processed: ${targetChannelMap.size}`);
  console.log(`   Batches processed: ${allBatches.length}`);
  console.log(`   Knowledge items extracted: ${totalExtractions}`);
}

// Run the script
main().catch((error) => {
  console.error("❌ Backfill failed:", error);
  process.exit(1);
});
