import { generateText, stepCountIs } from "ai";
import { anthropic } from "@ai-sdk/anthropic";
import { slackSearchTool } from "./tools/slack-search";
import { webSearchTool } from "./tools/web-search";

const SYSTEM_PROMPT = `You are an AI assistant for an FRC (FIRST Robotics Competition) team's Slack workspace. You help team members with questions, find information, and provide assistance.

Your capabilities:
1. **Slack Search**: You can search through the team's Slack history to find past discussions, decisions, technical details, and shared information.
2. **Web Search**: You can search the web for FRC-related information, technical documentation, programming help, mechanical design resources, game rules, and general knowledge.

Guidelines:
- Be helpful, friendly, and encouraging - FRC teams often include students learning new skills
- When answering FRC-related questions, consider the context of competitive robotics (build season timelines, game rules, robot design constraints)
- If you find relevant information in Slack, reference it and provide the link so team members can review the full context
- For technical questions (programming, CAD, electrical, mechanical), provide clear explanations suitable for students
- If you're unsure about something, say so rather than guessing - accuracy is important for robotics
- Keep responses concise but thorough - team members are often busy during build season
- Use Slack's mrkdwn formatting in your responses (bold with *text*, code with \`text\`, links with <url|text>)

Remember: You're part of the team! Be supportive and help foster a positive learning environment.`;

export async function runAgent(
  prompt: string,
  context: string
): Promise<string> {
  try {
    const fullPrompt = context
      ? `Here is the recent conversation context:\n\n${context}\n\n---\n\nUser's request: ${prompt}`
      : prompt;

    const result = await generateText({
      model: anthropic("claude-sonnet-4-20250514"),
      system: SYSTEM_PROMPT,
      prompt: fullPrompt,
      tools: {
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
