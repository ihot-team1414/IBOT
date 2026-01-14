import { tool } from "ai";
import { z } from "zod";
import {
  deleteCursorCloudAgent,
  followupCursorCloudAgent,
  getCursorApiKeyInfo,
  getCursorCloudAgent,
  getCursorCloudAgentConversation,
  launchCursorCloudAgent,
  listCursorCloudAgents,
  stopCursorCloudAgent,
} from "@/lib/cursor/cloud-agents";

const cursorAgentIdSchema = z
  .string()
  .min(1)
  .describe("Cursor Cloud Agent id (e.g., bc_abc123)");

export const cursorCloudAgentsTool = tool({
  description:
    "Launch and control Cursor Cloud Agents for the FRC1414-Code-2026 repo. Use this to create a PR by having a cloud agent implement changes in that repo, then check status, fetch conversation, add follow-ups, or delete an agent. Model is always Auto and PR creation is always enabled.",
  inputSchema: z.discriminatedUnion("action", [
    z.object({
      action: z.literal("launch"),
      promptText: z
        .string()
        .min(1)
        .describe("Task prompt for the cloud agent."),
      ref: z
        .string()
        .optional()
        .describe("Base git ref to start from (defaults to repo default branch)."),
      branchName: z
        .string()
        .optional()
        .describe("Optional custom branch name for the agent to use."),
      name: z
        .string()
        .optional()
        .describe("Optional display name for the agent."),
    }),
    z.object({
      action: z.literal("status"),
      id: cursorAgentIdSchema,
    }),
    z.object({
      action: z.literal("list"),
      limit: z.number().int().min(1).max(100).optional(),
      cursor: z.string().optional(),
    }),
    z.object({
      action: z.literal("conversation"),
      id: cursorAgentIdSchema,
    }),
    z.object({
      action: z.literal("followup"),
      id: cursorAgentIdSchema,
      promptText: z.string().min(1).describe("Follow-up instruction text."),
    }),
    z.object({
      action: z.literal("stop"),
      id: cursorAgentIdSchema,
    }),
    z.object({
      action: z.literal("delete"),
      id: cursorAgentIdSchema,
    }),
    z.object({
      action: z.literal("me"),
    }),
  ]),
  execute: async (input) => {
    try {
      switch (input.action) {
        case "launch": {
          const agent = await launchCursorCloudAgent({
            promptText: input.promptText,
            ref: input.ref,
            branchName: input.branchName,
            name: input.name,
          });
          return {
            ok: true,
            action: "launch",
            agent,
            // High-signal convenience fields
            id: agent.id,
            cursorUrl: agent.target?.url,
            prUrl: agent.target?.prUrl,
            status: agent.status,
          };
        }
        case "status": {
          const agent = await getCursorCloudAgent(input.id);
          return {
            ok: true,
            action: "status",
            agent,
            id: agent.id,
            cursorUrl: agent.target?.url,
            prUrl: agent.target?.prUrl,
            status: agent.status,
          };
        }
        case "list": {
          const list = await listCursorCloudAgents({
            limit: input.limit,
            cursor: input.cursor,
          });
          return { ok: true, action: "list", ...list };
        }
        case "conversation": {
          const convo = await getCursorCloudAgentConversation(input.id);
          return { ok: true, action: "conversation", ...convo };
        }
        case "followup": {
          const res = await followupCursorCloudAgent({
            id: input.id,
            promptText: input.promptText,
          });
          return { ok: true, action: "followup", ...res };
        }
        case "stop": {
          const res = await stopCursorCloudAgent(input.id);
          return { ok: true, action: "stop", ...res };
        }
        case "delete": {
          const res = await deleteCursorCloudAgent(input.id);
          return { ok: true, action: "delete", ...res };
        }
        case "me": {
          const me = await getCursorApiKeyInfo();
          return { ok: true, action: "me", ...me };
        }
        default: {
          const _exhaustive: never = input;
          return _exhaustive;
        }
      }
    } catch (error) {
      return {
        ok: false,
        error:
          error instanceof Error
            ? error.message
            : "Unknown error calling Cursor Cloud Agents API",
      };
    }
  },
});

