import { generateText, stepCountIs } from "ai";
import { anthropic } from "@ai-sdk/anthropic";
import { slackSearchTool } from "./tools/slack-search";
import { webSearchTool } from "./tools/web-search";
import { getTeamFilesTools } from "./tools/team-files";
import {
  cursorCloudAgentsTool,
  resolveCursorCloudAgentId,
} from "./tools/cursor-cloud-agents";

const SYSTEM_PROMPT = `You are a helpful FRC assistant for an FRC team's Slack.

Keep it short:
- 1-2 sentences max
- Use short, punchy sentences
- Break up text with newlines - no walls of text
- Be conversational like a teammate, not an encyclopedia

Tools:
- \`teamFiles\`: Search/read the 2026 FRC Game Manual in team-files/manual/
- \`slackSearch\`: Search team's Slack history
- \`webSearch\`: Search the web - *strongly prefer Chief Delphi (chiefdelphi.com)* for FRC questions
- \`cursorCloudAgents\`: Launch/manage Cursor Cloud Agents to implement code changes in the team's code repo (always creates a PR)

Rules:
1. *ALWAYS cite your source* - specific rule (e.g. "per R501") or URL
2. For rules: check manual first, then Chief Delphi for interpretations
3. For technical/strategy: search Chief Delphi first
4. Use Slack mrkdwn: *bold*, \`code\`, <url|link text>
5. Not sure? Say so briefly. Suggest where to look.

Be brief. Cite sources. Use newlines.`;

export type RunAgentDetails = {
  text: string;
  launchedCursorAgentIds: string[];
};

export async function runAgent(prompt: string, context: string): Promise<string> {
  const details = await runAgentWithDetails(prompt, context);
  return details.text;
}

export async function runAgentWithDetails(
  prompt: string,
  context: string
): Promise<RunAgentDetails> {
  try {
    const fullPrompt = context
      ? `Here is the recent conversation context:\n\n${context}\n\n---\n\nUser's request: ${prompt}`
      : prompt;

    // Get the team files bash tool
    const teamFilesTools = await getTeamFilesTools();

    const result = await generateText({
      model: anthropic("claude-sonnet-4-20250514"),
      system: SYSTEM_PROMPT,
      prompt: fullPrompt,
      tools: {
        teamFiles: teamFilesTools.bash,
        slackSearch: slackSearchTool,
        webSearch: webSearchTool,
        cursorCloudAgents: cursorCloudAgentsTool,
      },
      stopWhen: stepCountIs(10),
    });

    const launchedCursorAgentIds: string[] = [];
    for (const tr of result.toolResults ?? []) {
      // Tool result shape depends on SDK internals; keep defensive runtime checks.
      const toolName = (tr as { toolName?: unknown }).toolName;
      const toolResult = (tr as { result?: unknown }).result;
      if (toolName !== "cursorCloudAgents") continue;
      if (
        toolResult &&
        typeof toolResult === "object" &&
        (toolResult as { action?: unknown }).action === "launch"
      ) {
        const launchRef = (toolResult as { launchRef?: unknown }).launchRef;
        if (typeof launchRef === "string") {
          const agentId = resolveCursorCloudAgentId(launchRef);
          if (agentId) launchedCursorAgentIds.push(agentId);
        }
      }
    }

    return {
      text: result.text || "I wasn't able to generate a response. Please try again.",
      launchedCursorAgentIds,
    };
  } catch (error) {
    console.error("Agent execution failed:", error);
    throw error;
  }
}
