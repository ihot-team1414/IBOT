import { tool } from "ai";
import { z } from "zod";
import crypto from "crypto";
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

const launchedAgentRefs = new Map<string, string>();

export function resolveCursorCloudAgentId(agentRef: string): string | undefined {
  if (agentRef.startsWith("bc_")) return agentRef;
  return launchedAgentRefs.get(agentRef);
}

function requireCursorCloudAgentId(agentRef: string): string {
  const id = resolveCursorCloudAgentId(agentRef);
  if (!id) {
    throw new Error(
      "Unknown agent reference. Launch an agent first or provide a valid bc_... agent id."
    );
  }
  return id;
}

const cursorAgentRefSchema = z
  .string()
  .min(1)
  .describe(
    "Cursor Cloud Agent reference. Either a real agent id (bc_...) or a launchRef returned by this tool."
  );

export const cursorCloudAgentsTool = tool({
  description:
    "Launch and control Cursor Cloud Agents for the FRC1414-Code-2026 repo. Always uses Auto model and always creates a PR. For launch, this tool returns a launchRef (not the agent id) so you can track it without exposing internal ids.",
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
      agentRef: cursorAgentRefSchema,
    }),
    z.object({
      action: z.literal("list"),
      limit: z.number().int().min(1).max(100).optional(),
      cursor: z.string().optional(),
    }),
    z.object({
      action: z.literal("conversation"),
      agentRef: cursorAgentRefSchema,
    }),
    z.object({
      action: z.literal("followup"),
      agentRef: cursorAgentRefSchema,
      promptText: z.string().min(1).describe("Follow-up instruction text."),
    }),
    z.object({
      action: z.literal("stop"),
      agentRef: cursorAgentRefSchema,
    }),
    z.object({
      action: z.literal("delete"),
      agentRef: cursorAgentRefSchema,
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
          const launchRef = crypto.randomUUID();
          launchedAgentRefs.set(launchRef, agent.id);
          return {
            ok: true,
            action: "launch",
            status: agent.status,
            launchRef,
          };
        }
        case "status": {
          const agent = await getCursorCloudAgent(
            requireCursorCloudAgentId(input.agentRef)
          );
          return {
            ok: true,
            action: "status",
            status: agent.status,
            prUrl: agent.target?.prUrl,
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
          const convo = await getCursorCloudAgentConversation(
            requireCursorCloudAgentId(input.agentRef)
          );
          return { ok: true, action: "conversation", ...convo };
        }
        case "followup": {
          const res = await followupCursorCloudAgent({
            id: requireCursorCloudAgentId(input.agentRef),
            promptText: input.promptText,
          });
          return { ok: true, action: "followup", ...res };
        }
        case "stop": {
          const res = await stopCursorCloudAgent(
            requireCursorCloudAgentId(input.agentRef)
          );
          return { ok: true, action: "stop", ...res };
        }
        case "delete": {
          const res = await deleteCursorCloudAgent(
            requireCursorCloudAgentId(input.agentRef)
          );
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

