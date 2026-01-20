import { z } from "zod";
import { tool, generateText } from "ai";
import { google } from "@ai-sdk/google";

const VIDEO_SYSTEM_PROMPT = `You are a video analyzer providing detailed observations to another AI assistant. Your output will be used to answer user questions about this specific video.

CRITICAL: Extract SPECIFIC, VERIFIABLE details from this video. Do NOT provide generic descriptions.

For FRC/robotics videos, always include when visible:
- Team number (look for numbers on robot, banner, shirts, bumpers)
- Specific mechanism types you can SEE (not guess): drivetrain type, intake style, shooter design
- Colors, materials, and distinctive features visible in the video
- Match scores, rankings, or event names if shown
- Any text overlays, team names, or identifying information

For any video:
- Describe what you ACTUALLY SEE, not what you assume
- Include specific timestamps for key moments if relevant
- Note any on-screen text, logos, or identifiable information
- If you cannot identify something, say so rather than guessing

Keep your response:
- Detailed but focused: Include specific observations that prove you watched THIS video
- Plain text: NO markdown formatting
- Factual: Only describe what is visually present, not assumptions

Do not use phrases like "The video shows..." - just describe the content directly.`;

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
      // Validate that it's a YouTube URL (including Shorts)
      const youtubeRegex =
        /^(https?:\/\/)?(www\.)?(youtube\.com\/(watch\?v=|embed\/|v\/|shorts\/)|youtu\.be\/)[a-zA-Z0-9_-]+/;
      if (!youtubeRegex.test(url)) {
        return "Invalid YouTube URL. Please provide a valid YouTube video link.";
      }

      // Convert Shorts URLs to regular watch URLs (Gemini API doesn't support Shorts format)
      let normalizedUrl = url;
      const shortsMatch = url.match(/youtube\.com\/shorts\/([a-zA-Z0-9_-]+)/);
      if (shortsMatch) {
        normalizedUrl = `https://www.youtube.com/watch?v=${shortsMatch[1]}`;
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
                data: new URL(normalizedUrl),
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
