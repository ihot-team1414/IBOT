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
});
