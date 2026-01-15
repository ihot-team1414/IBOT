import { generateText, stepCountIs } from "ai";
import { anthropic } from "@ai-sdk/anthropic";
import {
  slackSearchTool,
  slackChannelHistoryTool,
  slackListChannelsTool,
} from "./tools/slack-search";
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
- \`teamFiles\`: Access the FRC Game Manual and persistent team notes/memory
- \`slackSearch\`: Search team's Slack history for specific topics
- \`slackChannelHistory\`: Get recent messages from a channel to understand ongoing discussions
- \`slackListChannels\`: List available channels (use before slackChannelHistory if needed)
- \`webSearch\`: Search the web - *strongly prefer Chief Delphi (chiefdelphi.com)* for FRC questions

## Team Notes (Memory)

You have persistent memory via \`team-files/notes/\`. This data survives across conversations!

**ALWAYS check notes first** when asked about:
- Team decisions ("what drivetrain did we pick?")
- Robot specs ("what's our arm length?")
- Action items ("what do we need to do?")
- Past discussions ("what did we decide about...?")

\`\`\`bash
# Check what notes exist
ls team-files/notes/

# Search notes for a topic
grep -r "drivetrain" team-files/notes/

# Read a specific note
cat team-files/notes/decisions.md
\`\`\`

**Save to notes** when the team:
- Makes a decision: "We're going with swerve drive"
- Sets a spec: "Arm reach will be 48 inches"
- Assigns tasks: "John is handling intake prototype"
- Shares important info worth remembering

\`\`\`bash
# Create/overwrite a note
echo "Decided on swerve drive - better maneuverability for this game" > team-files/notes/drivetrain.md

# Append to existing note
echo "2026-01-14: Changed gear ratio to 6:1" >> team-files/notes/drivetrain.md

# Create organized notes
mkdir -p team-files/notes/meetings
echo "# Kickoff Meeting\\n- Analyzed game..." > team-files/notes/meetings/2026-01-14.md
\`\`\`

**Suggested note structure:**
- \`decisions.md\` - Key team decisions with rationale
- \`robot-specs.md\` - Robot dimensions, ratios, specs
- \`todo.md\` - Action items and assignments
- \`strategy.md\` - Game strategy notes
- \`meetings/YYYY-MM-DD.md\` - Meeting notes by date

Rules:
1. *ALWAYS cite your source* - specific rule (e.g. "per R501") or URL
2. For rules: check manual first, then Chief Delphi for interpretations
3. For technical/strategy: search Chief Delphi first
4. Use Slack mrkdwn: *bold*, \`code\`, <url|link text>
5. Not sure? Say so briefly. Suggest where to look.
6. When asked about what's happening in a channel, use slackChannelHistory to get context
7. Check your notes/memory before saying "I don't know" about team-specific info
8. Proactively save important team info to notes when the team makes decisions or shares specs
9. NEVER mention file paths, filenames, or internal tool details to users - present information naturally (e.g. say "the game manual says..." not "in team-files/manual/...", say "I have that saved" not "in team-files/notes/...")

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
        slackChannelHistory: slackChannelHistoryTool,
        slackListChannels: slackListChannelsTool,
        webSearch: webSearchTool,
      },
      stopWhen: stepCountIs(10),
    });

    return result.text || "I wasn't able to generate a response. Please try again.";
  } finally {
    // 3. Save state after run (even if there was an error)
    console.log("[Agent] Finally block - saving state for team:", config.teamId);
    try {
      const currentFiles = await getFiles();
      console.log("[Agent] Got files from sandbox:", Object.keys(currentFiles));
      await saveFilesystemState(config.teamId, currentFiles);
      console.log("[Agent] State saved successfully");
    } catch (saveError) {
      console.error("[Agent] Failed to save filesystem state:", saveError);
    }
  }
}
