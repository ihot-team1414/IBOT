import { createBashTool } from "bash-tool";
import fs from "fs";
import path from "path";
import { loadFilesystemState } from "@/lib/memory";

// Load base manual files from disk (read-only baseline)
function loadManualFiles(): Record<string, string> {
  const manualDir = path.join(process.cwd(), "manual");
  const files: Record<string, string> = {};

  try {
    const manualFiles = fs.readdirSync(manualDir).filter((f) => f.endsWith(".md"));
    for (const file of manualFiles) {
      const filePath = path.join(manualDir, file);
      const content = fs.readFileSync(filePath, "utf-8");
      files[`team-files/manual/${file}`] = content;
    }
  } catch (error) {
    console.error("Failed to load manual files:", error);
  }

  return files;
}

// Generate README content
function generateReadme(): string {
  return `# Team Files

This directory contains team materials and resources.

## Structure

- \`manual/\` - FRC Game Manual sections for the 2026 REBUILT game (read-only)
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
  - \`glossary.md\` - Definitions of FRC terms

- \`notes/\` - Team notes and persistent storage (read/write)
  - Create files here to save information across conversations
  - This data persists between conversations!

## Usage Tips

- \`grep -r "search term" team-files/\` - Search across all files
- \`cat team-files/manual/glossary.md\` - Look up term definitions
- \`ls team-files/notes/\` - See saved team notes
- \`echo "content" > team-files/notes/myfile.md\` - Save a note
- \`cat team-files/notes/myfile.md\` - Read a saved note
`;
}

// Result type for the tool with memory
export interface TeamFilesToolResult {
  tools: Awaited<ReturnType<typeof createBashTool>>["tools"];
  getFiles: () => Promise<Record<string, string>>;
}

/**
 * Create team files tool with memory support
 * Loads stored state from Convex and merges with base manual files
 */
export async function createTeamFilesToolWithMemory(
  config: { teamId: string }
): Promise<TeamFilesToolResult> {
  // 1. Load base manual files (always fresh from disk)
  const manualFiles = loadManualFiles();

  // 2. Load stored user files from Convex
  const storedFiles = await loadFilesystemState(config.teamId);

  // 3. Merge: manual files + stored user files + README
  const allFiles: Record<string, string> = {
    ...manualFiles,
    ...storedFiles,
    "team-files/README.md": generateReadme(),
    // Ensure notes directory exists with a placeholder if empty
    "team-files/notes/.gitkeep": "",
  };

  // 4. Create bash tool with merged files
  const bashToolResult = await createBashTool({
    files: allFiles,
  });

  // 5. Create getFiles function that reads current state from sandbox
  // Note: bash-tool uses /workspace as working directory, so paths are relative to that
  const getFiles = async (): Promise<Record<string, string>> => {
    const files: Record<string, string> = {};
    const { sandbox } = bashToolResult;

    try {
      // Find all files in the notes directory (relative to /workspace working dir)
      const findResult = await sandbox.executeCommand(
        'find team-files/notes -type f 2>/dev/null || true'
      );

      if (findResult.stdout.trim()) {
        const filePaths = findResult.stdout.trim().split('\n').filter(Boolean);

        for (const relativePath of filePaths) {
          try {
            const content = await sandbox.readFile(relativePath);
            // Skip empty placeholder files
            if (content || !relativePath.endsWith('.gitkeep')) {
              files[relativePath] = content;
            }
          } catch (err) {
            console.error(`Failed to read file ${relativePath}:`, err);
          }
        }
      }
    } catch (error) {
      console.error("Failed to get files from sandbox:", error);
    }

    return files;
  };

  return {
    tools: bashToolResult.tools,
    getFiles,
  };
}

// Keep legacy function for backwards compatibility (but deprecated)
/** @deprecated Use createTeamFilesToolWithMemory instead */
export async function getTeamFilesTools() {
  const manualFiles = loadManualFiles();
  const { tools } = await createBashTool({
    files: {
      ...manualFiles,
      "team-files/README.md": generateReadme(),
    },
  });
  return tools;
}
