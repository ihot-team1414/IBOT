import { convex, api } from "./convex";

// Convert Convex array format to Record format
function arrayToRecord(files: { path: string; content: string }[]): Record<string, string> {
  const record: Record<string, string> = {};
  for (const file of files) {
    record[file.path] = file.content;
  }
  return record;
}

// Convert Record format to Convex array format
function recordToArray(files: Record<string, string>): { path: string; content: string }[] {
  return Object.entries(files).map(([path, content]) => ({ path, content }));
}

// Filter to only user files (in notes directory)
export function extractUserFiles(files: Record<string, string>): Record<string, string> {
  const userFiles: Record<string, string> = {};
  for (const [path, content] of Object.entries(files)) {
    if (path.startsWith("team-files/notes/")) {
      userFiles[path] = content;
    }
  }
  return userFiles;
}

// Load stored user files from Convex
export async function loadFilesystemState(teamId: string): Promise<Record<string, string>> {
  if (!convex) {
    console.warn("Convex client not initialized - returning empty state");
    return {};
  }

  try {
    const state = await convex.query(api.teamFiles.getState, { teamId });
    
    if (!state) {
      return {}; // No stored state yet
    }
    
    return arrayToRecord(state.files);
  } catch (error) {
    console.error("Failed to load filesystem state:", error);
    return {};
  }
}

// Save user files to Convex
export async function saveFilesystemState(
  teamId: string, 
  files: Record<string, string>
): Promise<void> {
  if (!convex) {
    console.warn("Convex client not initialized - skipping save");
    return;
  }

  try {
    // Only save user files (notes directory)
    const userFiles = extractUserFiles(files);
    
    await convex.mutation(api.teamFiles.saveState, {
      teamId,
      files: recordToArray(userFiles),
    });
  } catch (error) {
    console.error("Failed to save filesystem state:", error);
    throw error;
  }
}

// Clear stored state for a team
export async function clearFilesystemState(teamId: string): Promise<void> {
  if (!convex) {
    console.warn("Convex client not initialized - skipping clear");
    return;
  }

  try {
    await convex.mutation(api.teamFiles.clearState, { teamId });
  } catch (error) {
    console.error("Failed to clear filesystem state:", error);
    throw error;
  }
}
