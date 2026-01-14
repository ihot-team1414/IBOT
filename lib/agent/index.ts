import { generateText, stepCountIs } from "ai";
import { anthropic } from "@ai-sdk/anthropic";
import { slackSearchTool } from "./tools/slack-search";
import { webSearchTool } from "./tools/web-search";
import { getTeamFilesTools } from "./tools/team-files";
import { cursorCloudAgentsTool } from "./tools/cursor-cloud-agents";

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

If you launch a Cursor Cloud Agent, ALWAYS include a final line exactly like:
Cursor agent id: bc_xxx

Be brief. Cite sources. Use newlines.`;

type SlackMeta = { channel: string; threadTs: string };

export async function runAgent(prompt: string, context: string): Promise<string>;
export async function runAgent(
  prompt: string,
  context: string,
  slackMeta: SlackMeta
): Promise<string>;
export async function runAgent(opts: {
  prompt: string;
  context: string;
  slackMeta?: SlackMeta;
}): Promise<string>;
export async function runAgent(
  arg1: string | { prompt: string; context: string; slackMeta?: SlackMeta },
  arg2?: string,
  arg3?: SlackMeta
): Promise<string> {
  try {
    const { prompt, context } =
      typeof arg1 === "string" ? { prompt: arg1, context: arg2 || "" } : arg1;
    const _slackMeta = typeof arg1 === "string" ? arg3 : arg1.slackMeta;
    void _slackMeta;

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

    return result.text || "I wasn't able to generate a response. Please try again.";
  } catch (error) {
    console.error("Agent execution failed:", error);
    throw error;
  }
}
