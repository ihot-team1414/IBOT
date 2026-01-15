/**
 * Direct test of the AI agent without Slack API calls
 * This tests that the agent can process a query and generate a response
 */

import { runAgent } from "../lib/agent";

async function main() {
  console.log("🤖 Direct Agent Test with Memory\n");

  const TEST_TEAM_ID = "test-team-123";

  const testCases = [
    {
      name: "Memory - Save Note",
      query: "Remember that we decided to use a 6-wheel west coast drive. Save this to our notes.",
      context: "",
    },
    {
      name: "Memory - Recall Note",
      query: "What drivetrain did we decide on? Check our notes.",
      context: "",
    },
    {
      name: "Team Files - Game Manual Query",
      query: "What are the BUMPER requirements? Cite the specific rules.",
      context: "",
    },
  ];

  for (const testCase of testCases) {
    console.log(`\n📝 Test: ${testCase.name}`);
    console.log(`Query: "${testCase.query}"`);

    try {
      const startTime = Date.now();
      const response = await runAgent(testCase.query, testCase.context, {
        teamId: TEST_TEAM_ID,
      });
      const elapsed = ((Date.now() - startTime) / 1000).toFixed(2);

      console.log("✅ Response received in", elapsed, "seconds:");
      console.log("-------------------------------------------");
      console.log(response);
      console.log("-------------------------------------------\n");
    } catch (error) {
      console.error("❌ Error:", error);
    }
  }
}

main();
