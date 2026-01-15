import { query, mutation } from "./_generated/server";
import { v } from "convex/values";

// Query: Get filesystem state for a team
export const getState = query({
  args: { teamId: v.string() },
  handler: async (ctx, args) => {
    const state = await ctx.db
      .query("teamFilesState")
      .withIndex("by_team", (q) => q.eq("teamId", args.teamId))
      .unique();
    return state;
  },
});

// Mutation: Save filesystem state for a team
export const saveState = mutation({
  args: {
    teamId: v.string(),
    files: v.array(v.object({
      path: v.string(),
      content: v.string(),
    })),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("teamFilesState")
      .withIndex("by_team", (q) => q.eq("teamId", args.teamId))
      .unique();

    if (existing) {
      await ctx.db.patch(existing._id, {
        files: args.files,
        updatedAt: Date.now(),
      });
    } else {
      await ctx.db.insert("teamFilesState", {
        teamId: args.teamId,
        files: args.files,
        updatedAt: Date.now(),
        version: 1,
      });
    }
  },
});

// Mutation: Clear filesystem state (for admin/reset)
export const clearState = mutation({
  args: { teamId: v.string() },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("teamFilesState")
      .withIndex("by_team", (q) => q.eq("teamId", args.teamId))
      .unique();

    if (existing) {
      await ctx.db.delete(existing._id);
    }
  },
});
