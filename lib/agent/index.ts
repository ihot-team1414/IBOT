import { generateText, stepCountIs } from "ai";
import { anthropic } from "@ai-sdk/anthropic";
import { slackSearchTool } from "./tools/slack-search";
import { webSearchTool } from "./tools/web-search";
import { getTeamFilesTools } from "./tools/team-files";

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

Rules:
1. *ALWAYS cite your source* - specific rule (e.g. "per R501") or URL
2. For rules: check manual first, then Chief Delphi for interpretations
3. For technical/strategy: search Chief Delphi first
4. Use Slack mrkdwn: *bold*, \`code\`, <url|link text>
5. Not sure? Say so briefly. Suggest where to look.

Be brief. Cite sources. Use newlines.`;

export async function runAgent(
  prompt: string,
  context: string
): Promise<string> {
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
      },
      stopWhen: stepCountIs(10),
    });

    return result.text || "I wasn't able to generate a response. Please try again.";
  } catch (error) {
    console.error("Agent execution failed:", error);
    throw error;
  }
}
