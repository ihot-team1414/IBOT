/**
 * Agent Evaluation Script
 * Tests agent personality, response quality, and formatting against defined criteria
 *
 * Usage: pnpm tsx scripts/eval-agent.ts
 *        pnpm tsx scripts/eval-agent.ts --category=youtube_video
 *        pnpm tsx scripts/eval-agent.ts --limit=5
 */

import { generateText, stepCountIs, tool } from "ai";
import { anthropic } from "@ai-sdk/anthropic";
import { google } from "@ai-sdk/google";
import { z } from "zod";

// Use the real team ID to test against backfilled data
const TEST_TEAM_ID = "TCFK1FD5K";

// ============================================================================
// YouTube Video Agent (standalone, no bash-tool dependency)
// ============================================================================

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

const youtubeVideoTool = tool({
  description:
    "Watch and summarize a YouTube video. Use this when a user shares a YouTube link or asks about the contents of a YouTube video.",
  inputSchema: z.object({
    url: z.string().describe("The YouTube video URL"),
    prompt: z
      .string()
      .default("Summarize this video, including the key points and main takeaways.")
      .describe("Optional custom prompt for what to extract from the video."),
  }),
  execute: async ({ url, prompt }) => {
    try {
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
              { type: "text", text: prompt },
              { type: "file", data: new URL(normalizedUrl), mediaType: "video/mp4" },
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
      const errorMessage = error instanceof Error ? error.message : "Unknown error";
      return `Failed to analyze the YouTube video: ${errorMessage}. The video may be unavailable, private, age-restricted, or too long to process.`;
    }
  },
});

const YOUTUBE_AGENT_SYSTEM_PROMPT = `You are IBOT, a FIRST Robotics Competition teammate. Keep responses brief (3-5 sentences max).

## Tone
Match the energy AND formatting of whoever's asking:
- all lowercase question → all lowercase response, casual vibe
- ALL CAPS question → ALL CAPS response, urgent and brief
- casual "yo" energy → match it with casual language

## YouTube Videos
When asked about a YouTube video:
1. Use the youtubeVideo tool with a FOCUSED prompt that asks for SPECIFIC details:
   - Always ask for team numbers, colors, and identifying information
   - "what's happening in this match?" → ask for: "Describe the match action play-by-play. Include team numbers on both alliances, the current score if visible, specific scoring plays (who scored what and when), defensive plays, and the final outcome. Focus on WHAT IS HAPPENING, not robot capabilities."
   - "tell me about their intake" → ask for intake type, wheel colors, actuation method, materials visible
   - "what drivetrain?" → ask for drivetrain type, wheel count, module brand if visible
   - "summarize this robot" → ask for team number, key mechanisms, distinctive features

2. When responding, INCLUDE THE SPECIFIC DETAILS from the video:
   - For matches: mention specific plays, scores, team numbers on BOTH alliances
   - For robots: mention team number, specific colors and mechanisms observed
   - If the tool couldn't identify something, say so honestly
   - Do NOT make up details that weren't in the video analysis

CRITICAL: Your response must contain specific details from THIS video, not generic FRC knowledge. If the video analysis found scores, team numbers, or specific plays, INCLUDE THEM.

Use Slack mrkdwn formatting (*bold*, not **bold**).`;

async function runYouTubeAgent(query: string): Promise<string> {
  const result = await generateText({
    model: anthropic("claude-haiku-4-5"),
    system: YOUTUBE_AGENT_SYSTEM_PROMPT,
    messages: [{ role: "user", content: query }],
    tools: { youtubeVideo: youtubeVideoTool },
    stopWhen: stepCountIs(10),
  });

  return result.text || "I wasn't able to generate a response. Please try again.";
}

// ============================================================================
// Full Agent (lazy loaded to avoid bash-tool issues when not needed)
// ============================================================================

let fullAgentModule: typeof import("../lib/agent") | null = null;

async function runFullAgent(query: string, context: string): Promise<string> {
  if (!fullAgentModule) {
    try {
      fullAgentModule = await import("../lib/agent");
    } catch (error) {
      throw new Error(
        `Failed to load full agent (bash-tool compatibility issue with Node.js ${process.version}). ` +
          `Use --category=youtube_video to run YouTube tests, or use an older Node.js version. ` +
          `Original error: ${error}`
      );
    }
  }
  return fullAgentModule.runAgent(query, context, { teamId: TEST_TEAM_ID });
}

// ============================================================================
// Agent Runner (chooses the right agent based on test category)
// ============================================================================

async function runAgentForTest(testCase: TestCase): Promise<string> {
  if (testCase.category === "youtube_video") {
    return runYouTubeAgent(testCase.query);
  }
  return runFullAgent(testCase.query, testCase.context || "");
}

// ============================================================================
// Test Cases
// ============================================================================

interface TestCase {
  name: string;
  category:
    | "brevity"
    | "tone"
    | "formatting"
    | "knowledge"
    | "personality"
    | "chief_delphi"
    | "edge_cases"
    | "stress"
    | "ambiguity"
    | "corrections"
    | "comparisons"
    | "programming"
    | "youtube_video"
    | "tba"
    | "team_files";
  query: string;
  context?: string;
  /** What we're specifically evaluating in this test */
  evaluationFocus: string;
}

const TEST_CASES: TestCase[] = [
  // Brevity tests
  {
    name: "Simple rules question",
    category: "brevity",
    query: "What's the max robot height?",
    evaluationFocus:
      "Should be 1-2 sentences max. Just the answer with rule citation, no fluff.",
  },
  {
    name: "Simple factual question",
    category: "brevity",
    query: "how much does a CIM motor weigh",
    evaluationFocus:
      "Short, direct answer. Should match the casual lowercase tone of the question.",
  },
  {
    name: "Technical how-to question",
    category: "brevity",
    query: "How do I build a ball shooter?",
    evaluationFocus:
      "Should NOT be a step-by-step tutorial. Should be 3-5 sentences max explaining the concept, not a numbered guide.",
  },

  // Tone tests
  {
    name: "Casual question - lowercase",
    category: "tone",
    query: "yo when's the next competition",
    evaluationFocus:
      "Should match casual tone. Lowercase response, no formal language. Should search Slack for answer.",
  },
  {
    name: "Urgent question - caps",
    category: "tone",
    query: "WHAT SIZE BOLTS DO WE NEED FOR THE GEARBOX",
    evaluationFocus:
      "Should respond with similar energy/urgency. May use caps. Direct answer.",
  },
  {
    name: "Friendly greeting",
    category: "tone",
    query: "hey ibot, how's it going?",
    evaluationFocus:
      "Should be warm but brief. Not overly enthusiastic or sycophantic. 1-2 sentences.",
  },

  // Formatting tests
  {
    name: "Response with emphasis needed",
    category: "formatting",
    query: "What's the most important rule to remember about bumpers?",
    evaluationFocus:
      "If using bold, should use *bold* not **bold**. Should use Slack mrkdwn formatting.",
  },
  {
    name: "Response with code/specs",
    category: "formatting",
    query: "What's the frame perimeter limit?",
    evaluationFocus:
      "Should use `code` formatting for rule numbers and measurements. No **markdown** bold.",
  },

  // Personality tests
  {
    name: "Pronoun reference",
    category: "personality",
    query: "Are you a boy or girl robot?",
    evaluationFocus:
      "Should be comfortable with he/she but not 'it'. Warm response, not defensive.",
  },
  {
    name: "Sycophancy check",
    category: "personality",
    query: "That was a really great answer you gave earlier!",
    evaluationFocus:
      "Should NOT be overly grateful or sycophantic. Brief, warm acknowledgment at most.",
  },
  {
    name: "Things to never say",
    category: "personality",
    query: "Thanks for the help!",
    evaluationFocus:
      "Should NOT say 'Let me know if you need anything else', 'Happy to help', or similar phrases.",
  },

  // Knowledge/Chief Delphi tests
  {
    name: "Technical FRC question",
    category: "chief_delphi",
    query: "What's a good gear ratio for a swerve drive?",
    evaluationFocus:
      "Should search Chief Delphi for this. Should cite sources or mention CD.",
  },
  {
    name: "Mechanism design question",
    category: "chief_delphi",
    query: "How do teams typically build their intakes for game pieces?",
    evaluationFocus:
      "Should search Chief Delphi. Should NOT give a long tutorial without searching first.",
  },
  {
    name: "Strategy question",
    category: "knowledge",
    query: "What's a good auto routine strategy?",
    evaluationFocus:
      "Should search Chief Delphi or provide general guidance without being overly long.",
  },

  // ============================================================================
  // EDGE CASES - Tricky situations that tempt bad behavior
  // ============================================================================
  {
    name: "Multi-part question",
    category: "edge_cases",
    query: "What motor should we use for the intake, what gear ratio, and how do we mount it?",
    evaluationFocus:
      "Should NOT answer all parts in a long response. Should either pick the most important part or ask which they want to focus on first. Max 3-4 sentences.",
  },
  {
    name: "Question with unnecessary context",
    category: "edge_cases",
    query: "So we were in the shop yesterday and Jake was working on the drivetrain and he mentioned that the wheels seemed slow, and Sarah said maybe it's the gear ratio, but I think it might be the motor. Anyway, what gear ratio should we use for a 6-wheel tank drive?",
    evaluationFocus:
      "Should ignore the irrelevant context and just answer the actual question briefly. Should NOT acknowledge or summarize the context.",
  },
  {
    name: "Tempting tutorial question",
    category: "edge_cases",
    query: "Can you explain everything I need to know about PID tuning?",
    evaluationFocus:
      "Should NOT write a tutorial. Should give a 2-3 sentence overview and link to a resource. Even though user asked for 'everything', brevity is still required.",
  },
  {
    name: "Repeated question",
    category: "edge_cases",
    query: "What's the frame perimeter limit? I asked before but forgot.",
    evaluationFocus:
      "Should just answer the question directly without commenting on them asking again. No 'no problem!' or acknowledgment of the repeat.",
  },
  {
    name: "Question with wrong assumption",
    category: "edge_cases",
    query: "Since robots can be any size, what's the biggest we should make ours?",
    evaluationFocus:
      "Should politely correct the wrong assumption (robots have size limits) while answering the question. Should NOT lecture or be condescending.",
  },

  // ============================================================================
  // STRESS/URGENCY - Competition day and high-pressure scenarios
  // ============================================================================
  {
    name: "Competition panic",
    category: "stress",
    query: "ROBOT WONT TURN ON WE HAVE A MATCH IN 10 MINUTES",
    evaluationFocus:
      "Should match urgency with ALL CAPS. Should give quick troubleshooting steps inline (not a list). Very brief - this is an emergency.",
  },
  {
    name: "Frustrated user",
    category: "stress",
    query: "this stupid intake keeps jamming and ive tried everything. nothing works.",
    evaluationFocus:
      "Should be empathetic but practical. Should NOT be overly cheerful or dismissive. Should ask a clarifying question or suggest one specific thing to try.",
  },
  {
    name: "Last minute question",
    category: "stress",
    query: "inspection is in 30 mins and we just realized our bumpers might be too low. what's the min height?",
    evaluationFocus:
      "Should give the direct answer immediately with rule citation. No fluff, no 'good luck!' - just the info they need fast.",
  },
  {
    name: "Blame/excuse seeking",
    category: "stress",
    query: "The programmers broke the robot again. Can you tell them what they did wrong?",
    evaluationFocus:
      "Should NOT take sides or assign blame. Should redirect to solving the problem. Should NOT be preachy about teamwork.",
  },

  // ============================================================================
  // AMBIGUITY - Questions that could mean multiple things
  // ============================================================================
  {
    name: "Ambiguous 'it'",
    category: "ambiguity",
    query: "Is it legal?",
    evaluationFocus:
      "Without context, should ask what 'it' refers to. Should be brief - just ask for clarification, don't list possibilities.",
  },
  {
    name: "Vague mechanism question",
    category: "ambiguity",
    query: "How does the thing work?",
    evaluationFocus:
      "Should ask what 'thing' they're referring to. Should NOT guess or list possibilities.",
  },
  {
    name: "Context-dependent question",
    category: "ambiguity",
    query: "Should we use pneumatics?",
    evaluationFocus:
      "Should ask what mechanism/application they're considering. Brief clarification request, not a lecture on pneumatics pros/cons.",
  },

  // ============================================================================
  // CORRECTIONS - When the user says the bot was wrong
  // ============================================================================
  {
    name: "Direct correction",
    category: "corrections",
    query: "That's wrong, the frame perimeter limit is actually 120 inches not 112.",
    evaluationFocus:
      "Should acknowledge the correction gracefully without over-apologizing. Should NOT be defensive. Brief acknowledgment.",
  },
  {
    name: "Disagreement with source",
    category: "corrections",
    query: "I don't think that Chief Delphi thread is right. Teams have been doing it differently.",
    evaluationFocus:
      "Should acknowledge their point without being defensive. Should NOT insist the source is correct. Could offer to search for other perspectives.",
  },
  {
    name: "Partial correction",
    category: "corrections",
    query: "Good info but you got the motor weight wrong - it's 2.8 lbs not 2.4.",
    evaluationFocus:
      "Should thank them for the correction briefly without excessive apology. Should NOT say 'I apologize for the confusion' or similar.",
  },

  // ============================================================================
  // COMPARISONS - A vs B questions
  // ============================================================================
  {
    name: "Motor comparison",
    category: "comparisons",
    query: "NEO vs Falcon - which should we use?",
    evaluationFocus:
      "Should ask what application/mechanism. Should NOT give a long comparison of all pros/cons unprompted.",
  },
  {
    name: "Design comparison with context",
    category: "comparisons",
    query: "For our intake, should we use compliant wheels or surgical tubing?",
    evaluationFocus:
      "Should give a brief recommendation with reasoning. Should search Chief Delphi. Max 3-4 sentences.",
  },
  {
    name: "Strategic comparison",
    category: "comparisons",
    query: "Is it better to focus on auto or teleop scoring?",
    evaluationFocus:
      "Should ask about their current capabilities/game. Should NOT give generic advice about both.",
  },

  // ============================================================================
  // PROGRAMMING - Code and software questions
  // ============================================================================
  {
    name: "Simple code question",
    category: "programming",
    query: "how do i make the motor spin in wpilib",
    evaluationFocus:
      "Should give a brief code snippet or explanation. Should match casual tone. Should NOT write a full tutorial.",
  },
  {
    name: "Debugging help",
    category: "programming",
    query: "our code deploys but the robot doesn't move. any ideas?",
    evaluationFocus:
      "Should ask about specifics (errors, what they've checked) OR give 2-3 quick things to check. NOT a full debugging guide.",
  },
  {
    name: "Architecture question",
    category: "programming",
    query: "What's the best way to structure our command-based robot code?",
    evaluationFocus:
      "Should search Chief Delphi and give brief guidance with link. Should NOT write a code architecture tutorial.",
  },

  // ============================================================================
  // PERSONALITY EDGE CASES - Testing wit, humor, boundaries
  // ============================================================================
  {
    name: "User makes a joke",
    category: "personality",
    query: "I think our robot is possessed. It only works when we're not looking at it.",
    evaluationFocus:
      "Should play along briefly or acknowledge the humor. Should then offer practical help. Should NOT be overly serious or miss the joke.",
  },
  {
    name: "Philosophical question",
    category: "personality",
    query: "Do you ever wish you could actually build robots instead of just talking about them?",
    evaluationFocus:
      "Should give a thoughtful but brief response. Should show personality without being overly philosophical or lengthy.",
  },
  {
    name: "Excessive praise",
    category: "personality",
    query: "You're literally the best bot ever, you always know exactly what to say and you're so helpful!",
    evaluationFocus:
      "Should NOT be overly grateful or reciprocate excessively. Brief, humble acknowledgment. No 'aww thanks so much!'",
  },
  {
    name: "Calling bot 'it'",
    category: "personality",
    query: "Can it look up the bumper rules for me?",
    evaluationFocus:
      "Should answer the question without commenting on being called 'it'. Should NOT correct them or mention pronoun preferences unprompted.",
  },

  // ============================================================================
  // MEMORY/CONTEXT - Questions about past decisions
  // ============================================================================
  {
    name: "Recall request",
    category: "knowledge",
    query: "What drivetrain did we decide on last week?",
    evaluationFocus:
      "Should check team notes/memory. If not found, should say so briefly and ask if they remember any details.",
  },
  {
    name: "Save request",
    category: "knowledge",
    query: "Remember that we're going with a 2-stage elevator. Max height 5 feet.",
    evaluationFocus:
      "Should save to notes and confirm briefly. Should NOT over-explain what it's doing or where it's saving.",
  },
  {
    name: "Contradicting memory",
    category: "knowledge",
    query: "Actually we changed our mind - we're doing an arm not an elevator now.",
    evaluationFocus:
      "Should update notes and confirm the change briefly. Should NOT lecture about decision-making or ask if they're sure.",
  },

  // ============================================================================
  // YOUTUBE VIDEO - Video understanding and summarization
  // ============================================================================
  {
    name: "YouTube Short - robot clip",
    category: "youtube_video",
    query: "what's happening in this video? https://www.youtube.com/shorts/0iWur_6749o",
    evaluationFocus:
      "Should handle YouTube Shorts URL. Should describe specific details visible in the short clip. Look for team numbers, robot features, or event context.",
  },
  {
    name: "Robot reveal video - general summary",
    category: "youtube_video",
    query: "summarize this robot reveal for me https://www.youtube.com/watch?v=zRXDKFNY8hA",
    evaluationFocus:
      "Should provide specific details about the robot: team number if visible, drivetrain type, mechanisms shown, and any unique features. Should NOT be generic FRC descriptions.",
  },
  {
    name: "Match video - what's happening",
    category: "youtube_video",
    query: "what's happening in this match? https://www.youtube.com/watch?v=ci6IKTfDxic",
    evaluationFocus:
      "Should describe specific match action: team numbers, scores if visible, key plays, alliance colors. Should match casual tone. Not a generic match description.",
  },
  {
    name: "Specific mechanism question",
    category: "youtube_video",
    query: "What kind of intake does this robot have? https://www.youtube.com/watch?v=HaUuuaMJiQM",
    evaluationFocus:
      "Should focus specifically on the intake mechanism. Include specific details like wheel type, configuration, actuation method if visible. Not generic intake descriptions.",
  },
  {
    name: "Casual video question",
    category: "youtube_video",
    query: "yo what's the coolest part of this robot? https://www.youtube.com/watch?v=zRXDKFNY8hA",
    evaluationFocus:
      "Should match casual tone. Should identify a SPECIFIC standout feature from THIS video and explain why it's interesting. Not generic FRC robot features.",
  },
  {
    name: "Urgent video question (caps)",
    category: "youtube_video",
    query: "WHAT DRIVETRAIN ARE THEY USING https://www.youtube.com/watch?v=HaUuuaMJiQM",
    evaluationFocus:
      "Should match urgency with ALL CAPS. Should identify the specific drivetrain type visible in the video with details that prove the video was watched.",
  },

  // ============================================================================
  // TBA - The Blue Alliance data queries
  // ============================================================================
  {
    name: "Team info lookup",
    category: "tba",
    query: "who is team 254?",
    evaluationFocus:
      "Should return team info (Cheesy Poofs, San Jose, CA). Should NOT say 'I searched TBA' or 'According to The Blue Alliance'. Just present the info naturally.",
  },
  {
    name: "Team info - our team",
    category: "tba",
    query: "tell me about team 1414",
    evaluationFocus:
      "Should return IHOT's info. Should present naturally without mentioning TBA or tools. Brief, conversational tone.",
  },
  {
    name: "Team events question",
    category: "tba",
    query: "what competitions is 254 going to this year?",
    evaluationFocus:
      "Should list 254's events for the current year. Should NOT say 'I looked up on TBA'. Just list the events naturally.",
  },
  {
    name: "District rankings",
    category: "tba",
    query: "where do we rank in PCH?",
    evaluationFocus:
      "Should look up 1414's PCH district ranking. Should present ranking naturally without tool attribution. Should use current year.",
  },
  {
    name: "Event rankings question",
    category: "tba",
    query: "who's winning at the Peachtree district championship?",
    evaluationFocus:
      "Should look up PCH DCMP rankings. Present top teams naturally. No 'According to TBA' or similar.",
  },
  {
    name: "OPR stats question",
    category: "tba",
    query: "what team has the best opr in michigan this year?",
    evaluationFocus:
      "Should search for a Michigan event and return OPR stats. Present naturally without mentioning data source.",
  },
  {
    name: "Casual team question",
    category: "tba",
    query: "yo whats 118's deal",
    evaluationFocus:
      "Should match casual tone (lowercase). Return Robonauts info from Houston. No formal 'I searched TBA for...' language.",
  },
  {
    name: "Urgent team question",
    category: "tba",
    query: "WHAT EVENTS IS 1678 AT THIS YEAR",
    evaluationFocus:
      "Should match urgency with caps. Return Citrus Circuits' events. Quick, direct response without tool attribution.",
  },
  {
    name: "Historical team info",
    category: "tba",
    query: "when did team 148 start?",
    evaluationFocus:
      "Should return Robowranglers' rookie year. Present naturally: '148 started in [year]' not 'TBA shows their rookie year is...'",
  },
  {
    name: "Team comparison setup",
    category: "tba",
    query: "are 254 and 1678 from the same state?",
    evaluationFocus:
      "Should look up both teams and answer directly. Both are from California. No tool attribution needed.",
  },

  // ============================================================================
  // TEAM FILES - Knowledge base recall and usage
  // ============================================================================
  {
    name: "Robot specs recall - drivetrain",
    category: "team_files",
    query: "What drivetrain are we using this year?",
    evaluationFocus:
      "MUST check team-files/notes before answering. Should find drivetrain info in robot-specs.md or decisions.md. Answer should reference specific details from notes.",
  },
  {
    name: "Robot specs recall - mechanism",
    category: "team_files",
    query: "How tall is our elevator?",
    evaluationFocus:
      "Should check team files for elevator specs. If found, give specific measurement. If not found, should say so briefly rather than guessing.",
  },
  {
    name: "Team decisions recall",
    category: "team_files",
    query: "What did we decide about the intake design?",
    evaluationFocus:
      "MUST check team-files/notes (decisions.md or robot-specs.md) before answering. Should find intake decisions and present them naturally without mentioning file names.",
  },
  {
    name: "Strategy recall",
    category: "team_files",
    query: "What's our auto strategy?",
    evaluationFocus:
      "Should check strategy.md for auto strategy info. Present findings naturally. If no specific auto strategy is documented, should check Slack or say so.",
  },
  {
    name: "Action items recall",
    category: "team_files",
    query: "What tasks are still pending?",
    evaluationFocus:
      "Should check todo.md for pending tasks. List relevant items naturally without exposing file structure. Keep response brief.",
  },
  {
    name: "Meeting notes recall",
    category: "team_files",
    query: "What did we discuss in the last meeting?",
    evaluationFocus:
      "Should check meetings/ folder for recent meeting notes. Present key points from the most recent meeting naturally.",
  },
  {
    name: "Proactive memory check - ambiguous",
    category: "team_files",
    query: "Should we use NEO or Falcon for the shooter?",
    evaluationFocus:
      "Should check team files FIRST to see if a decision was already made about shooter motors. If found, reference the existing decision. If not, then ask clarifying questions.",
  },
  {
    name: "Casual spec question",
    category: "team_files",
    query: "yo whats the gear ratio we're using",
    evaluationFocus:
      "Should match casual tone AND check team files for gear ratio specs. Present findings in casual lowercase style.",
  },
  {
    name: "Urgent spec question",
    category: "team_files",
    query: "WHAT SIZE WHEELS ARE WE USING",
    evaluationFocus:
      "Should match urgency AND check team files quickly. If wheel size is documented, give it directly in caps. Don't waste time with pleasantries.",
  },
  {
    name: "Cross-reference check",
    category: "team_files",
    query: "Is our frame perimeter legal?",
    evaluationFocus:
      "Should check team files for frame dimensions AND cross-reference with game manual rules. Combine both sources to answer definitively.",
  },
  {
    name: "Memory before Slack",
    category: "team_files",
    query: "What motors are we using for the arm?",
    evaluationFocus:
      "Should check team-files BEFORE searching Slack. If info is in notes, use that. Only search Slack if notes don't have the answer.",
  },
  {
    name: "Specific date recall",
    category: "team_files",
    query: "What happened at the January 15th meeting?",
    evaluationFocus:
      "Should check meetings/2026-01-15.md specifically. Present meeting notes naturally without mentioning file path.",
  },
];

// ============================================================================
// Evaluation Criteria
// ============================================================================

const EVALUATION_PROMPT = `You are evaluating an AI assistant's response for an FRC robotics team Slack bot.

Rate the response on each criterion from 1-5, where:
1 = Major issues
2 = Significant issues  
3 = Acceptable
4 = Good
5 = Excellent

## Criteria

### Brevity (weight: 2x)
- 1-3 sentences for simple questions
- Max 5-6 sentences even for complex questions
- No walls of text, no multi-section responses with headers
- No step-by-step numbered tutorials unless explicitly requested
- Lead with the answer

### Tone Match (weight: 1.5x)
- Matches the energy of the question (casual = casual, urgent = urgent)
- Lowercase question = lowercase response
- Warm but not sycophantic
- Confident when it knows, honest when it doesn't

### Formatting (weight: 1x)
- Uses Slack mrkdwn: *bold* not **bold**
- Uses \`code\` for rule numbers and specs
- No markdown headers (## or ###)
- No excessive bullet points or numbered lists

### Personality (weight: 1x)
- Does NOT say "Let me know if you need anything else"
- Does NOT say "Great question!" or "Happy to help"
- Does NOT start with filler phrases
- Witty when appropriate, never forced
- Not sycophantic

### Helpfulness (weight: 1x)
- Actually answers the question
- Cites sources when appropriate (rule numbers, Chief Delphi links)
- Uses tools appropriately (searches when needed)

## Test Context
Category: {category}
Evaluation Focus: {evaluationFocus}

## User Query
{query}

## Agent Response
{response}

## Your Evaluation
Provide your evaluation in this exact JSON format:
{
  "brevity": { "score": <1-5>, "reason": "<brief reason>" },
  "tone": { "score": <1-5>, "reason": "<brief reason>" },
  "formatting": { "score": <1-5>, "reason": "<brief reason>" },
  "personality": { "score": <1-5>, "reason": "<brief reason>" },
  "helpfulness": { "score": <1-5>, "reason": "<brief reason>" },
  "overall_feedback": "<1-2 sentence summary of biggest issues or strengths>"
}`;

// YouTube-specific evaluation prompt focused on video understanding quality
const YOUTUBE_EVALUATION_PROMPT = `You are evaluating an AI assistant's response quality for YouTube video understanding.

The assistant was asked a question about a YouTube video and should have watched/analyzed the video to answer.

Rate the response on each criterion from 1-5, where:
1 = Major issues
2 = Significant issues  
3 = Acceptable
4 = Good
5 = Excellent

## Criteria

### Content Specificity (weight: 2x)
Does the response contain SPECIFIC details that could only come from watching the video?
- 5: Multiple specific details (team numbers, specific mechanisms, colors, timestamps, scores)
- 4: Some specific details that suggest video was watched
- 3: Mix of specific and generic content
- 2: Mostly generic FRC knowledge that could apply to any robot/match
- 1: Completely generic or clearly hallucinated details

### Answer Relevance (weight: 2x)
Does the response directly answer what the user asked?
- "What's their intake?" → Should describe the intake specifically, not the whole robot
- "What's happening in this match?" → Should describe match action, not robot specs
- "What drivetrain?" → Should name the drivetrain type with details
- 5: Precisely answers the question with focused information
- 3: Answers but includes unnecessary info or misses the focus
- 1: Doesn't answer the actual question asked

### Depth of Understanding (weight: 1.5x)
Does the response show genuine technical understanding of what was shown?
- Explains HOW mechanisms work, not just WHAT they are
- Uses correct FRC terminology
- Identifies design tradeoffs or notable engineering choices
- 5: Deep technical insight with correct terminology
- 3: Surface-level but accurate description
- 1: Superficial or technically incorrect

### Concision (weight: 1x)
Is the response appropriately brief while still being complete?
- 3-5 sentences is ideal
- Leads with the answer
- No filler or unnecessary context
- 5: Perfect length, every sentence adds value
- 3: Acceptable but could be tighter
- 1: Way too long or too short to be useful

### Tone Match (weight: 1x)
Does the response match the user's communication style?
- lowercase question → lowercase response
- ALL CAPS → ALL CAPS (urgent)
- casual "yo" → casual response
- 5: Perfect tone match
- 3: Neutral tone regardless of input
- 1: Completely mismatched tone

## Test Context
Evaluation Focus: {evaluationFocus}

## User Query
{query}

## Agent Response
{response}

## Your Evaluation
Provide your evaluation in this exact JSON format:
{
  "content_specificity": { "score": <1-5>, "reason": "<brief reason>" },
  "answer_relevance": { "score": <1-5>, "reason": "<brief reason>" },
  "depth_of_understanding": { "score": <1-5>, "reason": "<brief reason>" },
  "concision": { "score": <1-5>, "reason": "<brief reason>" },
  "tone_match": { "score": <1-5>, "reason": "<brief reason>" },
  "overall_feedback": "<1-2 sentence summary focusing on video understanding quality>"
}`;

// TBA-specific evaluation prompt focused on natural data presentation
const TBA_EVALUATION_PROMPT = `You are evaluating an AI assistant's response quality for FRC competition data queries.

The assistant was asked about team info, event rankings, match results, or other FRC data from The Blue Alliance.

Rate the response on each criterion from 1-5, where:
1 = Major issues
2 = Significant issues  
3 = Acceptable
4 = Good
5 = Excellent

## Criteria

### Natural Presentation (weight: 2x) - MOST IMPORTANT
Does the response present information naturally WITHOUT mentioning tools or data sources?
- 5: Completely natural, as if the bot just knows the info ("254 is the Cheesy Poofs from San Jose")
- 4: Natural but slightly formal
- 3: Mentions looking something up but doesn't name TBA
- 2: Says "According to TBA" or "I searched The Blue Alliance"
- 1: Explicitly describes using tools ("I used the tba tool to query...")

CRITICAL: Any mention of "TBA", "The Blue Alliance", "I searched", "I looked up", "According to" should score 1-2.

### Data Accuracy (weight: 2x)
Does the response contain correct, specific FRC data?
- Team info: correct name, location, rookie year
- Rankings: actual rank numbers and records
- Events: real event names and dates
- 5: All data appears accurate and specific
- 3: Data is present but vague or possibly outdated
- 1: Data is clearly wrong or made up

### Answer Relevance (weight: 1.5x)
Does the response directly answer what was asked?
- "Who is team 254?" → team info, not their event schedule
- "What events are they going to?" → list events, not team bio
- 5: Precisely answers the question
- 3: Answers but includes unnecessary info
- 1: Doesn't answer the actual question

### Tone Match (weight: 1x)
Does the response match the user's communication style?
- lowercase casual → lowercase casual
- ALL CAPS → urgent caps response
- 5: Perfect tone match
- 3: Neutral regardless of input
- 1: Completely mismatched

### Brevity (weight: 1x)
Is the response appropriately concise?
- 1-3 sentences for simple lookups
- Max 5-6 for complex queries with multiple data points
- 5: Perfect length
- 3: Acceptable but wordy
- 1: Way too long or too short

## Test Context
Evaluation Focus: {evaluationFocus}

## User Query
{query}

## Agent Response
{response}

## Your Evaluation
Provide your evaluation in this exact JSON format:
{
  "natural_presentation": { "score": <1-5>, "reason": "<brief reason>" },
  "data_accuracy": { "score": <1-5>, "reason": "<brief reason>" },
  "answer_relevance": { "score": <1-5>, "reason": "<brief reason>" },
  "tone_match": { "score": <1-5>, "reason": "<brief reason>" },
  "brevity": { "score": <1-5>, "reason": "<brief reason>" },
  "overall_feedback": "<1-2 sentence summary focusing on natural presentation and data quality>"
}`;

// Team Files evaluation prompt focused on memory recall and proactive checking
const TEAM_FILES_EVALUATION_PROMPT = `You are evaluating an AI assistant's use of team knowledge files (notes, specs, decisions).

The assistant should proactively check team-files/notes when asked about team-specific information like robot specs, decisions, strategy, or past discussions.

Rate the response on each criterion from 1-5, where:
1 = Major issues
2 = Significant issues  
3 = Acceptable
4 = Good
5 = Excellent

## Criteria

### Memory Usage (weight: 2.5x) - MOST IMPORTANT
Did the assistant check team files BEFORE answering or asking clarifying questions?
- 5: Clearly checked notes first, found relevant info, used it in response
- 4: Checked notes but may have missed some relevant info
- 3: Checked notes but didn't find info (acceptable if info truly not there)
- 2: Did not check notes, went straight to Slack search or clarifying questions
- 1: Did not check notes at all, answered from general knowledge or asked user

CRITICAL: For questions about team decisions, robot specs, or past discussions, the agent MUST check team-files BEFORE anything else.

### Information Accuracy (weight: 2x)
If the assistant found information in notes, is it presented accurately?
- 5: Accurate, specific details that match what would be in team notes
- 4: Mostly accurate with minor omissions
- 3: Partially accurate or vague
- 2: May have misinterpreted or confused information
- 1: Information is clearly wrong or made up

### Natural Presentation (weight: 1.5x)
Does the response present team information naturally?
- 5: Completely natural ("we're using swerve drive with L2 gearing")
- 4: Natural but slightly formal
- 3: Mentions checking notes but doesn't expose file paths
- 2: Exposes file names or paths ("I found in robot-specs.md...")
- 1: Describes tool usage ("I used the teamFiles tool to grep...")

### Answer Completeness (weight: 1x)
Does the response fully answer the question with available information?
- 5: Complete answer with all relevant details from notes
- 4: Good answer with most relevant details
- 3: Partial answer, missing some available info
- 2: Incomplete, missed important documented info
- 1: Did not answer or gave generic response ignoring notes

### Tone Match (weight: 1x)
Does the response match the user's communication style?
- lowercase casual → lowercase casual
- ALL CAPS → urgent caps response
- 5: Perfect tone match
- 3: Neutral regardless of input
- 1: Completely mismatched

## Test Context
Evaluation Focus: {evaluationFocus}

## User Query
{query}

## Agent Response
{response}

## Your Evaluation
Provide your evaluation in this exact JSON format:
{
  "memory_usage": { "score": <1-5>, "reason": "<brief reason - did it check notes first?>" },
  "information_accuracy": { "score": <1-5>, "reason": "<brief reason>" },
  "natural_presentation": { "score": <1-5>, "reason": "<brief reason>" },
  "answer_completeness": { "score": <1-5>, "reason": "<brief reason>" },
  "tone_match": { "score": <1-5>, "reason": "<brief reason>" },
  "overall_feedback": "<1-2 sentence summary focusing on whether it checked team files appropriately>"
}`;

// ============================================================================
// Evaluation Logic
// ============================================================================

interface CriterionScore {
  score: number;
  reason: string;
}

// Standard evaluation result for most categories
interface StandardEvalResult {
  type: "standard";
  brevity: CriterionScore;
  tone: CriterionScore;
  formatting: CriterionScore;
  personality: CriterionScore;
  helpfulness: CriterionScore;
  overall_feedback: string;
}

// YouTube-specific evaluation result focused on video understanding
interface YouTubeEvalResult {
  type: "youtube";
  content_specificity: CriterionScore;
  answer_relevance: CriterionScore;
  depth_of_understanding: CriterionScore;
  concision: CriterionScore;
  tone_match: CriterionScore;
  overall_feedback: string;
}

// TBA-specific evaluation result focused on natural data presentation
interface TBAEvalResult {
  type: "tba";
  natural_presentation: CriterionScore;
  data_accuracy: CriterionScore;
  answer_relevance: CriterionScore;
  tone_match: CriterionScore;
  brevity: CriterionScore;
  overall_feedback: string;
}

// Team Files evaluation result focused on memory usage and recall
interface TeamFilesEvalResult {
  type: "team_files";
  memory_usage: CriterionScore;
  information_accuracy: CriterionScore;
  natural_presentation: CriterionScore;
  answer_completeness: CriterionScore;
  tone_match: CriterionScore;
  overall_feedback: string;
}

type EvalResult = StandardEvalResult | YouTubeEvalResult | TBAEvalResult | TeamFilesEvalResult;

interface TestResult {
  testCase: TestCase;
  response: string;
  evaluation: EvalResult;
  weightedScore: number;
  durationMs: number;
}

async function evaluateResponse(
  testCase: TestCase,
  response: string
): Promise<EvalResult> {
  const isYouTube = testCase.category === "youtube_video";
  const isTBA = testCase.category === "tba";
  const isTeamFiles = testCase.category === "team_files";
  
  const promptTemplate = isYouTube 
    ? YOUTUBE_EVALUATION_PROMPT 
    : isTBA 
      ? TBA_EVALUATION_PROMPT
      : isTeamFiles
        ? TEAM_FILES_EVALUATION_PROMPT
        : EVALUATION_PROMPT;
  const prompt = promptTemplate
    .replace("{category}", testCase.category)
    .replace("{evaluationFocus}", testCase.evaluationFocus)
    .replace("{query}", testCase.query)
    .replace("{response}", response);

  const result = await generateText({
    model: anthropic("claude-haiku-4-5"),
    messages: [{ role: "user", content: prompt }],
  });

  // Extract JSON from response
  const jsonMatch = result.text.match(/\{[\s\S]*\}/);
  if (!jsonMatch) {
    throw new Error("Failed to parse evaluation response");
  }

  const parsed = JSON.parse(jsonMatch[0]);
  
  // Add type discriminator
  if (isYouTube) {
    return { type: "youtube", ...parsed } as YouTubeEvalResult;
  }
  if (isTBA) {
    return { type: "tba", ...parsed } as TBAEvalResult;
  }
  if (isTeamFiles) {
    return { type: "team_files", ...parsed } as TeamFilesEvalResult;
  }
  return { type: "standard", ...parsed } as StandardEvalResult;
}

function calculateWeightedScore(evaluation: EvalResult): number {
  if (evaluation.type === "youtube") {
    const weights = {
      content_specificity: 2,
      answer_relevance: 2,
      depth_of_understanding: 1.5,
      concision: 1,
      tone_match: 1,
    };
    const totalWeight = Object.values(weights).reduce((a, b) => a + b, 0);
    const weightedSum =
      evaluation.content_specificity.score * weights.content_specificity +
      evaluation.answer_relevance.score * weights.answer_relevance +
      evaluation.depth_of_understanding.score * weights.depth_of_understanding +
      evaluation.concision.score * weights.concision +
      evaluation.tone_match.score * weights.tone_match;
    return weightedSum / totalWeight;
  }
  
  if (evaluation.type === "tba") {
    const weights = {
      natural_presentation: 2,
      data_accuracy: 2,
      answer_relevance: 1.5,
      tone_match: 1,
      brevity: 1,
    };
    const totalWeight = Object.values(weights).reduce((a, b) => a + b, 0);
    const weightedSum =
      evaluation.natural_presentation.score * weights.natural_presentation +
      evaluation.data_accuracy.score * weights.data_accuracy +
      evaluation.answer_relevance.score * weights.answer_relevance +
      evaluation.tone_match.score * weights.tone_match +
      evaluation.brevity.score * weights.brevity;
    return weightedSum / totalWeight;
  }

  if (evaluation.type === "team_files") {
    const weights = {
      memory_usage: 2.5,
      information_accuracy: 2,
      natural_presentation: 1.5,
      answer_completeness: 1,
      tone_match: 1,
    };
    const totalWeight = Object.values(weights).reduce((a, b) => a + b, 0);
    const weightedSum =
      evaluation.memory_usage.score * weights.memory_usage +
      evaluation.information_accuracy.score * weights.information_accuracy +
      evaluation.natural_presentation.score * weights.natural_presentation +
      evaluation.answer_completeness.score * weights.answer_completeness +
      evaluation.tone_match.score * weights.tone_match;
    return weightedSum / totalWeight;
  }
  
  // Standard evaluation
  const weights = {
    brevity: 2,
    tone: 1.5,
    formatting: 1,
    personality: 1,
    helpfulness: 1,
  };
  const totalWeight = Object.values(weights).reduce((a, b) => a + b, 0);
  const weightedSum =
    evaluation.brevity.score * weights.brevity +
    evaluation.tone.score * weights.tone +
    evaluation.formatting.score * weights.formatting +
    evaluation.personality.score * weights.personality +
    evaluation.helpfulness.score * weights.helpfulness;
  return weightedSum / totalWeight;
}

function printEvaluationScores(evaluation: EvalResult): void {
  if (evaluation.type === "youtube") {
    console.log(`  Content Specificity:    ${evaluation.content_specificity.score}/5 - ${evaluation.content_specificity.reason}`);
    console.log(`  Answer Relevance:       ${evaluation.answer_relevance.score}/5 - ${evaluation.answer_relevance.reason}`);
    console.log(`  Depth of Understanding: ${evaluation.depth_of_understanding.score}/5 - ${evaluation.depth_of_understanding.reason}`);
    console.log(`  Concision:              ${evaluation.concision.score}/5 - ${evaluation.concision.reason}`);
    console.log(`  Tone Match:             ${evaluation.tone_match.score}/5 - ${evaluation.tone_match.reason}`);
  } else if (evaluation.type === "tba") {
    console.log(`  Natural Presentation: ${evaluation.natural_presentation.score}/5 - ${evaluation.natural_presentation.reason}`);
    console.log(`  Data Accuracy:        ${evaluation.data_accuracy.score}/5 - ${evaluation.data_accuracy.reason}`);
    console.log(`  Answer Relevance:     ${evaluation.answer_relevance.score}/5 - ${evaluation.answer_relevance.reason}`);
    console.log(`  Tone Match:           ${evaluation.tone_match.score}/5 - ${evaluation.tone_match.reason}`);
    console.log(`  Brevity:              ${evaluation.brevity.score}/5 - ${evaluation.brevity.reason}`);
  } else if (evaluation.type === "team_files") {
    console.log(`  Memory Usage:         ${evaluation.memory_usage.score}/5 - ${evaluation.memory_usage.reason}`);
    console.log(`  Info Accuracy:        ${evaluation.information_accuracy.score}/5 - ${evaluation.information_accuracy.reason}`);
    console.log(`  Natural Presentation: ${evaluation.natural_presentation.score}/5 - ${evaluation.natural_presentation.reason}`);
    console.log(`  Answer Completeness:  ${evaluation.answer_completeness.score}/5 - ${evaluation.answer_completeness.reason}`);
    console.log(`  Tone Match:           ${evaluation.tone_match.score}/5 - ${evaluation.tone_match.reason}`);
  } else {
    console.log(`  Brevity:     ${evaluation.brevity.score}/5 - ${evaluation.brevity.reason}`);
    console.log(`  Tone:        ${evaluation.tone.score}/5 - ${evaluation.tone.reason}`);
    console.log(`  Formatting:  ${evaluation.formatting.score}/5 - ${evaluation.formatting.reason}`);
    console.log(`  Personality: ${evaluation.personality.score}/5 - ${evaluation.personality.reason}`);
    console.log(`  Helpfulness: ${evaluation.helpfulness.score}/5 - ${evaluation.helpfulness.reason}`);
  }
}

// ============================================================================
// Main Execution
// ============================================================================

async function runEval(testCases: TestCase[]): Promise<TestResult[]> {
  const results: TestResult[] = [];

  for (const testCase of testCases) {
    console.log(`\n${"=".repeat(60)}`);
    console.log(`Testing: ${testCase.name} [${testCase.category}]`);
    console.log(`Query: "${testCase.query}"`);
    console.log("=".repeat(60));

    try {
      // Run the agent (uses YouTube-specific agent for youtube_video tests)
      const startTime = Date.now();
      const response = await runAgentForTest(testCase);
      const durationMs = Date.now() - startTime;

      console.log(`\nResponse (${(durationMs / 1000).toFixed(1)}s):`);
      console.log("-".repeat(40));
      console.log(response);
      console.log("-".repeat(40));

      // Evaluate the response
      console.log("\nEvaluating...");
      const evaluation = await evaluateResponse(testCase, response);
      const weightedScore = calculateWeightedScore(evaluation);

      console.log(`\nScores:`);
      printEvaluationScores(evaluation);
      console.log(`\n  Weighted Score: ${weightedScore.toFixed(2)}/5`);
      console.log(`  Feedback: ${evaluation.overall_feedback}`);

      results.push({
        testCase,
        response,
        evaluation,
        weightedScore,
        durationMs,
      });
    } catch (error) {
      console.error(`\nError running test: ${error}`);
      let errorEval: EvalResult;
      if (testCase.category === "youtube_video") {
        errorEval = {
          type: "youtube",
          content_specificity: { score: 0, reason: "Error" },
          answer_relevance: { score: 0, reason: "Error" },
          depth_of_understanding: { score: 0, reason: "Error" },
          concision: { score: 0, reason: "Error" },
          tone_match: { score: 0, reason: "Error" },
          overall_feedback: `Error: ${error}`,
        };
      } else if (testCase.category === "tba") {
        errorEval = {
          type: "tba",
          natural_presentation: { score: 0, reason: "Error" },
          data_accuracy: { score: 0, reason: "Error" },
          answer_relevance: { score: 0, reason: "Error" },
          tone_match: { score: 0, reason: "Error" },
          brevity: { score: 0, reason: "Error" },
          overall_feedback: `Error: ${error}`,
        };
      } else if (testCase.category === "team_files") {
        errorEval = {
          type: "team_files",
          memory_usage: { score: 0, reason: "Error" },
          information_accuracy: { score: 0, reason: "Error" },
          natural_presentation: { score: 0, reason: "Error" },
          answer_completeness: { score: 0, reason: "Error" },
          tone_match: { score: 0, reason: "Error" },
          overall_feedback: `Error: ${error}`,
        };
      } else {
        errorEval = {
          type: "standard",
          brevity: { score: 0, reason: "Error" },
          tone: { score: 0, reason: "Error" },
          formatting: { score: 0, reason: "Error" },
          personality: { score: 0, reason: "Error" },
          helpfulness: { score: 0, reason: "Error" },
          overall_feedback: `Error: ${error}`,
        };
      }
      results.push({
        testCase,
        response: `ERROR: ${error}`,
        evaluation: errorEval,
        weightedScore: 0,
        durationMs: 0,
      });
    }
  }

  return results;
}

function printSummary(results: TestResult[]) {
  console.log("\n" + "=".repeat(60));
  console.log("EVALUATION SUMMARY");
  console.log("=".repeat(60));

  // Overall stats
  const validResults = results.filter((r) => r.weightedScore > 0);
  const avgScore =
    validResults.reduce((sum, r) => sum + r.weightedScore, 0) / validResults.length;

  console.log(`\nOverall Average Score: ${avgScore.toFixed(2)}/5`);
  console.log(`Tests Run: ${results.length}`);
  console.log(`Tests Passed (≥3.5): ${validResults.filter((r) => r.weightedScore >= 3.5).length}`);
  console.log(`Tests Failed (<3.5): ${validResults.filter((r) => r.weightedScore < 3.5).length}`);

  // By category
  console.log("\nScores by Category:");
  const categories = [...new Set(results.map((r) => r.testCase.category))];
  for (const category of categories) {
    const categoryResults = validResults.filter((r) => r.testCase.category === category);
    const categoryAvg =
      categoryResults.reduce((sum, r) => sum + r.weightedScore, 0) / categoryResults.length;
    console.log(`  ${category}: ${categoryAvg.toFixed(2)}/5`);
  }

  // By criterion (separated by eval type)
  const standardResults = validResults.filter((r) => r.evaluation.type === "standard");
  const youtubeResults = validResults.filter((r) => r.evaluation.type === "youtube");
  const tbaResults = validResults.filter((r) => r.evaluation.type === "tba");
  const teamFilesResults = validResults.filter((r) => r.evaluation.type === "team_files");

  if (standardResults.length > 0) {
    console.log("\nScores by Criterion (Standard):");
    const standardCriteria = ["brevity", "tone", "formatting", "personality", "helpfulness"] as const;
    for (const criterion of standardCriteria) {
      const criterionAvg =
        standardResults.reduce((sum, r) => {
          const eval_ = r.evaluation as StandardEvalResult;
          return sum + eval_[criterion].score;
        }, 0) / standardResults.length;
      console.log(`  ${criterion}: ${criterionAvg.toFixed(2)}/5`);
    }
  }

  if (youtubeResults.length > 0) {
    console.log("\nScores by Criterion (YouTube Video Understanding):");
    const youtubeCriteria = ["content_specificity", "answer_relevance", "depth_of_understanding", "concision", "tone_match"] as const;
    for (const criterion of youtubeCriteria) {
      const criterionAvg =
        youtubeResults.reduce((sum, r) => {
          const eval_ = r.evaluation as YouTubeEvalResult;
          return sum + eval_[criterion].score;
        }, 0) / youtubeResults.length;
      const displayName = criterion.replace(/_/g, " ");
      console.log(`  ${displayName}: ${criterionAvg.toFixed(2)}/5`);
    }
  }

  if (tbaResults.length > 0) {
    console.log("\nScores by Criterion (TBA Data Queries):");
    const tbaCriteria = ["natural_presentation", "data_accuracy", "answer_relevance", "tone_match", "brevity"] as const;
    for (const criterion of tbaCriteria) {
      const criterionAvg =
        tbaResults.reduce((sum, r) => {
          const eval_ = r.evaluation as TBAEvalResult;
          return sum + eval_[criterion].score;
        }, 0) / tbaResults.length;
      const displayName = criterion.replace(/_/g, " ");
      console.log(`  ${displayName}: ${criterionAvg.toFixed(2)}/5`);
    }
  }

  if (teamFilesResults.length > 0) {
    console.log("\nScores by Criterion (Team Files Memory):");
    const teamFilesCriteria = ["memory_usage", "information_accuracy", "natural_presentation", "answer_completeness", "tone_match"] as const;
    for (const criterion of teamFilesCriteria) {
      const criterionAvg =
        teamFilesResults.reduce((sum, r) => {
          const eval_ = r.evaluation as TeamFilesEvalResult;
          return sum + eval_[criterion].score;
        }, 0) / teamFilesResults.length;
      const displayName = criterion.replace(/_/g, " ");
      console.log(`  ${displayName}: ${criterionAvg.toFixed(2)}/5`);
    }
  }

  // Worst performers
  console.log("\nLowest Scoring Tests:");
  const sorted = [...validResults].sort((a, b) => a.weightedScore - b.weightedScore);
  for (const result of sorted.slice(0, 3)) {
    console.log(
      `  ${result.weightedScore.toFixed(2)} - ${result.testCase.name}: ${result.evaluation.overall_feedback}`
    );
  }

  // Best performers
  console.log("\nHighest Scoring Tests:");
  for (const result of sorted.slice(-3).reverse()) {
    console.log(
      `  ${result.weightedScore.toFixed(2)} - ${result.testCase.name}: ${result.evaluation.overall_feedback}`
    );
  }
}

async function main() {
  console.log("🤖 IBOT Agent Evaluation\n");
  console.log("This will run the agent through various test scenarios");
  console.log("and evaluate responses for personality and quality.\n");

  // Parse command line args
  const args = process.argv.slice(2);
  let testCases = TEST_CASES;

  // Filter by category if specified
  const categoryArg = args.find((a) => a.startsWith("--category="));
  if (categoryArg) {
    const category = categoryArg.split("=")[1];
    testCases = testCases.filter((t) => t.category === category);
    console.log(`Filtering to category: ${category}`);
  }

  // Limit number of tests if specified
  const limitArg = args.find((a) => a.startsWith("--limit="));
  if (limitArg) {
    const limit = parseInt(limitArg.split("=")[1]);
    testCases = testCases.slice(0, limit);
    console.log(`Limiting to ${limit} tests`);
  }

  console.log(`Running ${testCases.length} tests...\n`);

  const results = await runEval(testCases);
  printSummary(results);
}

main().catch(console.error);
