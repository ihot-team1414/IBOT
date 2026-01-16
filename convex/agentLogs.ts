import { v } from "convex/values";
import { mutation, query } from "./_generated/server";

// ============ Mutations ============

export const createRun = mutation({
  args: {
    runId: v.string(),
    teamId: v.string(),
    prompt: v.string(),
    // Optional metadata
    userId: v.optional(v.string()),
    userName: v.optional(v.string()),
    channelId: v.optional(v.string()),
    channelName: v.optional(v.string()),
    threadTs: v.optional(v.string()),
    isThread: v.optional(v.boolean()),
    imageCount: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    await ctx.db.insert("agentRuns", {
      runId: args.runId,
      teamId: args.teamId,
      prompt: args.prompt,
      status: "running",
      stepCount: 0,
      createdAt: Date.now(),
      userId: args.userId,
      userName: args.userName,
      channelId: args.channelId,
      channelName: args.channelName,
      threadTs: args.threadTs,
      isThread: args.isThread,
      imageCount: args.imageCount,
    });
  },
});

export const addStep = mutation({
  args: {
    runId: v.string(),
    stepIndex: v.number(),
    type: v.union(v.literal("tool_call"), v.literal("tool_result"), v.literal("text")),
    toolName: v.optional(v.string()),
    toolArgs: v.optional(v.string()),
    toolResult: v.optional(v.string()),
    text: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await ctx.db.insert("agentSteps", {
      runId: args.runId,
      stepIndex: args.stepIndex,
      type: args.type,
      toolName: args.toolName,
      toolArgs: args.toolArgs,
      toolResult: args.toolResult,
      text: args.text,
      createdAt: Date.now(),
    });

    // Update step count on the run
    const run = await ctx.db
      .query("agentRuns")
      .withIndex("by_run_id", (q) => q.eq("runId", args.runId))
      .first();

    if (run) {
      await ctx.db.patch(run._id, {
        stepCount: args.stepIndex + 1,
      });
    }
  },
});

export const completeRun = mutation({
  args: {
    runId: v.string(),
    response: v.string(),
    stepCount: v.number(),
    durationMs: v.number(),
  },
  handler: async (ctx, args) => {
    const run = await ctx.db
      .query("agentRuns")
      .withIndex("by_run_id", (q) => q.eq("runId", args.runId))
      .first();

    if (run) {
      await ctx.db.patch(run._id, {
        status: "completed",
        response: args.response,
        stepCount: args.stepCount,
        durationMs: args.durationMs,
        completedAt: Date.now(),
      });
    }
  },
});

export const failRun = mutation({
  args: {
    runId: v.string(),
    errorMessage: v.string(),
  },
  handler: async (ctx, args) => {
    const run = await ctx.db
      .query("agentRuns")
      .withIndex("by_run_id", (q) => q.eq("runId", args.runId))
      .first();

    if (run) {
      await ctx.db.patch(run._id, {
        status: "error",
        errorMessage: args.errorMessage,
        completedAt: Date.now(),
      });
    }
  },
});

// ============ Queries ============

export const listRuns = query({
  args: {
    teamId: v.optional(v.string()),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const limit = args.limit ?? 50;

    if (args.teamId) {
      return await ctx.db
        .query("agentRuns")
        .withIndex("by_team", (q) => q.eq("teamId", args.teamId!))
        .order("desc")
        .take(limit);
    }

    return await ctx.db
      .query("agentRuns")
      .withIndex("by_created")
      .order("desc")
      .take(limit);
  },
});

export const getRun = query({
  args: {
    runId: v.string(),
  },
  handler: async (ctx, args) => {
    const run = await ctx.db
      .query("agentRuns")
      .withIndex("by_run_id", (q) => q.eq("runId", args.runId))
      .first();

    if (!run) return null;

    const steps = await ctx.db
      .query("agentSteps")
      .withIndex("by_run", (q) => q.eq("runId", args.runId))
      .collect();

    // Sort steps by stepIndex
    steps.sort((a, b) => a.stepIndex - b.stepIndex);

    return {
      ...run,
      steps,
    };
  },
});

export const getRunSteps = query({
  args: {
    runId: v.string(),
  },
  handler: async (ctx, args) => {
    const steps = await ctx.db
      .query("agentSteps")
      .withIndex("by_run", (q) => q.eq("runId", args.runId))
      .collect();

    // Sort steps by stepIndex
    steps.sort((a, b) => a.stepIndex - b.stepIndex);

    return steps;
  },
});
