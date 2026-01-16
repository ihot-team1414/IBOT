import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export default defineSchema({
  teamFilesState: defineTable({
    teamId: v.string(),
    // Store files as array of {path, content} objects (Convex-friendly)
    files: v.array(v.object({
      path: v.string(),
      content: v.string(),
    })),
    updatedAt: v.number(), // Unix timestamp
    version: v.number(),   // Schema version for migrations
  }).index("by_team", ["teamId"]),

  // Agent observability tables
  agentRuns: defineTable({
    runId: v.string(),
    teamId: v.string(),
    prompt: v.string(),
    response: v.optional(v.string()),
    status: v.union(v.literal("running"), v.literal("completed"), v.literal("error")),
    errorMessage: v.optional(v.string()),
    stepCount: v.number(),
    durationMs: v.optional(v.number()),
    createdAt: v.number(),
    completedAt: v.optional(v.number()),
    // Request metadata for filtering
    userId: v.optional(v.string()),         // Slack user ID who tagged IBOT
    userName: v.optional(v.string()),       // Display name of the user
    channelId: v.optional(v.string()),      // Slack channel ID
    channelName: v.optional(v.string()),    // Channel name for display
    threadTs: v.optional(v.string()),       // Thread timestamp (if in a thread)
    isThread: v.optional(v.boolean()),      // Whether this was in a thread
    imageCount: v.optional(v.number()),     // Number of images attached
  })
    .index("by_team", ["teamId"])
    .index("by_created", ["createdAt"])
    .index("by_run_id", ["runId"])
    .index("by_channel", ["channelId"])
    .index("by_user", ["userId"]),

  agentSteps: defineTable({
    runId: v.string(),
    stepIndex: v.number(),
    type: v.union(v.literal("tool_call"), v.literal("tool_result"), v.literal("text")),
    toolName: v.optional(v.string()),
    toolArgs: v.optional(v.string()),
    toolResult: v.optional(v.string()),
    text: v.optional(v.string()),
    createdAt: v.number(),
  }).index("by_run", ["runId"]),
});
