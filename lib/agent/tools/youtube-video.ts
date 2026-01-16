import { z } from "zod";
import { tool, generateText } from "ai";
import { google } from "@ai-sdk/google";

const VIDEO_SYSTEM_PROMPT = `You are a video analyzer providing summaries to another AI assistant. Your output will be used by that assistant to answer user questions.

Keep your response:
- Concise: 3-5 sentences for a summary, more only if specifically asked for details
- Plain text: NO markdown formatting (no **bold**, no ## headers, no numbered lists unless essential)
- Factual: Focus on what's shown/discussed in the video
- Relevant: If this is an FRC/robotics video, emphasize the technical details that would matter to a robotics team

Do not use phrases like "The video shows..." or "In this video..." - just describe the content directly.`;

export const youtubeVideoTool = tool({
  description:
    "Watch and summarize a YouTube video. Use this when a user shares a YouTube link or asks about the contents of a YouTube video. The tool uses video understanding to analyze the video content and return a summary.",
  inputSchema: z.object({
    url: z
      .string()
      .describe(
        "The YouTube video URL (e.g., 'https://www.youtube.com/watch?v=...' or 'https://youtu.be/...')"
      ),
    prompt: z
      .string()
      .default("Summarize this video, including the key points and main takeaways.")
      .describe(
        "Optional custom prompt for what to extract from the video. Defaults to a general summary."
      ),
  }),
  execute: async ({ url, prompt }) => {
    try {
      // Validate that it's a YouTube URL
      const youtubeRegex =
        /^(https?:\/\/)?(www\.)?(youtube\.com\/(watch\?v=|embed\/|v\/)|youtu\.be\/)[a-zA-Z0-9_-]+/;
      if (!youtubeRegex.test(url)) {
        return "Invalid YouTube URL. Please provide a valid YouTube video link.";
      }

      const result = await generateText({
        model: google("gemini-2.5-flash"),
        system: VIDEO_SYSTEM_PROMPT,
        messages: [
          {
            role: "user",
            content: [
              {
                type: "text",
                text: prompt,
              },
              {
                type: "file",
                data: new URL(url),
                mediaType: "video/mp4",
              },
            ],
          },
        ],
      });

      if (!result.text) {
        return "Unable to analyze the video. The video may be unavailable, private, or too long to process.";
      }

      return `Video Analysis:\n\n${result.text}`;
    } catch (error) {
      console.error("YouTube video analysis failed:", error);
      const errorMessage =
        error instanceof Error ? error.message : "Unknown error";
      return `Failed to analyze the YouTube video: ${errorMessage}. The video may be unavailable, private, age-restricted, or too long to process.`;
    }
  },
});
