import { createBashTool } from "bash-tool";
import fs from "fs";
import path from "path";

// Cache the tools so we don't recreate the sandbox on every call
let cachedTools: Awaited<ReturnType<typeof createBashTool>>["tools"] | null = null;

/**
 * Load all manual files from the manual directory
 */
function loadManualFiles(): Record<string, string> {
  const manualDir = path.join(process.cwd(), "manual");
  const files: Record<string, string> = {};

  try {
    const manualFiles = fs.readdirSync(manualDir).filter((f) => f.endsWith(".md"));

    for (const file of manualFiles) {
      const filePath = path.join(manualDir, file);
      const content = fs.readFileSync(filePath, "utf-8");
      // Store in a team-files directory structure
      files[`team-files/manual/${file}`] = content;
    }
  } catch (error) {
    console.error("Failed to load manual files:", error);
  }

  // Add a README to help the agent understand the file structure
  files["team-files/README.md"] = `# Team Files

This directory contains team materials and resources.

## Structure

- \`manual/\` - FRC Game Manual sections for the 2026 REBUILT game
  - \`introduction.md\` - About FIRST, Core Values, Gracious Professionalism
  - \`first-season-overview.md\` - Season timeline and key dates
  - \`game-overview.md\` - Quick overview of the REBUILT game
  - \`game-details.md\` - Detailed game mechanics, scoring, DRIVE TEAM roles
  - \`arena.md\` - FIELD dimensions and ARENA elements
  - \`game-rules-(g).md\` - Game rules (safety, conduct, gameplay)
  - \`robot-construction-rules-(r).md\` - ROBOT building rules and constraints
  - \`inspection-and-eligibility-(i).md\` - Inspection requirements
  - \`tournaments-(t).md\` - Tournament structure and procedures
  - \`district-tournaments.md\` - District event details
  - \`first-championship-tournament-(c).md\` - Championship details
  - \`event-rules-(e).md\` - Event-specific rules
  - \`glossary.md\` - Definitions of FRC terms (ROBOT, ALLIANCE, MATCH, etc.)

## Usage Tips

- Use \`grep -r "search term" team-files/\` to search across all files
- Use \`cat team-files/manual/glossary.md\` to look up term definitions
- Use \`ls team-files/manual/\` to see all available manual sections
`;

  return files;
}

/**
 * Get or create the bash tools with team files loaded
 */
export async function getTeamFilesTools() {
  if (cachedTools) {
    return cachedTools;
  }

  const files = loadManualFiles();

  const { tools } = await createBashTool({
    files,
  });

  cachedTools = tools;
  return tools;
}

/**
 * Create the team files search tool for the agent
 */
export async function createTeamFilesTool() {
  const bashTools = await getTeamFilesTools();
  return bashTools.bash;
}
