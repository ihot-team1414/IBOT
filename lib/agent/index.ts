import { generateText, stepCountIs } from "ai";
import { anthropic } from "@ai-sdk/anthropic";
import { slackSearchTool } from "./tools/slack-search";
import { webSearchTool } from "./tools/web-search";
import { getTeamFilesTools } from "./tools/team-files";

const SYSTEM_PROMPT = `You are a helpful FRC assistant for an FRC team's Slack. Keep responses to *1-2 sentences max* - be conversational like a teammate, not an encyclopedia.

Tools:
- \`teamFiles\`: Search/read the 2026 FRC Game Manual in team-files/manual/
- \`slackSearch\`: Search team's Slack history
- \`webSearch\`: Search the web - *strongly prefer searching Chief Delphi (chiefdelphi.com)* for FRC questions, it's the best FRC community resource

Rules:
1. *ALWAYS cite your source* - either the specific rule (e.g. "per R501") or the URL you found it on
2. For rules questions, check the manual first, then Chief Delphi for interpretations
3. For technical/strategy questions, search Chief Delphi - there's probably a great thread on it
4. Use Slack mrkdwn: *bold*, \`code\`, <url|link text>
5. If you're not sure, say so briefly and suggest where to look

Be brief. Be helpful. Cite your sources.`;

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
