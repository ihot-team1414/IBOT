/**
 * Direct test of the AI agent without Slack API calls
 * This tests that the agent can process a query and generate a response
 */

import { runAgent } from "../lib/agent";

async function main() {
  console.log("🤖 Direct Agent Test\n");
  console.log("Testing the AI agent with team files...\n");
  console.log("-------------------------------------------\n");

  const testCases = [
    {
      name: "Team Files - Game Manual Query",
      query: "What are the BUMPER requirements for this year's robot? Please cite the specific rules.",
      context: "",
    },
    {
      name: "Team Files - Glossary Lookup",
      query: "What does COTS mean in FRC? Look it up in the manual.",
      context: "",
    },
    {
      name: "Team Files - Game Rules",
      query: "What happens if a team member steps over the guardrail? What's the penalty?",
      context: "",
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
