/**
 * Agent Evaluation Script
 * Tests agent personality, response quality, and formatting against defined criteria
 *
 * Usage: npx tsx scripts/eval-agent.ts
 */

import { generateText } from "ai";
import { anthropic } from "@ai-sdk/anthropic";
import { runAgent } from "../lib/agent";

const TEST_TEAM_ID = "eval-team";

// ============================================================================
// Test Cases
// ============================================================================

interface TestCase {
  name: string;
  category: "brevity" | "tone" | "formatting" | "knowledge" | "personality" | "chief_delphi";
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

// ============================================================================
// Evaluation Logic
// ============================================================================

interface CriterionScore {
  score: number;
  reason: string;
}

interface EvalResult {
  brevity: CriterionScore;
  tone: CriterionScore;
  formatting: CriterionScore;
  personality: CriterionScore;
  helpfulness: CriterionScore;
  overall_feedback: string;
}

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
  const prompt = EVALUATION_PROMPT.replace("{category}", testCase.category)
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

  return JSON.parse(jsonMatch[0]) as EvalResult;
}

function calculateWeightedScore(evaluation: EvalResult): number {
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
      // Run the agent
      const startTime = Date.now();
      const response = await runAgent(testCase.query, testCase.context || "", {
        teamId: TEST_TEAM_ID,
      });
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
      console.log(`  Brevity:     ${evaluation.brevity.score}/5 - ${evaluation.brevity.reason}`);
      console.log(`  Tone:        ${evaluation.tone.score}/5 - ${evaluation.tone.reason}`);
      console.log(`  Formatting:  ${evaluation.formatting.score}/5 - ${evaluation.formatting.reason}`);
      console.log(`  Personality: ${evaluation.personality.score}/5 - ${evaluation.personality.reason}`);
      console.log(`  Helpfulness: ${evaluation.helpfulness.score}/5 - ${evaluation.helpfulness.reason}`);
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
      results.push({
        testCase,
        response: `ERROR: ${error}`,
        evaluation: {
          brevity: { score: 0, reason: "Error" },
          tone: { score: 0, reason: "Error" },
          formatting: { score: 0, reason: "Error" },
          personality: { score: 0, reason: "Error" },
          helpfulness: { score: 0, reason: "Error" },
          overall_feedback: `Error: ${error}`,
        },
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

  // By criterion
  console.log("\nScores by Criterion:");
  const criteria = ["brevity", "tone", "formatting", "personality", "helpfulness"] as const;
  for (const criterion of criteria) {
    const criterionAvg =
      validResults.reduce((sum, r) => sum + r.evaluation[criterion].score, 0) /
      validResults.length;
    console.log(`  ${criterion}: ${criterionAvg.toFixed(2)}/5`);
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
