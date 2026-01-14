/**
 * Direct test of the AI agent without Slack API calls
 * This tests that the agent can process a query and generate a response
 */

import { runAgent } from "../lib/agent";

async function main() {
  console.log("🤖 Direct Agent Test\n");
  console.log("Testing the AI agent without Slack API...\n");
  console.log("-------------------------------------------\n");

  const testCases = [
    {
      name: "Simple FRC Question",
      query: "What is FRC?",
      context: "",
    },
    {
      name: "With Context",
      query: "Can you help me understand this?",
      context: `[1/13/2026, 10:00 AM] Alice: Hey team, we need to decide on our drivetrain
[1/13/2026, 10:01 AM] Bob: I think we should go with swerve drive this year
[1/13/2026, 10:02 AM] Alice: What are the pros and cons?`,
    },
  ];

  for (const testCase of testCases) {
    console.log(`\n📝 Test: ${testCase.name}`);
    console.log(`Query: "${testCase.query}"`);
    if (testCase.context) {
      console.log(`Context:\n${testCase.context}`);
    }
    console.log("\n⏳ Generating response...\n");

    try {
      const startTime = Date.now();
      const response = await runAgent(testCase.query, testCase.context);
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
