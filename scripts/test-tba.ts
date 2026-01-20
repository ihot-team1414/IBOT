/**
 * Quick test script for TBA integration
 * Run with: source .env && pnpm tsx scripts/test-tba.ts
 */

import { getTBAClient } from "../lib/tba/client";

async function main() {
  console.log("Testing TBA Integration...\n");

  const client = getTBAClient();

  // Test 1: Get team info
  console.log("1. Team info for 1414...");
  const team = await client.getTeam(1414);
  console.log(`   ${team.team_number}: ${team.nickname} (${team.city}, ${team.state_prov})\n`);

  // Test 2: Get team info for 254
  console.log("2. Team info for 254...");
  const team254 = await client.getTeam(254);
  console.log(`   ${team254.team_number}: ${team254.nickname} (${team254.city}, ${team254.state_prov})\n`);

  // Test 3: Get team events
  const year = new Date().getFullYear();
  console.log(`3. Events for 1414 in ${year}...`);
  const events = await client.getTeamEvents(1414, year);
  if (events.length > 0) {
    for (const event of events.slice(0, 3)) {
      console.log(`   - ${event.name} (${event.key})`);
    }
  } else {
    console.log(`   No events yet for ${year}`);
  }
  console.log();

  // Test 4: District rankings
  const districtKey = `${year}pch`;
  console.log(`4. PCH district rankings (${districtKey})...`);
  try {
    const rankings = await client.getDistrictRankings(districtKey);
    if (rankings.length > 0) {
      console.log(`   Top 3 of ${rankings.length} teams:`);
      for (const r of rankings.slice(0, 3)) {
        console.log(`   ${r.rank}. ${r.team_key.replace("frc", "")} - ${r.point_total} pts`);
      }
    }
  } catch {
    console.log(`   Not available yet`);
  }

  console.log("\n✅ TBA integration working!");
}

main().catch((error) => {
  console.error("Error:", error.message);
  process.exit(1);
});
