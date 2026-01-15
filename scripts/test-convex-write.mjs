/**
 * Test script to verify Convex write operations
 */

import { ConvexHttpClient } from "convex/browser";

const convexUrl = process.env.NEXT_PUBLIC_CONVEX_URL;

if (!convexUrl) {
  console.error("❌ NEXT_PUBLIC_CONVEX_URL not set!");
  console.log("Set it with: export NEXT_PUBLIC_CONVEX_URL=https://your-convex-url.convex.cloud");
  process.exit(1);
}

console.log("🧪 Testing Convex Write Operations\n");
console.log("Convex URL:", convexUrl);

const convex = new ConvexHttpClient(convexUrl);

// We need to import the api from the generated files
// Since this is ESM, we need to dynamically import
const { api } = await import("../convex/_generated/api.js");

const TEST_TEAM_ID = "test-team-convex-write-" + Date.now();

async function testConvexWrite() {
  console.log("\n1️⃣ Testing write to Convex...");
  console.log("Team ID:", TEST_TEAM_ID);
  
  const testFiles = [
    { path: "team-files/notes/test.md", content: "This is a test file" },
    { path: "team-files/notes/another.md", content: "Another test file" },
  ];
  
  console.log("Files to save:", testFiles);
  
  try {
    console.log("\nCalling convex.mutation...");
    const result = await convex.mutation(api.teamFiles.saveState, {
      teamId: TEST_TEAM_ID,
      files: testFiles,
    });
    console.log("Mutation result:", result);
    console.log("✅ Write succeeded!");
  } catch (error) {
    console.error("❌ Write failed:", error);
    return false;
  }
  
  console.log("\n2️⃣ Verifying data was saved...");
  try {
    const state = await convex.query(api.teamFiles.getState, { 
      teamId: TEST_TEAM_ID 
    });
    console.log("Query result:", JSON.stringify(state, null, 2));
    
    if (state && state.files && state.files.length === 2) {
      console.log("✅ Data verified! Found", state.files.length, "files");
    } else {
      console.log("❌ Data verification failed - unexpected state");
      return false;
    }
  } catch (error) {
    console.error("❌ Query failed:", error);
    return false;
  }
  
  console.log("\n3️⃣ Cleaning up test data...");
  try {
    await convex.mutation(api.teamFiles.clearState, { 
      teamId: TEST_TEAM_ID 
    });
    console.log("✅ Cleanup succeeded!");
  } catch (error) {
    console.error("❌ Cleanup failed:", error);
  }
  
  return true;
}

const success = await testConvexWrite();

console.log("\n" + "=".repeat(50));
if (success) {
  console.log("✅ All Convex operations working correctly!");
} else {
  console.log("❌ Convex operations have issues!");
}
