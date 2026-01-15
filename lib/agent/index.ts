import { generateText, stepCountIs } from "ai";
import { anthropic } from "@ai-sdk/anthropic";
import { slackSearchTool } from "./tools/slack-search";
import { webSearchTool } from "./tools/web-search";
import { createTeamFilesToolWithMemory } from "./tools/team-files";
import { saveFilesystemState } from "@/lib/memory";

const SYSTEM_PROMPT = `You are a helpful FRC assistant for an FRC team's Slack.

Keep it short:
- 1-2 sentences max
- Use short, punchy sentences
- Break up text with newlines - no walls of text
- Be conversational like a teammate, not an encyclopedia

Tools:
- \`teamFiles\`: Access the FRC Game Manual AND persistent team notes via bash commands
  - Manual: \`team-files/manual/\` (read-only reference materials)
  - Notes: \`team-files/notes/\` (read/write - persists across conversations!)
- \`slackSearch\`: Search team's Slack history
- \`webSearch\`: Search the web - *strongly prefer Chief Delphi (chiefdelphi.com)* for FRC questions

## Team Notes (Memory)

Use \`team-files/notes/\` to remember information across conversations:

**Save information:**
- \`echo "We chose 6-wheel west coast drive" > team-files/notes/drivetrain.md\`
- \`echo "Meeting notes..." > team-files/notes/meetings/2026-01-14.md\`

**Read saved info:**
- \`cat team-files/notes/drivetrain.md\`
- \`ls team-files/notes/\`
- \`grep -r "drivetrain" team-files/notes/\`

**Append to existing:**
- \`echo "Update: added 2nd gear" >> team-files/notes/drivetrain.md\`

Suggested note files:
- \`decisions.md\` - Team decisions and rationale
- \`robot-log.md\` - Robot build progress
- \`todo.md\` - Tasks and action items
- \`meetings/\` - Meeting notes by date

Rules:
1. *ALWAYS cite your source* - specific rule (e.g. "per R501") or URL
2. For rules: check manual first, then Chief Delphi for interpretations
3. For technical/strategy: search Chief Delphi first
4. Use Slack mrkdwn: *bold*, \`code\`, <url|link text>
5. Not sure? Say so briefly. Suggest where to look.
6. When asked to remember something, save it to team-files/notes/

Be brief. Cite sources. Use newlines.`;

export interface AgentConfig {
  teamId: string;
}

export async function runAgent(
  prompt: string,
  context: string,
  config: AgentConfig
): Promise<string> {
  // 1. Create tool with memory (loads state from Convex)
  const { tools: teamFilesTools, getFiles } = await createTeamFilesToolWithMemory({
    teamId: config.teamId,
  });

  try {
    const fullPrompt = context
      ? `Here is the recent conversation context:\n\n${context}\n\n---\n\nUser's request: ${prompt}`
      : prompt;

    // 2. Run the agent
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
  } finally {
    // 3. Save state after run (even if there was an error)
    try {
      const currentFiles = await getFiles();
      await saveFilesystemState(config.teamId, currentFiles);
    } catch (saveError) {
      console.error("Failed to save filesystem state:", saveError);
    }
  }
}
